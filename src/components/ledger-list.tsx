import { money, type Narration } from "@/lib/agents/narrate";
import { Icon, type IconName } from "./icons";

const KIND: Record<Narration["kind"], { icon: IconName; bg: string; fg: string }> = {
  in: { icon: "in", bg: "var(--paid)", fg: "var(--text)" },
  out: { icon: "out", bg: "var(--text)", fg: "var(--text)" },
  cover: { icon: "shield", bg: "var(--accent)", fg: "var(--accent)" },
  late: { icon: "clock", bg: "var(--grace)", fg: "var(--text)" },
  fail: { icon: "x", bg: "var(--failed)", fg: "var(--text)" },
  swap: { icon: "swap", bg: "var(--gold)", fg: "var(--text)" },
  info: { icon: "check", bg: "#A1A1AA", fg: "var(--text)" },
  score: { icon: "check", bg: "#A1A1AA", fg: "var(--text)" },
};

export function LedgerList({ rows }: { rows: { seq: number; at: string; line: Narration | null }[] }) {
  return (
    <ul className="flex flex-col">
      {rows.map((r) => {
        const k = KIND[r.line!.kind];
        return (
          <li key={r.seq} className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-4 border-t border-surface py-3.5">
            <span aria-hidden className="flex h-7 w-7 items-center justify-center rounded-full" style={{ background: k.bg }}>
              <Icon name={k.icon} size={14} stroke={2.6} color="#fff" />
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-[15px] font-bold">{r.line!.text}</span>
              <span className="num text-xs text-[#A1A1AA]">
                #{String(r.seq).padStart(4, "0")} · {new Date(r.at).toUTCString().slice(5, 22)}
              </span>
            </span>
            <span className="num text-right text-[17px] font-bold" style={{ color: k.fg }}>{money(r.line!.amount)}</span>
          </li>
        );
      })}
    </ul>
  );
}
