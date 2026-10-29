import Link from "next/link";
import { Avatar, STATE_LABEL } from "@/components/avatar";
import { Pebble } from "@/components/pebble";
import type { CircleView } from "@/lib/views/circle";
import { formatCents } from "@/lib/protocol";

/** Members on a ring around Pebble (design: GHome). The one being paid gets a green dotted money path. */
export function Ring({ view }: { view: CircleView }) {
  const size = 280;
  const c = size / 2;
  const r = 104;
  const n = Math.max(view.seats.length, view.circle.size);
  const seats = [...view.seats].sort((a, b) => (a.position ?? 99) - (b.position ?? 99));
  const pos = (i: number) => {
    const a = (-90 + (i * 360) / n) * (Math.PI / 180);
    return { x: c + r * Math.cos(a), y: c + r * Math.sin(a) };
  };
  const nowIdx = seats.findIndex((s) => s.state === "now");
  const target = nowIdx >= 0 ? pos(nowIdx) : null;
  const look = target ? { dx: ((target.x - c) / r) * 3, dy: ((target.y - c) / r) * 2 } : { dx: 0, dy: 0 };
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg aria-hidden className="absolute inset-0" width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="var(--line)" strokeWidth={1.5} />
        {target ? (
          <>
            <line x1={c} y1={c} x2={target.x} y2={target.y} stroke="var(--paid)" strokeWidth={2} strokeDasharray="2 6" strokeLinecap="round" />
            <circle r={4} fill="var(--paid)">
              <animateMotion dur="2.4s" repeatCount="indefinite" path={`M${c},${c} L${target.x},${target.y}`} />
            </circle>
          </>
        ) : null}
      </svg>
      <div className="absolute" style={{ left: c - 44, top: c - 44, transform: `translate(${look.dx}px, ${look.dy}px)` }}>
        <Pebble size={88} state={view.circle.status === "PAUSED" ? "guarding" : seats.some((s) => s.state === "late") ? "concerned" : "watching"} />
      </div>
      {seats.map((s, i) => {
        const p = pos(i);
        return (
          <Link key={s.membershipId} href={`/c/${view.circle.id}/m/${s.memberId}`} aria-label={`${s.name}${s.isMe ? " (you)" : ""}, ${STATE_LABEL[s.state]}`} className="absolute" style={{ left: p.x - 24, top: p.y - 24 }}>
            <Avatar size={48} state={s.state} levelColor={s.level.color} levelScale={s.level.tier === "DIAMOND" ? 1.2 : s.level.tier === "GOLD" ? 1.1 : 1} />
          </Link>
        );
      })}
      {Array.from({ length: n - seats.length }, (_, k) => {
        const p = pos(seats.length + k);
        return <span key={`open-${k}`} aria-label="open seat" className="absolute rounded-full border-2 border-dashed border-[#D4D4D8]" style={{ left: p.x - 24, top: p.y - 24, width: 48, height: 48 }} />;
      })}
      {target && nowIdx >= 0 ? (
        <span aria-hidden className="absolute flex flex-col whitespace-nowrap leading-tight" style={{ left: target.x + (target.x >= c ? 28 : -80), top: target.y - 14 }}>
          <span className="text-[11px] font-bold">{seats[nowIdx]!.name}</span>
          <span className="num text-[11px] font-bold text-paid">{formatCents(view.circle.pot)} today</span>
        </span>
      ) : null}
    </div>
  );
}
