import { describe, expect, it } from "vitest";
import { FIELD_CX, FIELD_CY, HOLD_TIME, OBSTACLE_CENTERS } from "./constants";
import {
  allObstacles,
  drawServeSign,
  obstacleAt,
  opponentOf,
  parkedBall,
  returnToTitle,
  startMatch,
  titleState,
  winnerOf,
} from "./world";

describe("the world", () => {
  it("parks the ball at home, held, with a full hold and no trail", () => {
    const ball = parkedBall();
    expect(ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      vx: 0,
      vy: 0,
      spin: 0,
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
    expect([1, -1]).toContain(ball.serveSign);
  });

  it("draws both serve signs over a run of draws", () => {
    const signs = new Set<number>();
    for (let i = 0; i < 200; i++) signs.add(drawServeSign());
    expect(signs).toEqual(new Set([1, -1]));
  });

  it("places obstacles at their fixed centers and refuses other indices", () => {
    expect(obstacleAt(0)).toEqual({ index: 0, cx: 490, cy: 220 });
    expect(obstacleAt(1)).toEqual({ index: 1, cx: 790, cy: 500 });
    expect(allObstacles()).toHaveLength(OBSTACLE_CENTERS.length);
    expect(() => obstacleAt(2)).toThrow(/names no obstacle/);
    expect(() => obstacleAt(-1)).toThrow();
    expect(() => obstacleAt(0.5)).toThrow();
  });

  it("names the opponent and applies the win rule", () => {
    expect(opponentOf("left")).toBe("right");
    expect(opponentOf("right")).toBe("left");
    expect(winnerOf({ p1: 11, p2: 9 })).toBe("left");
    expect(winnerOf({ p1: 11, p2: 10 })).toBeNull();
    expect(winnerOf({ p1: 10, p2: 12 })).toBe("right");
    expect(winnerOf({ p1: 10, p2: 10 })).toBeNull();
    expect(winnerOf({ p1: 13, p2: 11 })).toBe("left");
  });

  it("opens on the title screen with the values the spec fixes", () => {
    const s = titleState(true);
    expect(s).toMatchObject({
      screen: "title",
      mode: "solo",
      menuIndex: 0,
      titleIndex: 0,
      resumeScreen: "playing",
      score: { p1: 0, p2: 0 },
      winner: null,
      receiver: "left",
      ai: { tracking: true, movement: true },
      simTime: 0,
      muted: true,
      menuPresses: [],
    });
    expect(s.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      driven: false,
      drivenVy: 0,
    });
    expect(s.paddles.right).toEqual({
      cy: FIELD_CY,
      vy: 0,
      driven: false,
      drivenVy: 0,
    });
    expect(s.ball?.held).toBe(true);
    expect(s.obstacles).toEqual(allObstacles());
  });

  it("starts a match from any state, keeping titleIndex and the driven flags", () => {
    const before = {
      ...titleState(false),
      screen: "matchover" as const,
      titleIndex: 2,
      menuIndex: 1,
      score: { p1: 11, p2: 3 },
      winner: "left" as const,
      receiver: "right" as const,
      simTime: 42,
      paddles: {
        left: { cy: 100, vy: 50, driven: true, drivenVy: 200 },
        right: { cy: 600, vy: -50, driven: false, drivenVy: 0 },
      },
    };
    const s = startMatch(before, "versus");
    expect(s).toMatchObject({
      mode: "versus",
      screen: "countdown",
      resumeScreen: "playing",
      menuIndex: 0,
      titleIndex: 2,
      score: { p1: 0, p2: 0 },
      winner: null,
      receiver: "left",
      simTime: 42,
    });
    expect(s.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      driven: true,
      drivenVy: 200,
    });
    expect(s.paddles.right.cy).toBe(FIELD_CY);
    expect(s.ball).toMatchObject({
      held: true,
      holdTimer: HOLD_TIME,
      trail: [],
    });
  });

  it("returns to the title keeping titleIndex, simTime, and muted", () => {
    const mid = {
      ...startMatch(titleState(true), "versus"),
      titleIndex: 1,
      simTime: 9,
      score: { p1: 3, p2: 4 },
    };
    const s = returnToTitle(mid);
    expect(s).toMatchObject({
      screen: "title",
      mode: "solo",
      titleIndex: 1,
      menuIndex: 1,
      simTime: 9,
      muted: true,
      score: { p1: 0, p2: 0 },
    });
  });
});
