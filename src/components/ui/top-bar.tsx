import Link from "next/link";
import { Icon } from "../icons";
import { Pebble } from "../pebble";

export function BackBar({ href, title, right }: { href: string; title?: string; right?: React.ReactNode }) {
  return (
    <header className="flex min-h-12 items-center gap-1.5 pt-3.5 pr-4 pl-2">
      <Link href={href} aria-label="Back" className="flex h-11 w-11 items-center justify-center text-text">
        <Icon name="back" />
      </Link>
      {title ? <span className="text-base font-extrabold">{title}</span> : null}
      <span className="flex-1" />
      {right}
    </header>
  );
}

export function BrandBar({ label, right }: { label?: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2.5 pb-7">
      <Link href="/" aria-label="Shugaba home" className="flex items-center gap-2 text-text no-underline">
        <Pebble size={26} />
        <span className="font-display text-xl font-bold leading-none tracking-tight">shugaba</span>
      </Link>
      {label ? (
        <>
          <span aria-hidden className="mx-1.5 h-[18px] w-px bg-line" />
          <span className="text-sm font-bold text-muted">{label}</span>
        </>
      ) : null}
      <span className="flex-1" />
      {right}
    </div>
  );
}

/** Black pay button with "PayPal" in bold italic (design rule). The live build swaps in the PayPal JS SDK button. */
export function PayPalWord() {
  return <span className="font-extrabold italic">PayPal</span>;
}

export const btnPrimary = "inline-flex h-14 items-center justify-center gap-1.5 rounded-[14px] bg-text px-6 text-base font-bold text-white disabled:cursor-not-allowed disabled:bg-[#D4D4D8]";
export const btnQuiet = "inline-flex h-13 items-center justify-center gap-1.5 bg-transparent px-0 text-[15px] font-bold text-muted";
