import type { SeatState } from "@/lib/views/circle";
import { Icon, type IconName } from "./icons";

const BADGE: Partial<Record<SeatState, { bg: string; icon: IconName; label: string }>> = {
  paid: { bg: "var(--paid)", icon: "check", label: "paid" },
  late: { bg: "var(--grace)", icon: "clock", label: "late" },
  failed: { bg: "var(--failed)", icon: "x", label: "missed" },
  covered: { bg: "var(--accent)", icon: "shield", label: "covered by the pool" },
};

/** Grey person silhouette with one small state badge (design: GAvatars). Paid-out members fade. */
export function Avatar({ size = 48, state = "due", levelColor, levelScale = 1 }: { size?: number; state?: SeatState; levelColor?: string; levelScale?: number }) {
  const faded = state === "paidout";
  const badge = BADGE[state];
  const perch = Math.round(size * 0.36 * levelScale);
  return (
    <span className="relative block shrink-0" style={{ width: size, height: size }}>
      <span className="block h-full w-full overflow-hidden rounded-full" style={{ background: faded ? "var(--surface)" : "#E4E4E7", boxShadow: state === "late" ? "0 0 0 3px #fff, 0 0 0 5px #F2D9B3" : undefined }}>
        <svg aria-hidden="true" width="100%" height="100%" viewBox="0 0 64 64">
          <circle cx="32" cy="25" r="11" fill={faded ? "#D4D4D8" : "#A1A1AA"} />
          <path d="M12 56c3-11 11-17 20-17s17 6 20 17a32 32 0 0 1-40 0Z" fill={faded ? "#D4D4D8" : "#A1A1AA"} />
        </svg>
      </span>
      {levelColor ? (
        <svg aria-hidden="true" width={perch} height={perch} viewBox="-32 -32 64 64" className="absolute" style={{ right: -perch * 0.15, top: -perch * 0.3 }}>
          <path d="M-27 -6 C-27 -26 -4 -31 10 -27 C27 -23 31 -6 28 9 C25 25 6 31 -8 29 C-23 27 -27 13 -27 -6 Z" fill={levelColor} stroke="#fff" strokeWidth={5} />
          <circle cx="-7" cy="-3" r="4.5" fill="#fff" />
          <circle cx="11" cy="-3" r="4.5" fill="#fff" />
        </svg>
      ) : null}
      {badge ? (
        <span className="absolute flex items-center justify-center rounded-full" style={{ right: -4, bottom: -4, width: 22, height: 22, background: badge.bg, boxShadow: "0 0 0 2.5px #fff" }}>
          <Icon name={badge.icon} size={13} stroke={3.2} color="#fff" />
        </span>
      ) : null}
    </span>
  );
}

export const STATE_LABEL: Record<SeatState, string> = {
  paidout: "paid out",
  now: "gets paid now",
  paid: "paid",
  late: "late",
  covered: "covered by the pool",
  due: "due",
  failed: "missed",
};
