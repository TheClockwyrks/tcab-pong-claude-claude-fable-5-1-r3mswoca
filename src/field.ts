// A live frame of the field (specs/balls.md, specs/playfield.md): the paddles
// move, the ball waits or flies, a goal scores, and the trail is recorded.

import type { DeepReadonly } from "ts-essentials";
import {
  BALL_R,
  CUES,
  FIELD_W,
  SERVE_ANGLE,
  SERVE_SPEED,
  TRAIL_TIME,
  type CueName,
} from "./constants";
import type { BallState, CaromState, PaddleState, Side } from "./game";
import type { FrameInput } from "./input";
import { aiVy, humanVy, integratePaddle } from "./paddles";
import { stepBall } from "./physics";
import { opponentOf, parkedBall, winnerOf } from "./world";

export interface FieldFrame {
  readonly state: CaromState;
  readonly cues: readonly CueName[];
}

/** The velocity a paddle on `side` moves at this frame, before integration. */
export function paddleVy(
  state: DeepReadonly<CaromState>,
  side: Side,
  input: FrameInput,
  dt: number,
): number {
  const paddle = state.paddles[side];
  if (paddle.driven) return paddle.drivenVy;
  if (state.mode === "solo") {
    if (side === "right") return aiVy(state, paddle, dt);
    const up = Math.max(input.held["p1-up"], input.held["p2-up"]);
    const down = Math.max(input.held["p1-down"], input.held["p2-down"]);
    return humanVy(up, down);
  }
  return side === "left"
    ? humanVy(input.held["p1-up"], input.held["p1-down"])
    : humanVy(input.held["p2-up"], input.held["p2-down"]);
}

/** Both paddles moved and integrated for the frame. */
export function movePaddles(
  state: DeepReadonly<CaromState>,
  input: FrameInput,
  dt: number,
): { left: PaddleState; right: PaddleState } {
  return {
    left: integratePaddle(
      state.paddles.left,
      paddleVy(state, "left", input, dt),
      dt,
    ),
    right: integratePaddle(
      state.paddles.right,
      paddleVy(state, "right", input, dt),
      dt,
    ),
  };
}

/** The velocity a serve toward `receiver` leaves with. */
export function serveVelocity(
  receiver: Side,
  serveSign: 1 | -1,
): { vx: number; vy: number } {
  const dir = receiver === "left" ? -1 : 1;
  return {
    vx: dir * SERVE_SPEED * Math.cos(SERVE_ANGLE),
    vy: serveSign * SERVE_SPEED * Math.sin(SERVE_ANGLE),
  };
}

/** The side that scored on a ball past a goal, or `null` while it is in the field. */
export function scorerOf(ball: BallState): Side | null {
  if (ball.x - BALL_R > FIELD_W) return "left";
  if (ball.x + BALL_R < 0) return "right";
  return null;
}

/** The ball's trail with this frame's sample appended and the stale ones dropped. */
export function recordTrail(ball: BallState, simTime: number): BallState {
  const trail = ball.trail.filter((s) => simTime - s.t <= TRAIL_TIME);
  trail.push({ x: ball.x, y: ball.y, t: simTime });
  return { ...ball, trail };
}

/** A `countdown` frame: the hold counts down and an elapsed hold serves. */
function countdownFrame(state: CaromState, dt: number): CaromState {
  const ball = state.ball;
  if (ball === null) return state;
  const holdTimer = ball.holdTimer - dt;
  if (holdTimer > 0) return { ...state, ball: { ...ball, holdTimer } };
  const { vx, vy } = serveVelocity(state.receiver, ball.serveSign);
  return {
    ...state,
    screen: "playing",
    ball: { ...ball, holdTimer: 0, held: false, trail: [], vx, vy },
  };
}

/** A `playing` frame: the ball flies, and a goal scores. */
function playingFrame(
  state: CaromState,
  dt: number,
  cues: CueName[],
): CaromState {
  if (state.ball === null) return state;
  const { ball, raised } = stepBall(
    state.ball,
    state.paddles,
    state.obstacles,
    dt,
  );
  if (raised.paddle) cues.push(CUES.paddleHit);
  if (raised.wall) cues.push(CUES.wallBounce);
  if (raised.obstacle) cues.push(CUES.obstacleBounce);

  const scorer = scorerOf(ball);
  if (scorer === null) return { ...state, ball };

  cues.push(CUES.score);
  const score =
    scorer === "left"
      ? { p1: state.score.p1 + 1, p2: state.score.p2 }
      : { p1: state.score.p1, p2: state.score.p2 + 1 };
  const winner = winnerOf(score);
  if (winner !== null) {
    return { ...state, ball, score, winner, screen: "matchover", menuIndex: 0 };
  }
  return {
    ...state,
    score,
    ball: parkedBall(),
    receiver: opponentOf(scorer),
    screen: "countdown",
  };
}

/**
 * Advances a `countdown` or `playing` frame. `state` already carries this
 * frame's `simTime`.
 */
export function advanceField(
  state: DeepReadonly<CaromState>,
  input: FrameInput,
  dt: number,
): FieldFrame {
  const cues: CueName[] = [];
  let next: CaromState = { ...state, paddles: movePaddles(state, input, dt) };
  next =
    next.screen === "countdown"
      ? countdownFrame(next, dt)
      : playingFrame(next, dt, cues);
  if (next.ball !== null) {
    next = { ...next, ball: recordTrail(next.ball, next.simTime) };
  }
  return { state: next, cues };
}
