/** Shugaba's face: the Original Pebble (spec 10.6). Minimal states here; the full component lives in the UI kit. */
export type PebbleState = "watching" | "pleased" | "thinking" | "concerned" | "guarding";

const BLOB =
  "M-27 -6 C-27 -26 -4 -31 10 -27 C27 -23 31 -6 28 9 C25 25 6 31 -8 29 C-23 27 -27 13 -27 -6 Z";

export function Pebble({ size = 40, state = "watching", label = "Shugaba" }: { size?: number; state?: PebbleState; label?: string }) {
  const x = 9;
  const y = -3;
  let eyes: React.ReactNode;
  if (state === "pleased") {
    eyes = (
      <g stroke="var(--eye)" strokeWidth={3} fill="none" strokeLinecap="round">
        <path d={`M${-x - 4} ${y + 1} q4 -5 8 0`} />
        <path d={`M${x - 4} ${y + 1} q4 -5 8 0`} />
      </g>
    );
  } else if (state === "guarding") {
    eyes = (
      <g fill="var(--eye)">
        <rect x={-x - 4.5} y={y - 1.5} width={9} height={3} rx={1.5} />
        <rect x={x - 4.5} y={y - 1.5} width={9} height={3} rx={1.5} />
      </g>
    );
  } else {
    const dx = state === "thinking" ? -3 : 0;
    const dy = state === "thinking" ? -3 : state === "concerned" ? 3 : 0;
    const w = 7.4;
    const h = state === "concerned" ? 7.4 * 0.75 : 7.4;
    eyes = (
      <g className="pebble-eyes" fill="var(--eye)">
        <rect x={-x + dx - w / 2} y={y + dy - h / 2} width={w} height={h} rx={w / 2} />
        <rect x={x + dx - w / 2} y={y + dy - h / 2} width={w} height={h} rx={w / 2} />
      </g>
    );
  }
  return (
    <svg width={size} height={size} viewBox="-32 -32 64 64" role="img" aria-label={label}>
      <g className="pebble-body">
        <path d={BLOB} fill="var(--pebble)" />
        {eyes}
      </g>
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2">
      <Pebble size={size} />
      <span className="font-display font-bold lowercase tracking-tight" style={{ fontSize: size * 0.8 }}>
        shugaba
      </span>
    </span>
  );
}
