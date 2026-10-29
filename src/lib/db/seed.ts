import { getConn } from "./client";
import { seedDemo } from "./seed-core";

async function main() {
  const { db, sql } = getConn();
  await seedDemo(db);
  console.log("seeded demo data");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
