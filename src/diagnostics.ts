// The values Carom puts on the engine's debug overlay: the same facts the
// snapshot reports, each short enough to read on a line. Every source is a
// pure read of the state it is handed.

import type { DiagnosticValue, InitApi } from "@clockwyrks/simple-2d";
import type { CaromState, StateView } from "./game";

const NONE = "-";

function fixed(value: number, digits = 1): string {
  return value.toFixed(digits);
}

/** Every diagnostic source, by name, in the order the overlay draws them. */
export const DIAGNOSTIC_SOURCES: ReadonlyArray<
  readonly [string, (state: StateView) => DiagnosticValue]
> = [
  ["screen", (s) => s.screen],
  ["mode", (s) => s.mode],
  ["score", (s) => `${s.score.p1} - ${s.score.p2}`],
  ["receiver", (s) => s.receiver],
  [
    "ball",
    (s) => (s.ball === null ? NONE : `${fixed(s.ball.x)}, ${fixed(s.ball.y)}`),
  ],
  [
    "ball vel",
    (s) =>
      s.ball === null ? NONE : `${fixed(s.ball.vx)}, ${fixed(s.ball.vy)}`,
  ],
  [
    "ball speed",
    (s) => (s.ball === null ? NONE : fixed(Math.hypot(s.ball.vx, s.ball.vy))),
  ],
  ["ball spin", (s) => (s.ball === null ? NONE : fixed(s.ball.spin))],
  [
    "ball held",
    (s) =>
      s.ball === null
        ? NONE
        : `${s.ball.held} (${fixed(s.ball.holdTimer, 2)}s)`,
  ],
  [
    "left paddle",
    (s) => `cy ${fixed(s.paddles.left.cy)} vy ${fixed(s.paddles.left.vy)}`,
  ],
  [
    "right paddle",
    (s) => `cy ${fixed(s.paddles.right.cy)} vy ${fixed(s.paddles.right.vy)}`,
  ],
  ["ai", (s) => `track ${s.ai.tracking} move ${s.ai.movement}`],
  ["sim time", (s) => fixed(s.simTime, 2)],
  ["muted", (s) => s.muted],
];

export function registerDiagnostics(
  diagnostics: InitApi<CaromState>["diagnostics"],
): void {
  for (const [name, source] of DIAGNOSTIC_SOURCES) {
    diagnostics.register(name, source);
  }
}
