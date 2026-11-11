import { paypalStatus } from "@/lib/paypal";
import { tryPayPalNow } from "./paypal-actions";

/** Design GStates "PayPal down": calm, specific, and clear that no money moved. Shown on every page while it lasts. */
export function PayPalDownBar() {
  const st = paypalStatus();
  if (!st.down) return null;
  return (
    <div role="status" className="sticky top-0 z-40 border-b border-line bg-surface px-4 py-3">
      <div className="mx-auto flex max-w-[880px] flex-wrap items-center gap-x-4 gap-y-2">
        <p className="flex-1 text-[15px]">
          <span className="font-extrabold italic">PayPal</span> <b>isn&apos;t answering.</b> Nothing was charged. I&apos;ll try again in a couple of minutes and tell you when it&apos;s done.
        </p>
        <form action={tryPayPalNow}>
          <button className="h-9 rounded-[10px] bg-text px-3.5 text-[14px] font-bold text-white">Try now</button>
        </form>
        <a href="https://www.paypal-status.com/" target="_blank" rel="noopener" className="text-[14px] font-bold text-accent">See status</a>
      </div>
    </div>
  );
}
