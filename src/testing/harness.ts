// A headless stand of the engine for the tests: the game over an
// `@napi-rs/canvas` canvas, a `SurfaceMetrics` of the test's own, a constant
// clock, and helpers that drive the keyboard and the pointer by dispatching
// events at the surface's target, exactly as a player's would arrive.

import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine, SurfaceMetrics } from "@clockwyrks/simple-2d";
import { createCanvas } from "@napi-rs/canvas";
import { FIELD_H, FIELD_W, LAYOUT } from "../constants";
import { BACKGROUND, game } from "../game";
import type { CaromDebugApi, CaromState } from "../game";

export interface PointerOptions {
  readonly id?: number;
  readonly device?: "mouse" | "pen" | "touch";
  readonly primary?: boolean;
  readonly button?: number;
  readonly buttons?: number;
}

export interface Harness {
  readonly engine: Engine<CaromState, CaromDebugApi>;
  readonly debug: CaromDebugApi;
  readonly target: EventTarget;
  /** The cue names played so far, in order. */
  readonly cues: string[];
  /** The frame's delta in seconds. */
  readonly dt: number;
  keyDown(code: string): void;
  keyUp(code: string): void;
  /** A press and release before the next frame: one edge, nothing held. */
  tap(code: string): void;
  pointerDown(x: number, y: number, options?: PointerOptions): void;
  pointerMove(x: number, y: number, options?: PointerOptions): void;
  pointerUp(x: number, y: number, options?: PointerOptions): void;
  /** A press and release at one point before the next frame. */
  click(x: number, y: number, options?: PointerOptions): void;
  /** Poses the state through the surface, as `engine.apply((s) => pose(debug, s))`. */
  pose(
    pose: (
      debug: CaromDebugApi,
      state: Engine<CaromState, CaromDebugApi>["state"],
    ) => CaromState,
  ): void;
  snapshot(): ReturnType<CaromDebugApi["snapshot"]>;
  advance(frames: number): Promise<void>;
  /** Advances until `seconds` of game time have passed, at the clock's step. */
  advanceSeconds(seconds: number): Promise<void>;
  destroy(): void;
}

export const DEFAULT_STEP_MS = 1000 / 60;

/** Stands the engine up over its own canvas and clock. */
export async function createHarness(
  stepMs = DEFAULT_STEP_MS,
): Promise<Harness> {
  const target = new EventTarget();
  const surface: SurfaceMetrics = {
    cssWidth: () => FIELD_W,
    cssHeight: () => FIELD_H,
    dpr: () => 1,
    events: () => target,
  };
  const canvas = createCanvas(FIELD_W, FIELD_H) as unknown as HTMLCanvasElement;
  const engine = createEngine({
    canvas,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(stepMs),
    surface,
  });
  const cues: string[] = [];
  engine.events.on("cue:played", (event) => cues.push(event.cue));
  await engine.initialize();

  const key = (type: string, code: string): void => {
    target.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  };
  const pointer = (
    type: string,
    x: number,
    y: number,
    options: PointerOptions,
    fallbackButton: number | undefined,
  ): void => {
    target.dispatchEvent(
      Object.assign(new Event(type), {
        clientX: x,
        clientY: y,
        pointerId: options.id ?? 1,
        pointerType: options.device ?? "mouse",
        isPrimary: options.primary ?? true,
        button: options.button ?? fallbackButton,
        buttons: options.buttons,
      }),
    );
  };
  const dt = stepMs / 1000;

  return {
    engine,
    debug: engine.debug,
    target,
    cues,
    dt,
    keyDown: (code) => key("keydown", code),
    keyUp: (code) => key("keyup", code),
    tap: (code) => {
      key("keydown", code);
      key("keyup", code);
    },
    pointerDown: (x, y, options = {}) =>
      pointer("pointerdown", x, y, options, 0),
    pointerMove: (x, y, options = {}) =>
      pointer("pointermove", x, y, options, -1),
    pointerUp: (x, y, options = {}) => pointer("pointerup", x, y, options, 0),
    click: (x, y, options = {}) => {
      pointer("pointerdown", x, y, options, 0);
      pointer("pointerup", x, y, options, 0);
    },
    pose: (pose) => {
      engine.apply((s) => pose(engine.debug, s));
    },
    snapshot: () => engine.debug.snapshot(engine.state),
    advance: (frames) => engine.advance(frames),
    advanceSeconds: (seconds) =>
      engine.advance(Math.round((seconds * 1000) / stepMs)),
    destroy: () => engine.destroy(),
  };
}
