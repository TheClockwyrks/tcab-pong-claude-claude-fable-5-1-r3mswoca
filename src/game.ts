// Carom — the game: its state, its debug surface, and the three functions the
// Simple 2D engine drives.
//
// The state is a value the engine holds and every frame replaces, so every
// field below is `readonly` and `update` builds the next state from the one it
// is handed. The simulation itself lives in the modules beside this file
// (`update.ts`, `field.ts`, `physics.ts`, `paddles.ts`, `menus.ts`), all of them
// pure functions over `CaromState`; this file declares the contract and wires
// those functions to the engine.

import type {
  Game,
  InitApi,
  RenderApi,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { CUE_SPECS } from "./audio";
import { ACTIONS, BINDINGS } from "./constants";
import { createDebugApi } from "./debug";
import { registerDiagnostics } from "./diagnostics";
import { readInput } from "./input";
import { render } from "./render";
import { advance } from "./update";
import { titleState } from "./world";

// ---- The state (specs/state.md) -------------------------------------------

export type Screen =
  "title" | "howto" | "countdown" | "playing" | "paused" | "matchover";

export type Mode = "solo" | "versus";

export type Side = "left" | "right";

export interface PaddleState {
  readonly cy: number;
  readonly vy: number;
  readonly driven: boolean;
  readonly drivenVy: number;
}

export interface AiState {
  readonly tracking: boolean;
  readonly movement: boolean;
}

export interface TrailSample {
  readonly x: number;
  readonly y: number;
  readonly t: number;
}

export interface BallState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

export interface ObstacleState {
  readonly index: number;
  readonly cx: number;
  readonly cy: number;
}

/**
 * A pointer or touch contact that landed on a menu screen and has not lifted
 * yet. A menu confirm needs both edges of one contact inside one item's region
 * (specs/ui.md), and the landing edge happens on an earlier frame than the
 * lifting edge, so the item it landed on is carried in the state until the
 * contact lifts. It is input bookkeeping rather than game state: nothing reads
 * it but the menus, and a reset or a return to the title clears it.
 */
export interface MenuPress {
  /** The engine's id for the contact. */
  readonly id: number;
  /** The screen the contact landed on. */
  readonly screen: Screen;
  /** The item the contact landed inside, or `null` for a landing outside every item. */
  readonly item: number | null;
}

export interface CaromState {
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";

  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;

  readonly paddles: { readonly left: PaddleState; readonly right: PaddleState };
  readonly ai: AiState;

  readonly receiver: Side;
  readonly ball: BallState | null;
  readonly obstacles: readonly ObstacleState[];

  readonly simTime: number;
  readonly muted: boolean;

  /** Menu contacts in flight; see {@link MenuPress}. */
  readonly menuPresses: readonly MenuPress[];
}

// ---- The debug surface (specs/instrumentation.md) --------------------------

/** A menu item's hit region, in logical units. */
export interface MenuRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface PaddleSnapshot {
  readonly cy: number;
  readonly vy: number;
  readonly drivenVy: number;
  readonly driven: boolean;
}

export interface BallSnapshot {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly speed: number;
  readonly spin: number;
  readonly held: boolean;
  readonly holdTimer: number;
  readonly serveSign: 1 | -1;
  readonly trail: readonly TrailSample[];
}

/** What `snapshot` reads: the whole declared state, as plain data. */
export interface CaromSnapshot {
  readonly version: number;
  readonly screen: Screen;
  readonly mode: Mode;
  readonly menuIndex: number;
  readonly titleIndex: number;
  readonly resumeScreen: "countdown" | "playing";
  readonly score: { readonly p1: number; readonly p2: number };
  readonly winner: Side | null;
  readonly muted: boolean;
  readonly paddles: {
    readonly left: PaddleSnapshot;
    readonly right: PaddleSnapshot;
  };
  readonly ai: AiState;
  readonly receiver: Side;
  readonly ball: BallSnapshot | null;
  readonly obstacles: readonly ObstacleState[];
  readonly simTime: number;
}

/** The current state, as every operation of the surface receives it. */
export type StateView = DeepReadonly<CaromState>;

/**
 * The debug and automation surface. Every pose takes the current state first
 * and returns the next one; every reading takes it and returns what it read.
 */
export interface CaromDebugApi {
  readonly version: number;

  clearWorld(state: StateView): CaromState;
  spawnBall(state: StateView): CaromState;
  spawnObstacle(state: StateView, index: number): CaromState;
  reset(state: StateView): CaromState;
  reconcile(state: StateView): CaromState;

  setScreen(state: StateView, screen: Screen): CaromState;
  setMode(state: StateView, mode: Mode): CaromState;
  setMenuIndex(state: StateView, index: number): CaromState;
  setTitleIndex(state: StateView, index: number): CaromState;
  setResumeScreen(
    state: StateView,
    screen: "countdown" | "playing",
  ): CaromState;

  setScore(state: StateView, p1: number, p2: number): CaromState;
  setWinner(state: StateView, side: Side | null): CaromState;
  setReceiver(state: StateView, side: Side): CaromState;

  setPaddleCy(state: StateView, side: Side, cy: number): CaromState;
  setPaddleVy(state: StateView, side: Side, vy: number): CaromState;
  setPaddleDriven(state: StateView, side: Side, driven: boolean): CaromState;

  setBallPosition(state: StateView, x: number, y: number): CaromState;
  setBallVelocity(state: StateView, vx: number, vy: number): CaromState;
  setBallSpin(state: StateView, spin: number): CaromState;
  setBallHeld(state: StateView, held: boolean): CaromState;
  setBallHoldTimer(state: StateView, seconds: number): CaromState;
  setBallServeSign(state: StateView, sign: 1 | -1): CaromState;
  drawBallServeSign(state: StateView): CaromState;

  setAiTracking(state: StateView, enabled: boolean): CaromState;
  setAiMovement(state: StateView, enabled: boolean): CaromState;

  setMuted(state: StateView, muted: boolean): CaromState;

  snapshot(state: StateView): CaromSnapshot;
  menuItemRect(state: StateView, index: number): MenuRect | null;
}

// ---- The game ---------------------------------------------------------------

/**
 * The field background, a CSS color string. `src/main.ts` hands it to the engine
 * as the color the canvas is cleared to each frame, so the letterbox bars around
 * the field match the field itself.
 */
export const BACKGROUND = "#0b1020";

export const game: Game<CaromState, CaromDebugApi> = {
  initialize(api: InitApi<CaromState>): [CaromState, CaromDebugApi] {
    for (const name of ACTIONS) {
      api.input.register(name, { keys: [...BINDINGS[name]] });
    }
    for (const [cue, spec] of Object.entries(CUE_SPECS)) {
      api.audio.define(cue, spec);
    }
    registerDiagnostics(api.diagnostics);
    // The runtime's bus starts unmuted, which is the bit the opening state mirrors.
    return [titleState(false), createDebugApi()];
  },

  update(
    state: DeepReadonly<CaromState>,
    api: UpdateApi,
    dt: number,
  ): CaromState {
    const input = readInput(api.input);
    const { state: next, cues } = advance(state, input, dt);
    // The state decides the mute bit (the `mute` action toggles it there, and a
    // debug pose may set it); the runtime follows, and the state mirrors what
    // the runtime then reports.
    api.audio.setMuted(next.muted);
    for (const cue of cues) api.audio.play(cue);
    return { ...next, muted: api.audio.muted() };
  },

  render(state: DeepReadonly<CaromState>, api: RenderApi): void {
    render(state, api.ctx);
  },
};
