import { describe, expect, it } from "vitest";
import {
  BALL_R,
  FIELD_H,
  MAX_BOUNCE_ANGLE,
  MAX_SUBSTEP,
  OBSTACLES,
  P1_X1,
  P2_X0,
  PADDLE_HALF,
  SPEED_CAP,
  SPEED_MULT,
  SPIN_CLAMP,
  SPIN_FROM_PADDLE,
  SPIN_HALFLIFE,
} from "./constants";
import type { PaddleState } from "./game";
import {
  applySpin,
  decaySpin,
  obstacleRect,
  paddleBounce,
  paddleRect,
  resolveCircleRect,
  resolveWalls,
  stepBall,
  substepCount,
  type Body,
} from "./physics";
import { allObstacles, parkedBall, restingPaddle } from "./world";

const paddles = { left: restingPaddle(), right: restingPaddle() };

function body(partial: Partial<Body>): Body {
  return { x: 640, y: 360, vx: 0, vy: 0, spin: 0, ...partial };
}

describe("sub-steps", () => {
  it("cuts a frame so the ball travels at most MAX_SUBSTEP units per step", () => {
    expect(substepCount(0, 1 / 60)).toBe(1);
    expect(substepCount(520, 1 / 60)).toBe(Math.ceil(520 / 60 / MAX_SUBSTEP));
    expect(substepCount(980, 0.016)).toBe(Math.ceil((980 * 0.016) / 4));
  });
});

describe("spin", () => {
  it("turns +x toward +y for positive spin and keeps the speed", () => {
    const b = body({ vx: 500, vy: 0, spin: 500 });
    applySpin(b, 0.1);
    expect(b.vy).toBeGreaterThan(0);
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(500, 6);
    expect(Math.atan2(b.vy, b.vx)).toBeCloseTo((500 / 500) * 0.1, 9);
  });

  it("turns the other way for negative spin", () => {
    const b = body({ vx: 500, vy: 0, spin: -500 });
    applySpin(b, 0.1);
    expect(b.vy).toBeLessThan(0);
  });

  it("leaves a ball at rest alone", () => {
    const b = body({ spin: 900 });
    applySpin(b, 0.1);
    expect(b).toMatchObject({ vx: 0, vy: 0 });
  });

  it("halves every SPIN_HALFLIFE seconds", () => {
    const b = body({ spin: 800 });
    decaySpin(b, SPIN_HALFLIFE);
    expect(b.spin).toBeCloseTo(400, 9);
    decaySpin(b, SPIN_HALFLIFE / 2);
    expect(b.spin).toBeCloseTo(400 / Math.SQRT2, 9);
  });
});

describe("walls", () => {
  it("reflects off the top wall when moving into it", () => {
    const b = body({ y: 3, vy: -200, vx: 100 });
    expect(resolveWalls(b)).toBe(true);
    expect(b.y).toBe(BALL_R);
    expect(b.vy).toBe(200);
    expect(b.vx).toBe(100);
  });

  it("reflects off the bottom wall", () => {
    const b = body({ y: FIELD_H - 2, vy: 150 });
    expect(resolveWalls(b)).toBe(true);
    expect(b.y).toBe(FIELD_H - BALL_R);
    expect(b.vy).toBe(-150);
  });

  it("does nothing for a ball moving away from a wall it overlaps", () => {
    const b = body({ y: 3, vy: 50 });
    expect(resolveWalls(b)).toBe(false);
    expect(b.y).toBe(3);
  });
});

describe("circle against an axis-aligned rectangle", () => {
  const rect = { x0: 480, y0: 150, x1: 500, y1: 290 };

  it("reports no contact when the center is outside the expanded rectangle", () => {
    const b = body({ x: 480 - BALL_R, y: 200 });
    expect(resolveCircleRect(b, rect)).toBeNull();
    expect(b.x).toBe(480 - BALL_R);
  });

  it("strikes the left face and reverses an inward vx", () => {
    const b = body({ x: 478, y: 220, vx: 300, vy: 20 });
    expect(resolveCircleRect(b, rect)).toBe("left");
    expect(b.x).toBe(480 - BALL_R);
    expect(b.vx).toBe(-300);
    expect(b.vy).toBe(20);
  });

  it("strikes the right face and leaves an outward vx alone", () => {
    const b = body({ x: 503, y: 220, vx: 300 });
    expect(resolveCircleRect(b, rect)).toBe("right");
    expect(b.x).toBe(500 + BALL_R);
    expect(b.vx).toBe(300);
  });

  it("strikes the top and bottom faces", () => {
    const top = body({ x: 490, y: 146, vy: 100 });
    expect(resolveCircleRect(top, rect)).toBe("top");
    expect(top.y).toBe(150 - BALL_R);
    expect(top.vy).toBe(-100);

    const bottom = body({ x: 490, y: 295, vy: -100 });
    expect(resolveCircleRect(bottom, rect)).toBe("bottom");
    expect(bottom.y).toBe(290 + BALL_R);
    expect(bottom.vy).toBe(100);
  });

  it("breaks a tie in the order left, right, top, bottom", () => {
    // Equidistant from the left face and the top face: left wins.
    const b = body({ x: 480 - BALL_R + 5, y: 150 - BALL_R + 5, vx: 1, vy: 1 });
    expect(resolveCircleRect(b, rect)).toBe("left");
  });
});

describe("the paddle bounce", () => {
  it("sends a center hit straight across at SPEED_MULT times the speed", () => {
    const paddle: PaddleState = { ...restingPaddle(), cy: 360 };
    const b = body({ x: 60, y: 360, vx: -520, vy: 0 });
    paddleBounce(b, "left", paddle);
    expect(b.vx).toBeCloseTo(520 * SPEED_MULT, 9);
    expect(b.vy).toBeCloseTo(0, 9);
    expect(b.x).toBe(P1_X1 + BALL_R);
  });

  it("sends an edge hit at MAX_BOUNCE_ANGLE and clamps past the edge", () => {
    const paddle: PaddleState = { ...restingPaddle(), cy: 360 };
    const b = body({ x: 1225, y: 360 - PADDLE_HALF - 30, vx: 520, vy: 0 });
    paddleBounce(b, "right", paddle);
    expect(Math.atan2(b.vy, -b.vx)).toBeCloseTo(-MAX_BOUNCE_ANGLE, 9);
    expect(b.vx).toBeLessThan(0);
    expect(b.x).toBe(P2_X0 - BALL_R);
  });

  it("caps the speed at SPEED_CAP", () => {
    const b = body({ x: 60, vx: -SPEED_CAP, vy: 0 });
    paddleBounce(b, "left", restingPaddle());
    expect(Math.hypot(b.vx, b.vy)).toBeCloseTo(SPEED_CAP, 9);
  });

  it("adds spin from the paddle's motion, clamped", () => {
    const moving: PaddleState = { ...restingPaddle(), vy: 400 };
    const b = body({ x: 60, vx: -520, spin: 100 });
    paddleBounce(b, "left", moving);
    expect(b.spin).toBeCloseTo(100 + 400 * SPIN_FROM_PADDLE, 9);

    const fast: PaddleState = { ...restingPaddle(), vy: -720 };
    const c = body({ x: 60, vx: -520, spin: -500 });
    paddleBounce(c, "left", fast);
    expect(c.spin).toBe(-SPIN_CLAMP);

    const still = body({ x: 60, vx: -520, spin: 42 });
    paddleBounce(still, "left", restingPaddle());
    expect(still.spin).toBe(42);
  });
});

describe("stepBall", () => {
  it("advances the ball by its velocity over dt", () => {
    const ball = { ...parkedBall(), held: false, vx: 300, vy: -60 };
    const { ball: next, raised } = stepBall(ball, paddles, [], 0.1);
    expect(next.x).toBeCloseTo(640 + 30, 6);
    expect(next.y).toBeCloseTo(360 - 6, 6);
    expect(raised).toEqual({ paddle: false, wall: false, obstacle: false });
  });

  it("raises a paddle hit and sends the ball back toward the opponent", () => {
    const ball = {
      ...parkedBall(),
      held: false,
      x: 90,
      y: 360,
      vx: -520,
      vy: 0,
    };
    const { ball: next, raised } = stepBall(ball, paddles, [], 0.1);
    expect(raised.paddle).toBe(true);
    expect(next.vx).toBeGreaterThan(0);
    expect(Math.hypot(next.vx, next.vy)).toBeCloseTo(520 * SPEED_MULT, 6);
  });

  it("bounces off an end cap like a wall, keeping speed and spin", () => {
    const cy = 360;
    const ball = {
      ...parkedBall(),
      held: false,
      x: 56,
      y: cy - PADDLE_HALF - BALL_R - 20,
      vx: 0,
      vy: 400,
      spin: 300,
    };
    const { ball: next, raised } = stepBall(ball, paddles, [], 0.1);
    expect(raised.wall).toBe(true);
    expect(raised.paddle).toBe(false);
    expect(next.vy).toBeLessThan(0);
    expect(Math.hypot(next.vx, next.vy)).toBeCloseTo(400, 6);
    expect(next.spin).toBeCloseTo(300 * Math.pow(0.5, 0.1 / SPIN_HALFLIFE), 6);
  });

  it("bounces off an obstacle without changing speed or spin", () => {
    const a = OBSTACLES[0];
    if (a === undefined) throw new Error("no obstacle A");
    const ball = {
      ...parkedBall(),
      held: false,
      x: a.x0 - BALL_R - 30,
      y: 220,
      vx: 600,
      vy: 0,
      spin: 200,
    };
    const { ball: next, raised } = stepBall(ball, paddles, allObstacles(), 0.1);
    expect(raised.obstacle).toBe(true);
    expect(next.vx).toBeLessThan(0);
    expect(Math.hypot(next.vx, next.vy)).toBeCloseTo(600, 6);
    expect(next.spin).toBeCloseTo(200 * Math.pow(0.5, 0.1 / SPIN_HALFLIFE), 6);
  });

  it("ignores an absent obstacle", () => {
    const a = OBSTACLES[0];
    if (a === undefined) throw new Error("no obstacle A");
    const ball = {
      ...parkedBall(),
      held: false,
      x: a.x0 - BALL_R - 30,
      y: 220,
      vx: 600,
      vy: 0,
    };
    const { ball: next, raised } = stepBall(ball, paddles, [], 0.2);
    expect(raised.obstacle).toBe(false);
    expect(next.x).toBeGreaterThan(a.x1);
  });

  it("keeps the ball inside the field at the speed cap over a long flight", () => {
    let ball = { ...parkedBall(), held: false, vx: 700, vy: 686, spin: 400 };
    for (let i = 0; i < 600; i++) {
      ball = stepBall(ball, paddles, allObstacles(), 1 / 60).ball;
      if (ball.x > BALL_R && ball.x < 1280 - BALL_R) {
        expect(ball.y).toBeGreaterThanOrEqual(BALL_R - 1e-9);
        expect(ball.y).toBeLessThanOrEqual(FIELD_H - BALL_R + 1e-9);
      }
      for (const rect of OBSTACLES) {
        const inside =
          ball.x > rect.x0 - BALL_R + 1e-9 &&
          ball.x < rect.x1 + BALL_R - 1e-9 &&
          ball.y > rect.y0 - BALL_R + 1e-9 &&
          ball.y < rect.y1 + BALL_R - 1e-9;
        expect(inside).toBe(false);
      }
      if (ball.x < 0 || ball.x > 1280) break;
    }
  });

  it("resolves obstacle A before obstacle B whatever order the state lists", () => {
    const reversed = [...allObstacles()].reverse();
    const ball = {
      ...parkedBall(),
      held: false,
      x: 470,
      y: 220,
      vx: 600,
      vy: 0,
    };
    const forward = stepBall(ball, paddles, allObstacles(), 0.05).ball;
    const backward = stepBall(ball, paddles, reversed, 0.05).ball;
    expect(backward).toEqual(forward);
  });

  it("describes each paddle's and obstacle's rectangle", () => {
    expect(paddleRect("left", { cy: 100 })).toEqual({
      x0: 48,
      x1: 64,
      y0: 45,
      y1: 155,
    });
    expect(paddleRect("right", { cy: 600 })).toEqual({
      x0: 1216,
      x1: 1232,
      y0: 545,
      y1: 655,
    });
    expect(obstacleRect({ index: 1, cx: 790, cy: 500 })).toEqual(OBSTACLES[1]);
    expect(() => obstacleRect({ index: 5, cx: 0, cy: 0 })).toThrow();
  });
});
