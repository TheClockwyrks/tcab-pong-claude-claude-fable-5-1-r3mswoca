// Paddle motion (specs/playfield.md) and the AI's rule
// (specs/modes/single-player.md). Every mover sets a velocity and integrates it
// the same way, so a paddle's `vy` after a frame is its actual velocity.

import type { DeepReadonly } from "ts-essentials";
import {
  AI_DEADZONE,
  AI_HOME_DEADZONE,
  AI_HOME_Y,
  AI_REACT,
  AI_SPEED,
  PADDLE_MAX_CY,
  PADDLE_MIN_CY,
  PADDLE_SPEED,
} from "./constants";
import type { CaromState, PaddleState } from "./game";
import { clamp } from "./physics";

/**
 * Integrates `vy` over `dt` and clamps the center to the field. When the clamp
 * changed the value the velocity becomes the distance actually moved over `dt`,
 * so a paddle pinned against a bound carries `vy = 0`.
 */
export function integratePaddle(
  paddle: PaddleState,
  vy: number,
  dt: number,
): PaddleState {
  const unclamped = paddle.cy + vy * dt;
  const next = clamp(unclamped, PADDLE_MIN_CY, PADDLE_MAX_CY);
  const actualVy = next !== unclamped && dt > 0 ? (next - paddle.cy) / dt : vy;
  return { ...paddle, cy: next, vy: actualVy };
}

/** A human paddle's velocity from its two movement actions, each `0` or `1`. */
export function humanVy(up: number, down: number): number {
  return (down - up) * PADDLE_SPEED;
}

/** The AI's target and stop distance for the frame. */
export function aiTarget(state: DeepReadonly<CaromState>): {
  target: number;
  deadzone: number;
} {
  const ball = state.ball;
  if (
    state.ai.tracking &&
    state.screen === "playing" &&
    ball !== null &&
    ball.vx > 0
  ) {
    return { target: ball.y - ball.vy * AI_REACT, deadzone: AI_DEADZONE };
  }
  return { target: AI_HOME_Y, deadzone: AI_HOME_DEADZONE };
}

/** The AI's velocity for the frame, before integration. */
export function aiVy(
  state: DeepReadonly<CaromState>,
  paddle: PaddleState,
  dt: number,
): number {
  if (!state.ai.movement) return 0;
  const { target, deadzone } = aiTarget(state);
  const diff = target - paddle.cy;
  if (Math.abs(diff) <= deadzone) return 0;
  return Math.sign(diff) * Math.min(AI_SPEED, Math.abs(diff) / dt);
}
