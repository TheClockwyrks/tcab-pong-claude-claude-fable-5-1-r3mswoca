// The ball's physics (specs/balls.md): sub-stepped integration, spin, and the
// collisions with the walls, the paddles, and the obstacles. Everything here is
// a pure function of the values it is handed; nothing reads a clock or a canvas.

import {
  BALL_R,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLES,
  P1_X0,
  P1_X1,
  P2_X0,
  P2_X1,
  PADDLE_HALF,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
  type Rect,
} from "./constants";
import type { BallState, ObstacleState, PaddleState, Side } from "./game";

/** The ball's moving parts, as the sub-steps work on them. */
export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
  spin: number;
}

export type Face = "left" | "right" | "top" | "bottom";

/** Which collisions a step raised, each at most once however many sub-steps raised it. */
export interface Collisions {
  paddle: boolean;
  wall: boolean;
  obstacle: boolean;
}

export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/** The paddle on `side` as the axis-aligned rectangle the ball collides with. */
export function paddleRect(side: Side, paddle: { cy: number }): Rect {
  return {
    x0: side === "left" ? P1_X0 : P2_X0,
    x1: side === "left" ? P1_X1 : P2_X1,
    y0: paddle.cy - PADDLE_HALF,
    y1: paddle.cy + PADDLE_HALF,
  };
}

/** Obstacle `index` as the rectangle the ball collides with. */
export function obstacleRect(obstacle: ObstacleState): Rect {
  const rect = OBSTACLES[obstacle.index];
  if (rect === undefined) {
    throw new Error(`Carom: obstacle index ${obstacle.index} has no rectangle`);
  }
  return rect;
}

/** How many sub-steps a frame of `dt` seconds takes at `speed`. */
export function substepCount(speed: number, dt: number): number {
  return Math.max(1, Math.ceil((speed * dt) / MAX_SUBSTEP));
}

/**
 * Spin turns the velocity by `(spin / speed) * h` radians, a positive angle
 * turning the direction of travel from `+x` toward `+y`. Speed is unchanged, and
 * a ball at rest is left alone.
 */
export function applySpin(body: Body, h: number): void {
  const speed = Math.hypot(body.vx, body.vy);
  if (speed <= 0) return;
  const angle = (body.spin / speed) * h;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const vx = body.vx * cos - body.vy * sin;
  const vy = body.vx * sin + body.vy * cos;
  body.vx = vx;
  body.vy = vy;
}

/** Spin loses half its magnitude every `SPIN_HALFLIFE` seconds. */
export function decaySpin(body: Body, h: number): void {
  body.spin *= Math.pow(0.5, h / SPIN_HALFLIFE);
}

/** The top and bottom walls. Returns whether the ball reflected. */
export function resolveWalls(body: Body): boolean {
  if (body.y - BALL_R < 0 && body.vy < 0) {
    body.y = BALL_R;
    body.vy = -body.vy;
    return true;
  }
  if (body.y + BALL_R > FIELD_H && body.vy > 0) {
    body.y = FIELD_H - BALL_R;
    body.vy = -body.vy;
    return true;
  }
  return false;
}

/**
 * The circle against an axis-aligned rectangle rule (specs/balls.md): when the
 * ball's center is strictly inside the rectangle expanded by `BALL_R`, it is
 * placed off the face of least penetration (ties going left, right, top,
 * bottom) and the velocity component into that face is reversed. Returns the
 * struck face, or `null` when there was no overlap.
 */
export function resolveCircleRect(body: Body, rect: Rect): Face | null {
  const left = body.x - (rect.x0 - BALL_R);
  const right = rect.x1 + BALL_R - body.x;
  const top = body.y - (rect.y0 - BALL_R);
  const bottom = rect.y1 + BALL_R - body.y;
  if (left <= 0 || right <= 0 || top <= 0 || bottom <= 0) return null;

  let face: Face = "left";
  let depth = left;
  if (right < depth) {
    face = "right";
    depth = right;
  }
  if (top < depth) {
    face = "top";
    depth = top;
  }
  if (bottom < depth) {
    face = "bottom";
  }

  switch (face) {
    case "left":
      body.x = rect.x0 - BALL_R;
      if (body.vx > 0) body.vx = -body.vx;
      break;
    case "right":
      body.x = rect.x1 + BALL_R;
      if (body.vx < 0) body.vx = -body.vx;
      break;
    case "top":
      body.y = rect.y0 - BALL_R;
      if (body.vy > 0) body.vy = -body.vy;
      break;
    case "bottom":
      body.y = rect.y1 + BALL_R;
      if (body.vy < 0) body.vy = -body.vy;
      break;
  }
  return face;
}

/**
 * The paddle bounce (specs/balls.md): the outgoing angle from the contact
 * point, the speed multiplied up to the cap, spin from the paddle's motion, and
 * the ball placed off the paddle's front face.
 */
export function paddleBounce(
  body: Body,
  side: Side,
  paddle: PaddleState,
): void {
  const offset = clamp((body.y - paddle.cy) / PADDLE_HALF, -1, 1);
  const theta = offset * MAX_BOUNCE_ANGLE;
  const speed = Math.min(Math.hypot(body.vx, body.vy) * SPEED_MULT, SPEED_CAP);
  const dir = side === "left" ? 1 : -1;
  body.vx = dir * speed * Math.cos(theta);
  body.vy = speed * Math.sin(theta);
  body.spin = clamp(
    body.spin + paddle.vy * SPIN_FROM_PADDLE,
    -SPIN_CLAMP,
    SPIN_CLAMP,
  );
  body.x = side === "left" ? P1_X1 + BALL_R : P2_X0 - BALL_R;
}

/**
 * Resolves the ball against one paddle: a left or right face is a paddle hit,
 * an end cap bounces like a wall.
 */
export function resolvePaddle(
  body: Body,
  side: Side,
  paddle: PaddleState,
  raised: Collisions,
): void {
  const face = resolveCircleRect(body, paddleRect(side, paddle));
  if (face === null) return;
  if (face === "left" || face === "right") {
    paddleBounce(body, side, paddle);
    raised.paddle = true;
  } else {
    raised.wall = true;
  }
}

/** One sub-step of `h` seconds, in the order specs/balls.md fixes. */
export function substep(
  body: Body,
  h: number,
  paddles: { readonly left: PaddleState; readonly right: PaddleState },
  obstacles: readonly ObstacleState[],
  raised: Collisions,
): void {
  applySpin(body, h);
  decaySpin(body, h);
  body.x += body.vx * h;
  body.y += body.vy * h;
  if (resolveWalls(body)) raised.wall = true;
  resolvePaddle(body, "left", paddles.left, raised);
  resolvePaddle(body, "right", paddles.right, raised);
  for (const obstacle of obstacles) {
    if (resolveCircleRect(body, obstacleRect(obstacle)) !== null) {
      raised.obstacle = true;
    }
  }
}

/**
 * Advances a flying ball by `dt` seconds in sub-steps, resolving every
 * collision on the way. The trail is left to the caller.
 */
export function stepBall(
  ball: BallState,
  paddles: { readonly left: PaddleState; readonly right: PaddleState },
  obstacles: readonly ObstacleState[],
  dt: number,
): { ball: BallState; raised: Collisions } {
  const body: Body = {
    x: ball.x,
    y: ball.y,
    vx: ball.vx,
    vy: ball.vy,
    spin: ball.spin,
  };
  const raised: Collisions = { paddle: false, wall: false, obstacle: false };
  // Obstacle A before obstacle B, whatever order the state lists them in.
  const ordered = [...obstacles].sort((a, b) => a.index - b.index);
  const n = substepCount(Math.hypot(body.vx, body.vy), dt);
  const h = dt / n;
  for (let i = 0; i < n; i++) substep(body, h, paddles, ordered, raised);
  return {
    ball: {
      ...ball,
      x: body.x,
      y: body.y,
      vx: body.vx,
      vy: body.vy,
      spin: body.spin,
    },
    raised,
  };
}
