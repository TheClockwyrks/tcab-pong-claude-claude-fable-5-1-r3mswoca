// Building blocks of the world: parked balls, resting paddles, the obstacles,
// and the whole-state transitions specs/ui.md names (the title screen, starting
// a match, returning to the title).

import type { DeepReadonly } from "ts-essentials";
import {
  FIELD_CX,
  FIELD_CY,
  HOLD_TIME,
  OBSTACLE_CENTERS,
  WIN_LEAD,
  WIN_SCORE,
} from "./constants";
import type {
  BallState,
  CaromState,
  Mode,
  ObstacleState,
  PaddleState,
  Side,
} from "./game";

/** A fresh serve sign, `1` and `-1` each equally likely (specs/balls.md). */
export function drawServeSign(): 1 | -1 {
  return Math.random() < 0.5 ? 1 : -1;
}

/** The ball parked at its home point, waiting out a full hold. */
export function parkedBall(): BallState {
  return {
    x: FIELD_CX,
    y: FIELD_CY,
    vx: 0,
    vy: 0,
    spin: 0,
    held: true,
    holdTimer: HOLD_TIME,
    serveSign: drawServeSign(),
    trail: [],
  };
}

/** A paddle at rest on the field's vertical center, under its player. */
export function restingPaddle(): PaddleState {
  return { cy: FIELD_CY, vy: 0, driven: false, drivenVy: 0 };
}

/**
 * Obstacle `index` at its fixed center.
 *
 * @throws if `index` names no obstacle.
 */
export function obstacleAt(index: number): ObstacleState {
  const center = OBSTACLE_CENTERS[index];
  if (!Number.isInteger(index) || center === undefined) {
    throw new Error(
      `Carom: obstacle index ${String(index)} names no obstacle; the indices are 0 and 1`,
    );
  }
  return { index, cx: center.x, cy: center.y };
}

/** Both obstacles, in the order of `OBSTACLE_CENTERS`. */
export function allObstacles(): ObstacleState[] {
  return OBSTACLE_CENTERS.map((_, index) => obstacleAt(index));
}

/** The side a scorer scored on. */
export function opponentOf(side: Side): Side {
  return side === "left" ? "right" : "left";
}

/** The winning side under the win rule (specs/balls.md), or `null` while play goes on. */
export function winnerOf(score: { p1: number; p2: number }): Side | null {
  if (score.p1 >= WIN_SCORE && score.p1 - score.p2 >= WIN_LEAD) return "left";
  if (score.p2 >= WIN_SCORE && score.p2 - score.p1 >= WIN_LEAD) return "right";
  return null;
}

/** The whole state at the title screen (specs/state.md). */
export function titleState(muted: boolean): CaromState {
  return {
    screen: "title",
    mode: "solo",
    menuIndex: 0,
    titleIndex: 0,
    resumeScreen: "playing",
    score: { p1: 0, p2: 0 },
    winner: null,
    paddles: { left: restingPaddle(), right: restingPaddle() },
    ai: { tracking: true, movement: true },
    receiver: "left",
    ball: parkedBall(),
    obstacles: allObstacles(),
    simTime: 0,
    muted,
    menuPresses: [],
  };
}

/** Starts a match in `mode` from wherever the game stands (specs/ui.md). */
export function startMatch(
  state: DeepReadonly<CaromState>,
  mode: Mode,
): CaromState {
  return {
    ...state,
    mode,
    screen: "countdown",
    resumeScreen: "playing",
    menuIndex: 0,
    score: { p1: 0, p2: 0 },
    winner: null,
    receiver: "left",
    ball: parkedBall(),
    paddles: {
      left: { ...state.paddles.left, cy: FIELD_CY, vy: 0 },
      right: { ...state.paddles.right, cy: FIELD_CY, vy: 0 },
    },
  };
}

/**
 * Returns to the title: every declared field takes its title-screen value
 * except `titleIndex`, `simTime`, and `muted`, and `menuIndex` becomes
 * `titleIndex` (specs/ui.md).
 */
export function returnToTitle(state: DeepReadonly<CaromState>): CaromState {
  return {
    ...titleState(state.muted),
    titleIndex: state.titleIndex,
    menuIndex: state.titleIndex,
    simTime: state.simTime,
  };
}
