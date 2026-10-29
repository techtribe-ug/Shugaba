import type { CircleStatus, RoundStatus } from "@/lib/protocol";

export class IllegalTransitionError extends Error {
  constructor(machine: string, from: string, to: string) {
    super(`Illegal ${machine} transition ${from} -> ${to}`);
    this.name = "IllegalTransitionError";
  }
}

const CIRCLE: Record<CircleStatus, readonly CircleStatus[]> = {
  DRAFT: ["FORMING", "DISSOLVED"],
  FORMING: ["ACTIVE", "DISSOLVED"],
  ACTIVE: ["PAUSED", "COMPLETED", "DISSOLVED"],
  PAUSED: ["ACTIVE", "DISSOLVED"],
  COMPLETED: [],
  DISSOLVED: [],
};

const ROUND: Record<RoundStatus, readonly RoundStatus[]> = {
  SCHEDULED: ["COLLECTING"],
  COLLECTING: ["GRACE", "SETTLING"],
  GRACE: ["SETTLING"],
  SETTLING: ["PAID_OUT", "HELD"],
  HELD: ["SETTLING"],
  PAID_OUT: [],
};

export const circleTransitions = CIRCLE;
export const roundTransitions = ROUND;

export function canTransitionCircle(from: CircleStatus, to: CircleStatus): boolean {
  return CIRCLE[from].includes(to);
}

export function transitionCircle(from: CircleStatus, to: CircleStatus): CircleStatus {
  if (!canTransitionCircle(from, to)) throw new IllegalTransitionError("circle", from, to);
  return to;
}

export function canTransitionRound(from: RoundStatus, to: RoundStatus): boolean {
  return ROUND[from].includes(to);
}

export function transitionRound(from: RoundStatus, to: RoundStatus): RoundStatus {
  if (!canTransitionRound(from, to)) throw new IllegalTransitionError("round", from, to);
  return to;
}

/** After collection: straight to settling when all paid, otherwise grace. */
export function afterCollection(allPaid: boolean): RoundStatus {
  return allPaid ? "SETTLING" : "GRACE";
}
