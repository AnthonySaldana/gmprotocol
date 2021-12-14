import { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.dropMaterializedView("collection_stats");

  pgm.createMaterializedView(
    "collection_stats",
    {
      columns: [
        "collection_id",
        "token_count",
        "on_sale_count",
        "unique_owners_count",
        "sample_image",
        "floor_sell_hash",
        "floor_sell_value",
        "floor_sell_maker",
        "top_buy_hash",
        "top_buy_value",
        "top_buy_maker",
      ],
    },
    `
      select * from (
        select
          "t"."collection_id",
          count(distinct("t"."token_id")) as "token_count",
          count(distinct("t"."token_id")) filter (where "t"."floor_sell_value" is not null) as "on_sale_count",
          count(distinct("o"."owner")) filter (where "o"."amount" > 0) AS "unique_owners_count",
          max("t"."image") as "sample_image"
        from "tokens" "t"
        join "ownerships" "o"
          on "t"."contract" = "o"."contract"
          and "t"."token_id" = "o"."token_id"
        group by "t"."collection_id"
      ) "x"
      left join (
        select distinct on ("t"."collection_id")
          "t"."collection_id",
          "t"."floor_sell_hash",
          "t"."floor_sell_value",
          "o"."maker" as "floor_sell_maker"
        from "tokens" "t"
        join "orders" "o"
          on "t"."floor_sell_hash" = "o"."hash"
        order by "t"."collection_id", "t"."floor_sell_value"
      ) "y"
        on "x"."collection_id" = "y"."collection_id"
      left join (
        select distinct on ("ts"."collection_id")
          "ts"."collection_id",
          "o"."hash" as "top_buy_hash",
          "o"."value" as "top_buy_value",
          "o"."maker" as "top_buy_maker"
        from "orders" "o"
        join "token_sets" "ts"
          on "o"."token_set_id" = "ts"."id"
        where "ts"."collection_id" is not null
      ) "z"
        on "x"."collection_id" = "z"."collection_id"
    `
  );

  pgm.createIndex("collection_stats", "collection_id", { unique: true });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropIndex("collection_stats", "collection_id");

  pgm.dropMaterializedView("collection_stats");

  pgm.createMaterializedView(
    "collection_stats",
    {
      columns: [
        "collection_id",
        "token_count",
        "on_sale_count",
        "unique_owners_count",
        "sample_image",
        "floor_sell_value",
        "top_buy_value",
      ],
    },
    `
      select
        "t"."collection_id",
        count(distinct("t"."token_id")) as "token_count",
        count(distinct("t"."token_id")) filter (where "t"."floor_sell_value" is not null) as "on_sale_count",
        count(distinct("o"."owner")) filter (where "o"."amount" > 0) AS "unique_owners_count",
        max("t"."image") as "sample_image",
        min("t"."floor_sell_value") as "floor_sell_value",
        max("t"."top_buy_value") as "top_buy_value"
      from "tokens" "t"
      join "ownerships" "o"
        on "t"."contract" = "o"."contract"
        and "t"."token_id" = "o"."token_id"
      group by "t"."collection_id"
    `
  );

  pgm.createIndex("collection_stats", "collection_id", { unique: true });
}
