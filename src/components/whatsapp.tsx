/**
 * WhatsApp bits: a generic chat glyph in WhatsApp green (not Meta's logo), a "Coming soon" badge,
 * a share link (wa.me, works today with no API) and the alerts teaser shown until the Cloud API is live.
 */
export const WA_GREEN = "#25D366";

export function WaIcon({ size = 36 }: { size?: number }) {
  return (
    <span aria-hidden className="flex shrink-0 items-center justify-center rounded-full" style={{ width: size, height: size, background: WA_GREEN }}>
      <svg width={size * 0.56} height={size * 0.56} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 12a8 8 0 1 1 3.2 6.4L4 20l1.1-3.6A8 8 0 0 1 4 12Z" />
        <path d="M9 10.5c.4 1.6 1.9 3.1 3.5 3.6l1.2-.9 1.8.9" />
      </svg>
    </span>
  );
}

export function ComingSoon() {
  return <span className="rounded-full bg-surface px-2.5 py-1 text-[12px] font-bold uppercase tracking-wide text-muted">Coming soon</span>;
}

/** Opens WhatsApp (app or web) with the message ready to send. No API needed. */
export function WaShareLink({ text, label, className }: { text: string; label: string; className?: string }) {
  return (
    <a
      href={`https://wa.me/?text=${encodeURIComponent(text)}`}
      target="_blank"
      rel="noopener noreferrer"
      className={className ?? "inline-flex h-13 w-full items-center justify-center gap-2 rounded-[14px] border border-line text-base font-bold text-text no-underline"}
    >
      <WaIcon size={24} /> {label}
    </a>
  );
}

const PERKS = ["A reminder the day before you pay in", "A receipt the moment PayPal confirms it", "A message when your payout lands"];

export function WaAlertsTeaser() {
  return (
    <section aria-label="WhatsApp alerts" className="flex flex-col gap-3 rounded-[20px] border border-line p-5">
      <div className="flex items-center gap-3">
        <WaIcon />
        <span className="flex-1 text-[16px] font-bold">Alerts on WhatsApp</span>
        <ComingSoon />
      </div>
      <ul className="flex flex-col gap-1.5 text-[14px] text-muted">
        {PERKS.map((p) => (
          <li key={p} className="flex items-center gap-2">
            <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: WA_GREEN }} />
            {p}
          </li>
        ))}
      </ul>
    </section>
  );
}
