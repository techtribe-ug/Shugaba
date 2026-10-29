import { getConn } from "./client";
import { runMigrations } from "./migrate-core";

async function main() {
  const conn = getConn();
  await runMigrations(conn, console.log);
  console.log("migrations done");
  await conn.sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
