import PgPromise from "pg-promise";

import { config } from "@/config/index";

export const pgp = PgPromise();

// Database connection for external public-facing APIs
export const edb = pgp({
  connectionString: config.databaseUrl + "?sslmode=require",
  keepAlive: true,
  max: 15,
  connectionTimeoutMillis: 10 * 1000,
  query_timeout: 10 * 1000,
  statement_timeout: 10 * 1000,
  allowExitOnIdle: true,
  ssl: {
    rejectUnauthorized: false
  }
});

// Database connection for internal processes/APIs
export const idb = pgp({
  connectionString: config.databaseUrl + "?sslmode=require",
  keepAlive: true,
  max: 15,
  connectionTimeoutMillis: 30 * 1000,
  query_timeout: 5 * 60 * 1000,
  statement_timeout: 5 * 60 * 1000,
  allowExitOnIdle: true,
  ssl: {
    rejectUnauthorized: false
  }
});

// Database connection for external public-facing APIs using a read replica DB
export const redb = pgp({
  connectionString: config.readReplicaDatabaseUrl + "?sslmode=require",
  keepAlive: true,
  max: 30,
  connectionTimeoutMillis: 30 * 1000,
  query_timeout: 5 * 60 * 1000,
  statement_timeout: 5 * 60 * 1000,
  allowExitOnIdle: true,
  ssl: {
    rejectUnauthorized: false
  }
});

// Common types

export type PgPromiseQuery = {
  query: string;
  values?: object;
};
