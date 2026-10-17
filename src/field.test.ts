import { describe, expect, it } from "vitest";
import {
  BALL_R,
  FIELD_CX,
  FIELD_CY,
  FIELD_W,
  HOLD_TIME,
  PADDLE_SPEED,
  SERVE_ANGLE,
  SERVE_SPEED,
  TRAIL_TIME,
  WIN_SCORE,
} from "./constants";
import {
  advanceField,
  movePaddles,
  paddleVy,
  recordTrail,
  scorerOf,
  serveVelocity,
} from "./field";
import type { CaromState } from "./game";
import { inputWith, NO_INPUT } from "./input";
import { parkedBall, startMatch, titleState } from "./world";

const DT = 1 / 60;

function countdown(mode: "solo" | "versus" = "solo"): CaromState {
  return startMatch(titleState(false), mode);
}

function playing(
  ball: Partial<NonNullable<CaromState["ball"]>> = {},
): CaromState {
  return {
    ...countdown(),
    screen: "playing",
    ball: { ...parkedBall(), held: false, holdTimer: 0, ...ball },
  };
}

describe("paddle movers", () => {
  it("drives the solo paddle from either pair of movement actions", () => {
    const s = countdown("solo");
    expect(paddleVy(s, "left", inputWith({ held: { "p2-down": 1 } }), DT)).toBe(
      PADDLE_SPEED,
    );
    expect(paddleVy(s, "left", inputWith({ held: { "p1-up": 1 } }), DT)).toBe(
      -PADDLE_SPEED,
    );
    expect(
      paddleVy(
        s,
        "left",
        inputWith({ held: { "p1-up": 1, "p2-down": 1 } }),
        DT,
      ),
    ).toBe(0);
  });

  it("gives each versus paddle its own actions", () => {
    const s = countdown("versus");
    const input = inputWith({ held: { "p1-down": 1, "p2-up": 1 } });
    expect(paddleVy(s, "left", input, DT)).toBe(PADDLE_SPEED);
    expect(paddleVy(s, "right", input, DT)).toBe(-PADDLE_SPEED);
  });

  it("moves the AI's paddle in solo and a driven paddle at drivenVy", () => {
    const s = countdown("solo");
    expect(paddleVy(s, "right", inputWith({ held: { "p2-up": 1 } }), DT)).toBe(
      0,
    );
    const driven: CaromState = {
      ...s,
      paddles: {
        ...s.paddles,
        right: { ...s.paddles.right, driven: true, drivenVy: -123 },
      },
    };
    expect(
      paddleVy(driven, "right", inputWith({ held: { "p2-down": 1 } }), DT),
    ).toBe(-123);
  });

  it("integrates both paddles for the frame", () => {
    const s = countdown("versus");
    const next = movePaddles(
      s,
      inputWith({ held: { "p1-down": 1, "p2-up": 1 } }),
      0.1,
    );
    expect(next.left.cy).toBeCloseTo(FIELD_CY + 72, 9);
    expect(next.right.cy).toBeCloseTo(FIELD_CY - 72, 9);
    expect(next.left.vy).toBe(PADDLE_SPEED);
  });
});

describe("serving", () => {
  it("leaves toward the receiver at SERVE_SPEED and SERVE_ANGLE", () => {
    const left = serveVelocity("left", 1);
    expect(left.vx).toBeCloseTo(-SERVE_SPEED * Math.cos(SERVE_ANGLE), 9);
    expect(left.vy).toBeCloseTo(SERVE_SPEED * Math.sin(SERVE_ANGLE), 9);
    const right = serveVelocity("right", -1);
    expect(right.vx).toBeGreaterThan(0);
    expect(right.vy).toBeLessThan(0);
  });

  it("counts the hold down and serves on the frame it elapses", () => {
    let s = countdown();
    const frames = Math.ceil(HOLD_TIME / DT);
    for (let i = 0; i < frames - 1; i++) {
      s = advanceField(s, NO_INPUT, DT).state;
      expect(s.screen).toBe("countdown");
      expect(s.ball?.held).toBe(true);
      expect(s.ball?.x).toBe(FIELD_CX);
    }
    const { state: served } = advanceField(s, NO_INPUT, DT);
    expect(served.screen).toBe("playing");
    expect(served.ball).toMatchObject({
      held: false,
      holdTimer: 0,
      x: FIELD_CX,
      y: FIELD_CY,
    });
    expect(served.ball?.vx).toBeLessThan(0);
    expect(served.ball?.trail).toHaveLength(1);
  });

  it("takes the serve sign the ball holds at the serve", () => {
    const s: CaromState = {
      ...countdown(),
      receiver: "right",
      ball: { ...parkedBall(), holdTimer: 0, serveSign: -1 },
    };
    const { state } = advanceField(s, NO_INPUT, DT);
    expect(state.ball?.vy).toBeLessThan(0);
    expect(state.ball?.vx).toBeGreaterThan(0);
    expect(state.ball?.serveSign).toBe(-1);
  });

  it("moves the paddles during the countdown", () => {
    const { state } = advanceField(
      countdown("versus"),
      inputWith({ held: { "p1-down": 1 } }),
      DT,
    );
    expect(state.paddles.left.cy).toBeGreaterThan(FIELD_CY);
  });

  it("does nothing to a field with no ball", () => {
    const { state, cues } = advanceField(
      { ...countdown(), ball: null },
      NO_INPUT,
      DT,
    );
    expect(state.ball).toBeNull();
    expect(state.screen).toBe("countdown");
    expect(cues).toEqual([]);
  });
});

describe("scoring", () => {
  it("tells a goal from a ball in the field", () => {
    expect(scorerOf({ ...parkedBall(), x: FIELD_W + BALL_R + 1 })).toBe("left");
    expect(scorerOf({ ...parkedBall(), x: -BALL_R - 1 })).toBe("right");
    expect(scorerOf({ ...parkedBall(), x: FIELD_W + BALL_R })).toBeNull();
    expect(scorerOf(parkedBall())).toBeNull();
  });

  it("scores, parks the ball, and serves toward the side scored on", () => {
    const s = playing({ x: FIELD_W - 2, y: 100, vx: 900, vy: 0 });
    const { state, cues } = advanceField(s, NO_INPUT, DT);
    expect(state.score).toEqual({ p1: 1, p2: 0 });
    expect(state.screen).toBe("countdown");
    expect(state.receiver).toBe("right");
    expect(state.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      held: true,
      holdTimer: HOLD_TIME,
    });
    expect(cues).toContain("score");
  });

  it("ends the match on the win rule and leaves the ball where it is", () => {
    const s: CaromState = {
      ...playing({ x: 2, y: 100, vx: -900, vy: 0 }),
      score: { p1: 5, p2: WIN_SCORE - 1 },
    };
    const { state } = advanceField(s, NO_INPUT, DT);
    expect(state.score).toEqual({ p1: 5, p2: WIN_SCORE });
    expect(state.winner).toBe("right");
    expect(state.screen).toBe("matchover");
    expect(state.menuIndex).toBe(0);
    expect(state.ball?.x).toBeLessThan(0);
  });

  it("plays on at deuce until a two-point lead", () => {
    const s: CaromState = {
      ...playing({ x: FIELD_W - 2, y: 100, vx: 900, vy: 0 }),
      score: { p1: 10, p2: 10 },
    };
    const { state } = advanceField(s, NO_INPUT, DT);
    expect(state.score).toEqual({ p1: 11, p2: 10 });
    expect(state.screen).toBe("countdown");
    expect(state.winner).toBeNull();
  });
});

describe("the trail", () => {
  it("appends a sample each frame and drops those older than TRAIL_TIME", () => {
    let ball = { ...parkedBall(), held: false };
    let t = 0;
    for (let i = 0; i < 30; i++) {
      t += DT;
      ball = recordTrail({ ...ball, x: ball.x + 5 }, t);
    }
    expect(ball.trail.length).toBeGreaterThan(2);
    for (const sample of ball.trail)
      expect(t - sample.t).toBeLessThanOrEqual(TRAIL_TIME);
    const last = ball.trail[ball.trail.length - 1];
    expect(last).toEqual({ x: ball.x, y: ball.y, t });
    const first = ball.trail[0];
    if (first === undefined || last === undefined)
      throw new Error("empty trail");
    expect(first.t).toBeLessThan(last.t);
  });

  it("is recorded on countdown frames at the home point", () => {
    const { state } = advanceField(
      { ...countdown(), simTime: 1 },
      NO_INPUT,
      DT,
    );
    expect(state.ball?.trail).toEqual([{ x: FIELD_CX, y: FIELD_CY, t: 1 }]);
  });

  it("raises the paddle, wall, and obstacle cues once per frame", () => {
    const wall = playing({ x: 300, y: BALL_R + 1, vx: 0, vy: -500 });
    expect(advanceField(wall, NO_INPUT, DT).cues).toEqual(["wall-bounce"]);
    const paddle = playing({ x: 80, y: FIELD_CY, vx: -800, vy: 0 });
    expect(advanceField(paddle, NO_INPUT, DT).cues).toEqual(["paddle-hit"]);
    const obstacle = playing({ x: 470, y: 220, vx: 800, vy: 0 });
    expect(advanceField(obstacle, NO_INPUT, DT).cues).toEqual([
      "obstacle-bounce",
    ]);
  });
});
