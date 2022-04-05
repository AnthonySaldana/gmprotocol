import _ from "lodash";

import { config } from "@/config/index";
import { idb } from "@/common/db";
import { SourcesEntity, SourcesEntityParams } from "@/models/sources/sources-entity";

import { default as sources } from "./sources.json";

export class Sources {
  public static getDefaultSource(sourceId: string): SourcesEntity {
    return new SourcesEntity({
      source_id: sourceId,
      metadata: {
        id: sourceId,
        name: "Reservoir",
        icon: "https://www.reservoir.market/reservoir.svg",
        urlMainnet: "https://www.reservoir.market/collections/${contract}/${tokenId}",
        urlRinkeby: "https://www.reservoir.fun/collections/${contract}/${tokenId}",
      },
    });
  }

  public static async syncSources() {
    _.forEach(sources, (metadata, sourceId) => {
      Sources.add(sourceId, metadata);
    });
  }

  public static async add(sourceId: string, metadata: object) {
    const query = `INSERT INTO sources (source_id, metadata)
                   VALUES ( $/sourceId/, $/metadata:json/)
                   ON CONFLICT DO NOTHING`;

    const values = {
      sourceId,
      metadata: metadata,
    };

    await idb.none(query, values);
  }

  public async get(sourceId: string, contract?: string, tokenId?: string) {
    let sourceEntity;
    const source: SourcesEntityParams | null = await idb.oneOrNone(
      `SELECT *
              FROM sources
              WHERE source_id = $/sourceId/`,
      {
        sourceId,
      }
    );

    if (!source) {
      sourceEntity = Sources.getDefaultSource(sourceId);
    } else {
      sourceEntity = new SourcesEntity(source);
    }

    if (config.chainId == 1) {
      if (sourceEntity.metadata.urlMainnet && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.urlMainnet,
          "${contract}",
          contract
        );

        sourceEntity.metadata.url = _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    } else {
      if (sourceEntity.metadata.urlRinkeby && contract && tokenId) {
        sourceEntity.metadata.url = _.replace(
          sourceEntity.metadata.urlRinkeby,
          "${contract}",
          contract
        );

        sourceEntity.metadata.url = _.replace(sourceEntity.metadata.url, "${tokenId}", tokenId);
      }
    }

    return sourceEntity;
  }

  public async set(sourceId: string, metadata: object) {
    const query = `UPDATE sources
                   SET metadata = $/metadata:json/
                   WHERE source_id = $/sourceId/`;

    const values = {
      id: sourceId,
      metadata: metadata,
    };

    await idb.none(query, values);
  }
}