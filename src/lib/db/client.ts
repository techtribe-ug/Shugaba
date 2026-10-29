import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export const DEFAULT_DATABASE_URL = "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

function make(url: string) {
  // Supabase's transaction pooler does not support prepared statements.
  const sqlClient = postgres(url, { max: 5, prepare: false, onnotice: () => {} });
  return { sql: sqlClient, db: drizzle(sqlClient, { schema }) };
}

type Conn = ReturnType<typeof make>;
const g = globalThis as unknown as { __shugabaDb?: Conn };

/** One pool per process (survives Next.js dev hot reloads). */
export function getConn(): Conn {
  if (!g.__shugabaDb) g.__shugabaDb = make(process.env.DATABASE_URL ?? DEFAULT_DATABASE_URL);
  return g.__shugabaDb;
}

export const db = () => getConn().db;
export type Db = Conn["db"];
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export { schema };
