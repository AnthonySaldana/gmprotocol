import * as Sdk from "@reservoir0x/sdk";
import {
  BaseBuilder,
  BaseBuildParams,
} from "@reservoir0x/sdk/dist/wyvern-v2.3/builders/base";

import { db } from "@/common/db";
import { logger } from "@/common/logger";
import { baseProvider } from "@/common/provider";
import { config } from "@/config/index";

export type BuildOrderOptions = {
  contract?: string;
  tokenId?: string;
  collection?: string;
  attributeKey?: string;
  attributeValue?: string;
  fee?: number;
  feeRecipient?: string;
  orderbook: string;
  maker: string;
  side: "buy" | "sell";
  price: string;
  listingTime?: number;
  expirationTime?: number;
  salt?: string;
};

export const buildOrder = async (options: BuildOrderOptions) => {
  try {
    const exchange = new Sdk.WyvernV23.Exchange(config.chainId);

    const buildParams: BaseBuildParams = {
      maker: options.maker,
      side: options.side,
      price: options.price,
      paymentToken:
        options.side === "buy"
          ? Sdk.Common.Addresses.Weth[config.chainId]
          : Sdk.Common.Addresses.Eth[config.chainId],
      fee: options.fee || 0,
      feeRecipient: options.feeRecipient || options.maker,
      listingTime: options.listingTime,
      expirationTime: options.expirationTime,
      salt: options.salt,
      nonce: await exchange.getNonce(baseProvider, options.maker),
    };

    let builder: BaseBuilder | undefined;
    if (options.contract && options.tokenId) {
      const { contract, tokenId } = options;

      const royalty = await db.one(
        `
          select
            "c"."royalty_bps",
            "c"."royalty_recipient"
          from "tokens" "t"
          join "collections" "c"
            on "t"."collection_id" = "c"."id"
          where "t"."contract" = $/contract/
            and "t"."token_id" = $/tokenId/
        `,
        { contract, tokenId }
      );

      if (
        buildParams.fee === 0 &&
        buildParams.feeRecipient === options.maker &&
        royalty.royalty_bps &&
        royalty.royalty_recipient
      ) {
        buildParams.fee = royalty.royalty_bps;
        buildParams.feeRecipient = royalty.royalty_recipient;
      }

      if (options.orderbook === "opensea") {
        buildParams.fee += 250;
        buildParams.feeRecipient = "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073";
      }

      const data = await db.oneOrNone(
        `
          select "c"."kind" from "tokens" "t"
          join "contracts" "c"
            on "t"."contract" = "c"."address"
          where "t"."contract" = $/contract/
            and "t"."token_id" = $/tokenId/
        `,
        { contract, tokenId }
      );

      (buildParams as any).contract = contract;
      (buildParams as any).tokenId = tokenId;

      if (data.kind === "erc721") {
        builder = new Sdk.WyvernV23.Builders.Erc721.SingleToken.V1(
          config.chainId
        );
      } else if (data.kind === "erc1155") {
        builder = new Sdk.WyvernV23.Builders.Erc1155.SingleToken.V1(
          config.chainId
        );
      }
    } else if (
      options.collection &&
      options.attributeKey &&
      options.attributeValue
    ) {
      const { collection, attributeKey, attributeValue } = options;

      const royalty = await db.one(
        `
          select
            "c"."royalty_bps",
            "c"."royalty_recipient"
          from "collections" "c"
          where "c"."id" = $/collection/
        `,
        { collection }
      );

      if (
        buildParams.fee === 0 &&
        buildParams.feeRecipient === options.maker &&
        royalty.royalty_bps &&
        royalty.royalty_recipient
      ) {
        buildParams.fee = royalty.royalty_bps;
        buildParams.feeRecipient = royalty.royalty_recipient;
      }

      if (options.orderbook === "opensea") {
        buildParams.fee += 250;
        buildParams.feeRecipient = "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073";
      }

      const data = await db.manyOrNone(
        `
          select
            "co"."kind",
            "a"."contract",
            "a"."token_id"
          from "attributes" "a"
          join "contracts" "co"
            on "a"."contract" = "co"."address"
          join "collections" "cl"
            on "a"."collection_id" = "cl"."id"
          where "a"."collection_id" = $/collection/
            and "a"."key" = $/attributeKey/
            and "a"."value" = $/attributeValue/
            and "cl"."token_set_id" is not null
        `,
        { collection, attributeKey, attributeValue }
      );

      if (
        data.length &&
        data.every(
          ({ kind, contract }) =>
            kind === data[0].kind && contract === data[0].contract
        )
      ) {
        const contract = data[0].contract;
        const kind = data[0].kind;

        (buildParams as any).contract = contract;
        (buildParams as any).tokenIds = data.map(({ token_id }) => token_id);

        if (kind === "erc721") {
          builder = new Sdk.WyvernV23.Builders.Erc721.TokenList(config.chainId);
        } else if (kind === "erc1155") {
          builder = new Sdk.WyvernV23.Builders.Erc1155.TokenList(
            config.chainId
          );
        }
      }
    } else if (
      options.collection &&
      !options.attributeKey &&
      !options.attributeValue
    ) {
      const { collection } = options;

      const royalty = await db.one(
        `
          select
            "c"."royalty_bps",
            "c"."royalty_recipient"
          from "collections" "c"
          where "c"."id" = $/collection/
        `,
        { collection }
      );

      if (
        buildParams.fee === 0 &&
        buildParams.feeRecipient === options.maker &&
        royalty.royalty_bps &&
        royalty.royalty_recipient
      ) {
        buildParams.fee = royalty.royalty_bps;
        buildParams.feeRecipient = royalty.royalty_recipient;
      }

      if (options.orderbook === "opensea") {
        buildParams.fee += 250;
        buildParams.feeRecipient = "0x5b3256965e7c3cf26e11fcaf296dfc8807c01073";
      }

      const data = await db.oneOrNone(
        `
          select
            "c"."token_set_id"
          from "collections" "c"
          where "c"."id" = $/collection/
        `,
        { collection }
      );

      if (data?.token_set_id?.startsWith("contract")) {
        // Collection is a full contract

        const contract = data.token_set_id.split(":")[1];
        (buildParams as any).contract = contract;

        const { kind } = await db.one(
          `
            select
              "c"."kind"
            from "contracts" "c"
            where "c"."address" = $/contract/
          `,
          { contract }
        );

        if (kind === "erc721") {
          builder = new Sdk.WyvernV23.Builders.Erc721.ContractWide(
            config.chainId
          );
        } else if (kind === "erc1155") {
          builder = new Sdk.WyvernV23.Builders.Erc1155.ContractWide(
            config.chainId
          );
        }
      } else if (data?.token_set_id?.startsWith("range")) {
        // Collection is a range of tokens within a contract

        const [contract, startTokenId, endTokenId] = data.token_set_id
          .split(":")
          .slice(1);
        (buildParams as any).contract = contract;
        (buildParams as any).startTokenId = startTokenId;
        (buildParams as any).endTokenId = endTokenId;

        const { kind } = await db.one(
          `
            select
              "c"."kind"
            from "contracts" "c"
            where "c"."address" = $/contract/
          `,
          { contract }
        );

        if (kind === "erc721") {
          builder = new Sdk.WyvernV23.Builders.Erc721.TokenRange(
            config.chainId
          );
        } else if (kind === "erc1155") {
          builder = new Sdk.WyvernV23.Builders.Erc1155.TokenRange(
            config.chainId
          );
        }
      }
    }

    return builder?.build(buildParams);
  } catch (error) {
    logger.error("wyvern_v2_order_build", `Failed to build order: ${error}`);
    return undefined;
  }
};
