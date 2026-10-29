import { notFound } from "next/navigation";
import { btnPrimary, PayPalWord } from "@/components/ui/top-bar";

export const dynamic = "force-dynamic";

/** Stand-in for PayPal's approval page when PAYMENT_PROVIDER=mock. Never served with real PayPal. */
export default async function MockApprove({ searchParams }: { searchParams: Promise<{ order?: string }> }) {
  if (process.env.PAYMENT_PROVIDER === "paypal") notFound();
  const { order } = await searchParams;
  if (!order) notFound();
  return (
    <main className="mx-auto flex min-h-dvh max-w-[420px] flex-col justify-center gap-6 px-6 rise">
      <p className="text-[28px]"><PayPalWord /></p>
      <p className="text-[15px] text-muted">Sandbox mock. In the live demo this is PayPal&apos;s own page.</p>
      <p className="num text-sm text-muted">Order {order}</p>
      <form action="/paypal/order-return" method="get" className="flex flex-col gap-2">
        <input type="hidden" name="token" value={order} />
        <button className={btnPrimary}>Approve and pay</button>
      </form>
    </main>
  );
}
