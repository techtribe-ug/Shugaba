import { expect, type Page } from "@playwright/test";

/** Resets the demo from the judge panel and leaves the page on /judge. */
export async function resetDemo(page: Page) {
  await page.goto("/judge");
  page.once("dialog", (d) => d.accept());
  await page.getByRole("button", { name: "Reset" }).click();
  await expect(page.getByRole("button", { name: /^Next/ })).toBeEnabled();
  await expect(page.getByRole("status")).not.toHaveText("");
}

/** Clicks the judge panel's Next button and waits for the step to finish. */
export async function next(page: Page) {
  const btn = page.getByRole("button", { name: /^Next|Circle complete/ });
  const label = (await btn.textContent()) ?? "";
  if (/complete/.test(label)) return false;
  await btn.click();
  await expect(page.getByRole("button", { name: "Working…" })).toHaveCount(0, { timeout: 60_000 });
  await expect(page.getByRole("status")).not.toHaveText("");
  return true;
}

export async function loginAs(page: Page, key: string) {
  await page.goto(`/demo/as/${key}`);
}

/** Collects page errors and 5xx responses so a test can assert none happened. */
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("response", (r) => {
    if (r.status() >= 500) errors.push(`${r.status()} ${r.url()}`);
  });
  return errors;
}
