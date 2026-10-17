import { describe, expect, it } from "vitest";
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
import type { CaromState } from "./game";
import { aiTarget, aiVy, humanVy, integratePaddle } from "./paddles";
import { parkedBall, restingPaddle, startMatch, titleState } from "./world";

describe("integratePaddle", () => {
  it("moves by vy * dt and keeps vy", () => {
    const next = integratePaddle(restingPaddle(), 300, 0.1);
    expect(next.cy).toBeCloseTo(390, 9);
    expect(next.vy).toBe(300);
  });

  it("clamps to the field and reports the distance actually moved", () => {
    const near = { ...restingPaddle(), cy: PADDLE_MAX_CY - 10 };
    const next = integratePaddle(near, PADDLE_SPEED, 0.1);
    expect(next.cy).toBe(PADDLE_MAX_CY);
    expect(next.vy).toBeCloseTo(100, 9);
  });

  it("carries vy = 0 while pinned against a bound", () => {
    const pinned = { ...restingPaddle(), cy: PADDLE_MIN_CY };
    const next = integratePaddle(pinned, -PADDLE_SPEED, 1 / 60);
    expect(next.cy).toBe(PADDLE_MIN_CY);
    expect(next.vy).toBe(0);
  });

  it("keeps the requested vy when dt is 0", () => {
    const pinned = { ...restingPaddle(), cy: PADDLE_MIN_CY };
    const next = integratePaddle(pinned, -PADDLE_SPEED, 0);
    expect(next.cy).toBe(PADDLE_MIN_CY);
    expect(next.vy).toBe(-PADDLE_SPEED);
  });
});

describe("humanVy", () => {
  it("is axis times PADDLE_SPEED", () => {
    expect(humanVy(0, 0)).toBe(0);
    expect(humanVy(1, 0)).toBe(-PADDLE_SPEED);
    expect(humanVy(0, 1)).toBe(PADDLE_SPEED);
    expect(humanVy(1, 1)).toBe(0);
  });
});

describe("the AI", () => {
  const playing = (ball: Partial<CaromState["ball"]> & object): CaromState => ({
    ...startMatch(titleState(false), "solo"),
    screen: "playing",
    ball: { ...parkedBall(), held: false, ...ball },
  });

  it("rests at home with the home deadzone while the ball travels away", () => {
    const s = playing({ x: 400, y: 100, vx: -500, vy: 0 });
    expect(aiTarget(s)).toEqual({
      target: AI_HOME_Y,
      deadzone: AI_HOME_DEADZONE,
    });
  });

  it("leads the ball by AI_REACT while it approaches", () => {
    const s = playing({ x: 900, y: 200, vx: 500, vy: 100 });
    expect(aiTarget(s)).toEqual({
      target: 200 - 100 * AI_REACT,
      deadzone: AI_DEADZONE,
    });
  });

  it("homes during the countdown and with no ball", () => {
    const countdown = { ...playing({ vx: 500 }), screen: "countdown" as const };
    expect(aiTarget(countdown).target).toBe(AI_HOME_Y);
    const empty = { ...playing({ vx: 500 }), ball: null };
    expect(aiTarget(empty).target).toBe(AI_HOME_Y);
  });

  it("homes with tracking off whatever the ball does", () => {
    const s = {
      ...playing({ x: 900, y: 200, vx: 500, vy: 0 }),
      ai: { tracking: false, movement: true },
    };
    expect(aiTarget(s)).toEqual({
      target: AI_HOME_Y,
      deadzone: AI_HOME_DEADZONE,
    });
  });

  it("stops inside the deadzone and otherwise moves at up to AI_SPEED", () => {
    const s = playing({ x: 900, y: 200, vx: 500, vy: 0 });
    expect(aiVy(s, { ...restingPaddle(), cy: 205 }, 1 / 60)).toBe(0);
    expect(aiVy(s, { ...restingPaddle(), cy: 600 }, 1 / 60)).toBe(-AI_SPEED);
    expect(aiVy(s, { ...restingPaddle(), cy: 100 }, 1 / 60)).toBe(AI_SPEED);
    // Close enough to reach the target this frame: exactly the distance over dt.
    expect(aiVy(s, { ...restingPaddle(), cy: 188 }, 0.1)).toBeCloseTo(120, 9);
  });

  it("stands still with movement off", () => {
    const s = {
      ...playing({ x: 900, y: 200, vx: 500, vy: 0 }),
      ai: { tracking: true, movement: false },
    };
    expect(aiVy(s, { ...restingPaddle(), cy: 600 }, 1 / 60)).toBe(0);
  });
});
