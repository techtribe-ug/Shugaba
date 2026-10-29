/**
 * Demo clock. All "now" reads go through here. Compressed time runs `speed` times faster than real time
 * from `anchorMs`, plus a manual offset that the judge panel can push forward.
 */
export type ClockState = { anchorMs: number; offsetMs: number; speed: number };

export const REAL_CLOCK: ClockState = { anchorMs: 0, offsetMs: 0, speed: 1 };

export function clockNow(state: ClockState, realMs: number = Date.now()): Date {
  const speed = state.speed > 0 ? state.speed : 1;
  return new Date(state.anchorMs + (realMs - state.anchorMs) * speed + state.offsetMs);
}

export function advanceClock(state: ClockState, byMs: number): ClockState {
  if (!Number.isFinite(byMs) || byMs < 0) throw new Error("clock only moves forward");
  return { ...state, offsetMs: state.offsetMs + byMs };
}

/** Changing speed re-anchors so "now" does not jump. */
export function setClockSpeed(state: ClockState, speed: number, realMs: number = Date.now()): ClockState {
  const now = clockNow(state, realMs).getTime();
  return { anchorMs: realMs, offsetMs: now - realMs, speed };
}
