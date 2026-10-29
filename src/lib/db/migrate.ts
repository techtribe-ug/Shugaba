import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { getConn } from "./client";

/**
 * Applies Drizzle table migrations, then the Supabase SQL (RLS, realtime). The Supabase files need the
 * `auth` schema, so they are skipped on a plain Postgres (CI, cloud dev containers).
 */
async function main() {
  const { db, sql } = getConn();
  await migrate(db, { migrationsFolder: path.resolve("drizzle") });
  const [row] = await sql<{ exists: boolean }[]>`select exists(select 1 from pg_namespace where nspname = 'auth') as exists`;
  const exists = row?.exists ?? false;
  if (exists) {
    const dir = path.resolve("supabase/migrations");
    for (const f of (await readdir(dir)).filter((f) => f.endsWith(".sql")).sort()) {
      await sql.unsafe(await readFile(path.join(dir, f), "utf8"));
      console.log(`applied ${f}`);
    }
  } else {
    console.log("no auth schema: skipped supabase/migrations (RLS) on plain Postgres");
  }
  console.log("migrations done");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
