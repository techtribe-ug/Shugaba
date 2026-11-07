import { getConn } from "./client";
import { seedDemo } from "./seed-core";

async function main() {
  const { db, sql } = getConn();
  await seedDemo(db);
  console.log("seeded demo data");
  const { seedHistory } = await import("@/lib/demo/history");
  const h = await seedHistory();
  console.log(h.skipped ? "history already seeded" : "seeded historical circles");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
