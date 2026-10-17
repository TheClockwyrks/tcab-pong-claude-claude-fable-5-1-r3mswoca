// The debug and automation surface (specs/instrumentation.md). Every pose
// takes the current state and returns the next; every reading returns what it
// read. A pose with nothing to act on fails loudly rather than refusing quietly.

import { CAROM_DEBUG_VERSION } from "./constants";
import type {
  BallState,
  CaromDebugApi,
  CaromSnapshot,
  CaromState,
  Mode,
  PaddleState,
  Screen,
  Side,
  StateView,
} from "./game";
import { menuItemRect } from "./menus";
import {
  allObstacles,
  drawServeSign,
  obstacleAt,
  parkedBall,
  titleState,
} from "./world";

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];

function requireScreen(screen: Screen): Screen {
  if (!SCREENS.includes(screen)) {
    throw new Error(`Carom debug: ${JSON.stringify(screen)} names no screen`);
  }
  return screen;
}

function requireResumeScreen(
  screen: "countdown" | "playing",
): "countdown" | "playing" {
  if (screen !== "countdown" && screen !== "playing") {
    throw new Error(
      `Carom debug: a pause resumes to "countdown" or "playing", not ${JSON.stringify(screen)}`,
    );
  }
  return screen;
}

function requireMode(mode: Mode): Mode {
  if (mode !== "solo" && mode !== "versus") {
    throw new Error(`Carom debug: ${JSON.stringify(mode)} names no mode`);
  }
  return mode;
}

function requireSide(side: Side): Side {
  if (side !== "left" && side !== "right") {
    throw new Error(`Carom debug: ${JSON.stringify(side)} names no side`);
  }
  return side;
}

function requireSign(sign: 1 | -1): 1 | -1 {
  if (sign !== 1 && sign !== -1) {
    throw new Error(
      `Carom debug: a serve sign is 1 or -1, not ${JSON.stringify(sign)}`,
    );
  }
  return sign;
}

function requireNumber(name: string, value: number): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    throw new Error(
      `Carom debug: ${name} must be a number, got ${String(value)}`,
    );
  }
  return value;
}

function requireIndex(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(
      `Carom debug: ${name} must be a whole, non-negative index, got ${String(value)}`,
    );
  }
  return value;
}

/** The ball, or a loud failure while the field carries none. */
function requireBall(state: StateView): BallState {
  if (state.ball === null) {
    throw new Error("Carom debug: no ball is on the field to pose");
  }
  return state.ball;
}

function withBall(state: StateView, patch: Partial<BallState>): CaromState {
  return { ...state, ball: { ...requireBall(state), ...patch } };
}

function withPaddle(
  state: StateView,
  side: Side,
  patch: Partial<PaddleState>,
): CaromState {
  requireSide(side);
  return {
    ...state,
    paddles: { ...state.paddles, [side]: { ...state.paddles[side], ...patch } },
  };
}

/** The whole declared state as plain data, with `speed` worked out at the read. */
export function snapshotOf(state: StateView): CaromSnapshot {
  const ball = state.ball;
  return {
    version: CAROM_DEBUG_VERSION,
    screen: state.screen,
    mode: state.mode,
    menuIndex: state.menuIndex,
    titleIndex: state.titleIndex,
    resumeScreen: state.resumeScreen,
    score: { p1: state.score.p1, p2: state.score.p2 },
    winner: state.winner,
    muted: state.muted,
    paddles: {
      left: { ...state.paddles.left },
      right: { ...state.paddles.right },
    },
    ai: { ...state.ai },
    receiver: state.receiver,
    ball:
      ball === null
        ? null
        : {
            x: ball.x,
            y: ball.y,
            vx: ball.vx,
            vy: ball.vy,
            speed: Math.hypot(ball.vx, ball.vy),
            spin: ball.spin,
            held: ball.held,
            holdTimer: ball.holdTimer,
            serveSign: ball.serveSign,
            trail: ball.trail.map((s) => ({ x: s.x, y: s.y, t: s.t })),
          },
    obstacles: state.obstacles.map((o) => ({ ...o })),
    simTime: state.simTime,
  };
}

/** Builds the surface. It holds nothing; every operation works on the state it is handed. */
export function createDebugApi(): CaromDebugApi {
  return {
    version: CAROM_DEBUG_VERSION,

    clearWorld: (s) => ({ ...s, ball: null, obstacles: [] }),
    spawnBall: (s) => ({ ...s, ball: parkedBall() }),
    spawnObstacle: (s, index) => {
      const spawned = obstacleAt(index);
      const others = s.obstacles.filter((o) => o.index !== index);
      const obstacles = [...others, spawned].sort((a, b) => a.index - b.index);
      return { ...s, obstacles };
    },
    reset: (s) => ({
      ...titleState(s.muted),
      ball: parkedBall(),
      obstacles: allObstacles(),
    }),
    // Every reading is worked out at the read, so there is nothing to bring
    // into agreement: the state comes back as it was.
    reconcile: (s) => ({ ...s }),

    setScreen: (s, screen) => ({ ...s, screen: requireScreen(screen) }),
    setMode: (s, mode) => ({ ...s, mode: requireMode(mode) }),
    setMenuIndex: (s, index) => ({
      ...s,
      menuIndex: requireIndex("menuIndex", index),
    }),
    setTitleIndex: (s, index) => ({
      ...s,
      titleIndex: requireIndex("titleIndex", index),
    }),
    setResumeScreen: (s, screen) => ({
      ...s,
      resumeScreen: requireResumeScreen(screen),
    }),

    setScore: (s, p1, p2) => ({
      ...s,
      score: { p1: requireNumber("p1", p1), p2: requireNumber("p2", p2) },
    }),
    setWinner: (s, side) => ({
      ...s,
      winner: side === null ? null : requireSide(side),
    }),
    setReceiver: (s, side) => ({ ...s, receiver: requireSide(side) }),

    setPaddleCy: (s, side, cy) =>
      withPaddle(s, side, { cy: requireNumber("cy", cy) }),
    setPaddleVy: (s, side, vy) =>
      withPaddle(s, side, { drivenVy: requireNumber("vy", vy) }),
    setPaddleDriven: (s, side, driven) =>
      withPaddle(s, side, { driven: Boolean(driven) }),

    setBallPosition: (s, x, y) =>
      withBall(s, { x: requireNumber("x", x), y: requireNumber("y", y) }),
    setBallVelocity: (s, vx, vy) =>
      withBall(s, { vx: requireNumber("vx", vx), vy: requireNumber("vy", vy) }),
    setBallSpin: (s, spin) =>
      withBall(s, { spin: requireNumber("spin", spin) }),
    setBallHeld: (s, held) => withBall(s, { held: Boolean(held) }),
    setBallHoldTimer: (s, seconds) =>
      withBall(s, { holdTimer: requireNumber("seconds", seconds) }),
    setBallServeSign: (s, sign) =>
      withBall(s, { serveSign: requireSign(sign) }),
    drawBallServeSign: (s) => withBall(s, { serveSign: drawServeSign() }),

    setAiTracking: (s, enabled) => ({
      ...s,
      ai: { ...s.ai, tracking: Boolean(enabled) },
    }),
    setAiMovement: (s, enabled) => ({
      ...s,
      ai: { ...s.ai, movement: Boolean(enabled) },
    }),

    setMuted: (s, muted) => ({ ...s, muted: Boolean(muted) }),

    snapshot: snapshotOf,
    menuItemRect: (s, index) => menuItemRect(s.screen, index),
  };
}
