import { eq } from "drizzle-orm";
import { FAMILY_CIRCLE_ID } from "@/lib/demo/cast";
import { getConn } from "./client";
import * as s from "./schema";
import { seedDemo } from "./seed-core";

/** pnpm db:seed [--if-empty]. With --if-empty (used on deploy boot) an existing demo is kept as it is. */
async function main() {
  const { db, sql } = getConn();
  const [existing] = await db.select({ id: s.circles.id }).from(s.circles).where(eq(s.circles.id, FAMILY_CIRCLE_ID));
  if (existing && process.argv.includes("--if-empty")) console.log("demo already seeded; kept");
  else {
    await seedDemo(db);
    console.log("seeded demo data");
  }
  const { seedHistory } = await import("@/lib/demo/history");
  const h = await seedHistory();
  console.log(h.skipped ? "history already seeded" : "seeded historical circles");
  await sql.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
