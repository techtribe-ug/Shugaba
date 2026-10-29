import { getConn } from "./client";

/** Drops everything in the public schema and the drizzle schema. Local and demo use only. */
async function main() {
  const { sql } = getConn();
  if (process.env.NODE_ENV === "production" && process.env.DEMO_MODE !== "true") throw new Error("refusing to reset outside demo mode");
  await sql.unsafe("drop schema if exists drizzle cascade; drop schema if exists pgboss cascade; drop schema public cascade; create schema public;");
  // Supabase roles need schema access back after a reset.
  await sql.unsafe(`do $$ declare r text; begin
    foreach r in array array['anon','authenticated','service_role'] loop
      if exists (select 1 from pg_roles where rolname = r) then execute format('grant usage on schema public to %I', r); end if;
    end loop; end $$;`);
  console.log("database reset");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
