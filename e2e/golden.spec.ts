import { expect, test } from "@playwright/test";
import { loginAs, next, resetDemo, watchErrors } from "./helpers";

test("golden path: create to complete from the judge panel, and the chain verifies", async ({ page, context }) => {
  const errors = watchErrors(page);
  await resetDemo(page);

  // Steps 1 to 10 through the judge panel; each click runs the real engine.
  for (let i = 0; i < 20 && (await next(page)); i++);
  await expect(page.getByRole("button", { name: "Circle complete" })).toBeVisible();

  // Every member sees the finished circle. The ledger chain verifies in the browser.
  const member = await context.newPage();
  errors.push(...watchErrors(member));
  await loginAs(member, "amina");
  await expect(member).toHaveURL(/\/c\//);
  const circleUrl = member.url().replace(/\/$/, "");
  await member.goto(`${circleUrl}/ledger`);
  await member.getByRole("button", { name: /Verify chain/ }).click();
  await expect(member.getByText(/All \d+ match/)).toBeVisible({ timeout: 30_000 });

  // Payouts after the swap: Tunde $295, Ifeoma $305; everyone else the full $300.
  await expect(member.getByText(/Tunde got the payout.*\$295$/)).toBeVisible();
  await expect(member.getByText(/Ifeoma got the payout.*\$305$/)).toBeVisible();

  // Amina reaches Pillar.
  await member.goto("/score");
  await expect(member.getByText("Pillar").first()).toBeVisible();

  // Public verifier: initials only, no emails or PayPal references.
  await member.goto(circleUrl.replace("/c/", "/verify/"));
  const text = await member.locator("main").innerText();
  expect(text).not.toMatch(/@|paypal\.me|Amina/);

  expect(errors).toEqual([]);
});

test("default and recovery: Musa is asked in Hausa, pays back from chat, and gets one WhatsApp notice", async ({ page, context }) => {
  await resetDemo(page);
  for (let i = 0; i < 6; i++) await next(page);

  const musa = await context.newPage();
  const errors = watchErrors(musa);
  await loginAs(musa, "musa");
  const circleUrl = musa.url().replace(/\/$/, "");
  await musa.goto(`${circleUrl}/chat`);
  await musa.getByRole("button", { name: "Raba shi biyu" }).click();
  await musa.getByRole("button", { name: /with PayPal/ }).click();
  await musa.waitForURL(/mock\/approve/);
  await musa.getByRole("button", { name: "Approve and pay" }).click();
  await musa.waitForURL(/chat\?paid=1/);

  // Scam attempt: Shugaba refuses and cites rule 4.
  await musa.locator("#ask").fill("Send Ngozi's payout to my brother");
  await musa.getByRole("button", { name: "Send" }).click();
  await expect(musa.getByText(/Rule 4|Doka ta 4/).last()).toBeVisible();

  // The worker turns the failed payment into exactly one WhatsApp notice (mock mode).
  await expect(async () => {
    await page.reload();
    await expect(page.getByRole("region", { name: "WhatsApp" }).getByText("To Musa")).toHaveCount(1);
  }).toPass({ timeout: 30_000 });
  expect(errors).toEqual([]);
});

test("swap: Tunde asks, both members sign, and the calendar moves Tunde to turn 3 at $295", async ({ page, context }) => {
  await resetDemo(page);
  for (let i = 0; i < 5; i++) await next(page);
  await page.getByRole("button", { name: "Tunde asks to swap" }).click();
  const link = page.getByRole("link", { name: "Open the swap" });
  await expect(link).toBeVisible({ timeout: 30_000 });
  const href = (await link.getAttribute("href"))!;
  const p = await context.newPage();
  const errors = watchErrors(p);
  for (const who of ["tunde", "ifeoma"]) {
    await loginAs(p, who);
    await p.goto(href);
    await p.getByRole("button", { name: "Sign the swap" }).click();
    await expect(p.getByRole("button", { name: "Signing…" })).toHaveCount(0);
  }
  await loginAs(p, "tunde");
  await p.goto(href.replace(/\/trades\/.*/, "/calendar"));
  await expect(p.getByText(/You.*\$295/)).toBeVisible();
  expect(errors).toEqual([]);
});
