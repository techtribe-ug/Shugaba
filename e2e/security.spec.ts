import { expect, test } from "@playwright/test";
import { loginAs } from "./helpers";

test("control tower: 403 for members, analyst answers the coverage question for operators", async ({ page }) => {
  await loginAs(page, "amina");
  const r = await page.goto("/ops");
  expect(r?.status()).toBe(403);
  await loginAs(page, "analyst");
  await page.goto("/ops");
  await page.getByRole("button", { name: "Which circles have pool coverage below 2 payouts?" }).click();
  await expect(page.getByText(/Circles whose pool covers/)).toBeVisible();
});

test("security headers are set", async ({ request }) => {
  const r = await request.get("/login");
  const h = r.headers();
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["x-content-type-options"]).toBe("nosniff");
});

test("webhooks reject bad signatures and malformed bodies", async ({ request }) => {
  const wa = await request.post("/api/webhooks/whatsapp", { data: { entry: [] }, headers: { "x-hub-signature-256": "sha256=00" } });
  expect(wa.status()).toBe(401);
  const pp = await request.post("/api/webhooks/paypal", { data: "{not json", headers: { "content-type": "application/json" } });
  expect(pp.status()).toBeGreaterThanOrEqual(400);
  expect(pp.status()).toBeLessThan(500);
});

test("no API response leaks private keys", async ({ page }) => {
  await loginAs(page, "amina");
  const circleUrl = page.url().replace(/\/$/, "");
  const id = circleUrl.split("/c/")[1];
  for (const path of ["/api/health", `/api/circles/${id}/ledger`]) {
    const body = await (await page.request.get(path)).text();
    expect(body).not.toMatch(/private_key_enc|privateKeyEnc/);
  }
});
