/* eslint-disable @typescript-eslint/no-explicit-any */

import { isAfter, add, formatISO9075 } from "date-fns";
import _ from "lodash";
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";

import { logger } from "@/common/logger";
import { OpenseaIndexerApi } from "@/utils/opensea-indexer-api";
import { Collections } from "@/models/collections";
import * as metadataIndexFetch from "@/jobs/metadata-index/fetch-queue";
import * as collectionUpdatesMetadata from "@/jobs/collection-updates/metadata-queue";
import * as Boom from "@hapi/boom";

const version = "v1";

export const postCollectionsRefreshV1Options: RouteOptions = {
  description: "Public API for anyone to refresh a collection's orders and metadata",
  tags: ["api", "4. NFT API"],
  plugins: {
    "hapi-swagger": {
      order: 61,
    },
  },
  validate: {
    payload: Joi.object({
      collection: Joi.string()
        .lowercase()
        .description(
          "Refresh the given collection, e.g. `0x8d04a8c79ceb0889bdd12acdf3fa9d207ed3ff63:1:2222`"
        )
        .required(),
    }),
  },
  response: {
    schema: Joi.object({
      message: Joi.string(),
    }).label(`postCollectionsRefresh${version.toUpperCase()}Response`),
    failAction: (_request, _h, error) => {
      logger.error(
        `post-collections-refresh-${version}-handler`,
        `Wrong response schema: ${error}`
      );
      throw error;
    },
  },
  handler: async (request: Request) => {
    const payload = request.payload as any;
    let refreshCoolDownMin = 60; // How many minutes between each refresh

    try {
      const collection = await Collections.getById(payload.collection);

      // If no collection found
      if (_.isNull(collection)) {
        throw Boom.badRequest(`Collection ${payload.collection} not found`);
      }

      // For big collections allow refresh once a day
      if (collection.tokenCount > 500000) {
        refreshCoolDownMin = 60 * 24;
      }

      // Check when the last sync was performed
      const nextAvailableSync = add(new Date(collection.lastMetadataSync), {
        minutes: refreshCoolDownMin,
      });
      if (!_.isNull(collection.lastMetadataSync) && isAfter(nextAvailableSync, Date.now())) {
        throw Boom.tooEarly(`Next available sync ${formatISO9075(nextAvailableSync)} UTC`);
      }

      // Update the last sync date
      const currentUtcTime = new Date().toISOString();
      await Collections.update(payload.collection, { lastMetadataSync: currentUtcTime });

      // Refresh contract orders from OpenSea
      await OpenseaIndexerApi.fastContractSync(collection.contract);

      // Refresh the collection tokens metadata
      await metadataIndexFetch.addToQueue(
        [
          {
            kind: "full-collection",
            data: {
              method: "opensea",
              collection: collection.id,
            },
          },
        ],
        true
      );

      // Refresh the collection metadata
      await collectionUpdatesMetadata.addToQueue(collection.contract);

      // Revalidate the contract orders
      // await orderFixes.addToQueue([{ by: "contract", data: { contract: collection.contract } }]);

      logger.info(
        `post-collections-refresh-${version}-handler`,
        `Refresh collection=${payload.collection} at ${currentUtcTime}`
      );

      return { message: "Request accepted" };
    } catch (error) {
      logger.error(`post-collections-refresh-${version}-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
