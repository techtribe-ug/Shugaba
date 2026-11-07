import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import type { getConn } from "./client";

/**
 * Applies Drizzle table migrations, then the Supabase SQL (RLS, realtime). The Supabase files need the
 * `auth` schema, so they are skipped on a plain Postgres (CI, cloud dev containers).
 */
export async function runMigrations({ db, sql }: ReturnType<typeof getConn>, log: (s: string) => void = () => {}) {
  await migrate(db, { migrationsFolder: path.resolve("drizzle") });
  const [row] = await sql<{ exists: boolean }[]>`select exists(select 1 from pg_namespace where nspname = 'auth') as exists`;
  if (!row?.exists) {
    log("no auth schema: skipped supabase/migrations (RLS) on plain Postgres");
    return;
  }
  const dir = path.resolve("supabase/migrations");
  for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
    await sql.unsafe(await readFile(path.join(dir, f), "utf8"));
    log(`applied ${f}`);
  }
}
