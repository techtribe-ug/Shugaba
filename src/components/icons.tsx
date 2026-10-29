/** Stroke icons (24px grid). Decorative unless a label is passed. */
const P = {
  back: "M15 18l-6-6 6-6",
  bell: "M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0",
  calendar: "M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z",
  feed: "M4 6h16M4 12h16M4 18h10",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  mic: "M9 3h6v11a3 3 0 0 1-6 0zM5 11a7 7 0 0 0 14 0M12 18v3",
  send: "M5 12h14M13 6l6 6-6 6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  plus: "M12 6.5v11M6.5 12h11",
  clock: "M12 7v5l3.5 2M12 3a9 9 0 1 0 0.01 0",
  shield: "M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z",
  out: "M4 12h14M13 6l6 6-6 6",
  in: "M12 19V5M6 11l6-6 6 6",
  x: "M6 6l12 12M18 6L6 18",
  chevron: "M9 6l6 6-6 6",
  swap: "M7 7h11l-3-3M17 17H6l3 3",
  ledger: "M6 3h12v18l-3-2-3 2-3-2-3 2zM9 8h6M9 12h6",
} as const;
export type IconName = keyof typeof P;

export function Icon({ name, size = 22, stroke = 2, label, className, color = "currentColor" }: { name: IconName; size?: number; stroke?: number; label?: string; className?: string; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      <path d={P[name]} />
    </svg>
  );
}
