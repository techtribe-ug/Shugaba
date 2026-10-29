import { LEVELS, SCORE_MAX, SCORE_MIN } from "@/lib/protocol";

/** Four level bands from 300 to 850 with a marker at the score. */
export function ScoreBar({ score }: { score: number }) {
  const pct = ((score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="relative flex h-2 gap-1" role="img" aria-label={`Score ${score} out of ${SCORE_MAX}`}>
        {LEVELS.map((l) => (
          <span key={l.title} className="h-full rounded-full" style={{ flex: l.max - l.min + 1, background: score >= l.min ? l.color : "var(--surface)" }} />
        ))}
        <span aria-hidden className="absolute -top-1.5 h-5 w-5 -translate-x-1/2 rounded-full border-[3px] border-white bg-text shadow" style={{ left: `${pct}%` }} />
      </div>
      <div className="num flex justify-between text-xs text-[#A1A1AA]"><span>{SCORE_MIN}</span><span>{SCORE_MAX}</span></div>
    </div>
  );
}
