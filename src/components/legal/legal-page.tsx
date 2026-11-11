import Link from "next/link";
import type { ReactNode } from "react";
import { BrandBar } from "@/components/ui/top-bar";

/** Shared layout for the public legal pages (linked from PayPal's consent screen). */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-[720px] px-4 py-11 sm:px-6 rise">
      <BrandBar label={title} right={<Link href="/login" className="text-[15px] font-bold text-accent">Log in</Link>} />
      <h1 className="text-[36px] font-bold leading-[1.1] tracking-tight">{title}</h1>
      <p className="mt-2 text-sm text-muted">Last updated {updated}</p>
      <div className="legal mt-8 flex flex-col gap-6 text-[16px] leading-relaxed">{children}</div>
      <nav aria-label="Legal" className="mt-12 flex gap-5 border-t border-line pt-5 text-[15px] font-bold">
        <Link href="/privacy" className="text-accent">Privacy</Link>
        <Link href="/terms" className="text-accent">Terms</Link>
        <Link href="/proof" className="text-accent">Proof of PayPal</Link>
      </nav>
    </main>
  );
}

export function Section({ heading, children }: { heading: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-[19px] font-bold">{heading}</h2>
      {children}
    </section>
  );
}
