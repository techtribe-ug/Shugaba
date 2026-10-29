import { expect, test } from "@playwright/test";
import { loginAs, next, resetDemo, watchErrors } from "./helpers";

test("leave and join late: Tunde leaves before his turn, a newcomer takes the open seat", async ({ page, context }) => {
  await resetDemo(page);
  for (let i = 0; i < 5; i++) await next(page);

  const p = await context.newPage();
  const errors = watchErrors(p);
  await loginAs(p, "tunde");
  await p.goto("/settings");
  await p.getByRole("link", { name: "Leave Family Circle" }).click();
  await expect(p.getByText("Comes back to you")).toBeVisible();
  await p.getByRole("button", { name: /^Leave and get \$100 back/ }).click();
  await p.waitForURL(/\/home/);

  // The newcomer sees the held-back terms before signing.
  await loginAs(p, "analyst");
  await p.goto("/join/FAMILY26");
  const terms = p.getByRole("definition");
  await expect(terms.filter({ hasText: "−$100" })).toBeVisible();
  await expect(terms.filter({ hasText: "$200" })).toBeVisible();
  await p.getByRole("checkbox").click();
  await p.getByRole("button", { name: /Sign and connect/ }).click();
  await p.waitForURL(/\/c\//);
  await p.goto(`${p.url().replace(/\/$/, "")}/feed`);
  await expect(p.getByText("Tunde left the circle")).toBeVisible();
  await expect(p.getByText("Treasury analyst took the open seat")).toBeVisible();
  expect(errors).toEqual([]);
});
