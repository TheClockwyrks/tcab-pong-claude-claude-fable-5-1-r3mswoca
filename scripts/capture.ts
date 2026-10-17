// The showcase capture page: the same game over the same canvas as
// `index.html`, but under a constant clock and with the engine handed to the
// page so `scripts/showcase.ts` can pose scenarios, step frames, take
// screenshots, and record a replay. It is served by the Vite dev server only
// and is not part of the production build.

import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "../src/constants";
import { BACKGROUND, game } from "../src/game";
import type { CaromDebugApi, CaromState } from "../src/game";

/** What the page hands the capture script. */
export interface CaptureHandle {
  readonly engine: Engine<CaromState, CaromDebugApi>;
  /** Resets the game and opens a solo match with the left paddle driven. */
  openSoloMatch(): void;
  /**
   * One frame of a scripted left player: it tracks the ball while the ball
   * approaches and drifts home otherwise, moving fast enough that its strikes
   * carry spin.
   */
  stepScriptedFrame(): Promise<void>;
}

declare global {
  interface Window {
    carom: CaptureHandle;
  }
}

const canvas = document.getElementById("stage") as HTMLCanvasElement | null;
if (!canvas) throw new Error("capture: the #stage canvas is missing");

const engine = createEngine({
  canvas,
  width: FIELD_W,
  height: FIELD_H,
  game,
  background: BACKGROUND,
  layout: LAYOUT,
  clock: new ConstantClock(1000 / 60),
});

await engine.initialize();
const debug = engine.debug;

window.carom = {
  engine,
  openSoloMatch() {
    engine.apply((s) => debug.reset(s));
    engine.apply((s) => debug.setMode(s, "solo"));
    engine.apply((s) => debug.setScreen(s, "countdown"));
    engine.apply((s) => debug.setPaddleDriven(s, "left", true));
  },
  async stepScriptedFrame() {
    engine.apply((s) => {
      const ball = s.ball;
      const approaching = ball !== null && !ball.held && ball.vx < 0;
      const target = approaching ? ball.y - ball.vy * 0.08 + 28 : 360;
      const diff = target - s.paddles.left.cy;
      const vy =
        Math.abs(diff) < 6
          ? 0
          : Math.sign(diff) * Math.min(700, Math.abs(diff) * 60);
      return debug.setPaddleVy(s, "left", vy);
    });
    await engine.advance(1);
  },
};
