import { describe, expect, it } from "vitest";
import {
  CAROM_DEBUG_VERSION,
  FIELD_CX,
  FIELD_CY,
  HOLD_TIME,
} from "./constants";
import { createDebugApi, snapshotOf } from "./debug";
import type { CaromState } from "./game";
import { menuItemRect } from "./menus";
import { allObstacles, startMatch, titleState } from "./world";

const debug = createDebugApi();

function midMatch(): CaromState {
  const s = startMatch(titleState(true), "versus");
  return {
    ...s,
    screen: "playing",
    titleIndex: 2,
    simTime: 12.5,
    score: { p1: 4, p2: 6 },
    ball: {
      ...s.ball!,
      held: false,
      holdTimer: 0,
      x: 300,
      y: 200,
      vx: 300,
      vy: -400,
      spin: 50,
      trail: [{ x: 1, y: 2, t: 3 }],
    },
    paddles: {
      left: { cy: 100, vy: 10, driven: true, drivenVy: 20 },
      right: { cy: 600, vy: -10, driven: false, drivenVy: -20 },
    },
    ai: { tracking: false, movement: false },
  };
}

describe("the surface", () => {
  it("carries the version", () => {
    expect(debug.version).toBe(CAROM_DEBUG_VERSION);
  });

  it("snapshots the whole declared state with speed worked out", () => {
    const s = midMatch();
    const snap = debug.snapshot(s);
    expect(snap).toEqual({
      version: 1,
      screen: "playing",
      mode: "versus",
      menuIndex: 0,
      titleIndex: 2,
      resumeScreen: "playing",
      score: { p1: 4, p2: 6 },
      winner: null,
      muted: true,
      paddles: {
        left: { cy: 100, vy: 10, driven: true, drivenVy: 20 },
        right: { cy: 600, vy: -10, driven: false, drivenVy: -20 },
      },
      ai: { tracking: false, movement: false },
      receiver: "left",
      ball: {
        x: 300,
        y: 200,
        vx: 300,
        vy: -400,
        speed: 500,
        spin: 50,
        held: false,
        holdTimer: 0,
        serveSign: s.ball!.serveSign,
        trail: [{ x: 1, y: 2, t: 3 }],
      },
      obstacles: [
        { index: 0, cx: 490, cy: 220 },
        { index: 1, cx: 790, cy: 500 },
      ],
      simTime: 12.5,
    });
    // Plain data: the copies are the snapshot's own.
    expect(snap.ball?.trail).not.toBe(s.ball?.trail);
    expect(snapshotOf({ ...s, ball: null, obstacles: [] })).toMatchObject({
      ball: null,
      obstacles: [],
    });
  });

  it("clears and rebuilds the world", () => {
    const cleared = debug.clearWorld(midMatch());
    expect(cleared.ball).toBeNull();
    expect(cleared.obstacles).toEqual([]);
    expect(cleared.paddles.left.cy).toBe(100);
    const withBall = debug.spawnBall(cleared);
    expect(withBall.ball).toMatchObject({
      x: FIELD_CX,
      y: FIELD_CY,
      held: true,
      holdTimer: HOLD_TIME,
      vx: 0,
      vy: 0,
      spin: 0,
      trail: [],
    });
    const withB = debug.spawnObstacle(cleared, 1);
    expect(withB.obstacles).toEqual([{ index: 1, cx: 790, cy: 500 }]);
    const withBoth = debug.spawnObstacle(withB, 0);
    expect(withBoth.obstacles).toEqual(allObstacles());
    expect(debug.spawnObstacle(withBoth, 0).obstacles).toEqual(allObstacles());
    expect(() => debug.spawnObstacle(cleared, 2)).toThrow(/names no obstacle/);
    // Spawning a present ball returns it home.
    expect(debug.spawnBall(midMatch()).ball?.x).toBe(FIELD_CX);
  });

  it("resets to the title screen, leaving the mute bit alone", () => {
    const s = debug.reset({ ...midMatch(), muted: true });
    expect(s).toMatchObject({
      ...titleState(true),
      ball: expect.objectContaining({ held: true, holdTimer: HOLD_TIME }),
      muted: true,
      titleIndex: 0,
      simTime: 0,
    });
    expect(s.paddles.left).toEqual({
      cy: FIELD_CY,
      vy: 0,
      driven: false,
      drivenVy: 0,
    });
    expect(s.ai).toEqual({ tracking: true, movement: true });
    expect(debug.reset({ ...midMatch(), muted: false }).muted).toBe(false);
  });

  it("reconciles to an equal state and is idempotent", () => {
    const s = midMatch();
    const once = debug.reconcile(s);
    expect(once).toEqual(s);
    expect(debug.reconcile(once)).toEqual(s);
    expect(debug.snapshot(once).ball?.speed).toBe(500);
  });

  it("poses the screens and menus", () => {
    const s = midMatch();
    expect(debug.setScreen(s, "paused")).toMatchObject({
      screen: "paused",
      score: { p1: 4, p2: 6 },
      menuIndex: 0,
    });
    expect(debug.setMode(s, "solo").mode).toBe("solo");
    expect(debug.setMenuIndex(s, 2).menuIndex).toBe(2);
    expect(debug.setTitleIndex(s, 1).titleIndex).toBe(1);
    expect(debug.setResumeScreen(s, "countdown").resumeScreen).toBe(
      "countdown",
    );
    expect(() => debug.setScreen(s, "lobby" as never)).toThrow(
      /names no screen/,
    );
    expect(() => debug.setMode(s, "coop" as never)).toThrow(/names no mode/);
    expect(() => debug.setResumeScreen(s, "title" as never)).toThrow();
    expect(() => debug.setMenuIndex(s, -1)).toThrow();
    expect(() => debug.setTitleIndex(s, 0.5)).toThrow();
  });

  it("poses the match state", () => {
    const s = midMatch();
    expect(debug.setScore(s, 10, 10).score).toEqual({ p1: 10, p2: 10 });
    expect(debug.setWinner(s, "right").winner).toBe("right");
    expect(debug.setWinner(debug.setWinner(s, "left"), null).winner).toBeNull();
    expect(debug.setReceiver(s, "right").receiver).toBe("right");
    expect(() => debug.setReceiver(s, "middle" as never)).toThrow(
      /names no side/,
    );
    expect(() => debug.setWinner(s, "both" as never)).toThrow();
    expect(() => debug.setScore(s, Number.NaN, 0)).toThrow();
  });

  it("poses the paddles one field at a time", () => {
    const s = midMatch();
    const moved = debug.setPaddleCy(s, "right", 333);
    expect(moved.paddles.right).toEqual({ ...s.paddles.right, cy: 333 });
    expect(moved.paddles.left).toEqual(s.paddles.left);
    const driven = debug.setPaddleVy(s, "left", 999);
    expect(driven.paddles.left).toEqual({
      ...s.paddles.left,
      drivenVy: 999,
      vy: 10,
    });
    const released = debug.setPaddleDriven(s, "left", false);
    expect(released.paddles.left.driven).toBe(false);
    expect(released.paddles.right.driven).toBe(false);
    expect(debug.setPaddleDriven(s, "right", true).paddles.right.driven).toBe(
      true,
    );
    expect(() => debug.setPaddleCy(s, "top" as never, 1)).toThrow();
  });

  it("poses the ball and fails loudly without one", () => {
    const s = midMatch();
    expect(debug.setBallPosition(s, 1, 2).ball).toMatchObject({
      x: 1,
      y: 2,
      vx: 300,
    });
    expect(debug.setBallVelocity(s, -5, 6).ball).toMatchObject({
      vx: -5,
      vy: 6,
      x: 300,
    });
    expect(debug.setBallSpin(s, -900).ball?.spin).toBe(-900);
    expect(debug.setBallHeld(s, true).ball?.held).toBe(true);
    expect(debug.setBallHoldTimer(s, 0.3).ball?.holdTimer).toBe(0.3);
    expect(debug.setBallServeSign(s, -1).ball?.serveSign).toBe(-1);
    expect(debug.setBallServeSign(s, 1).ball?.serveSign).toBe(1);
    const drawn = debug.drawBallServeSign(s);
    expect([1, -1]).toContain(drawn.ball?.serveSign);
    expect({ ...drawn.ball, serveSign: 0 }).toEqual({
      ...s.ball,
      serveSign: 0,
    });
    expect(() => debug.setBallServeSign(s, 0 as never)).toThrow(/1 or -1/);
    expect(() => debug.setBallPosition(s, Number.NaN, 0)).toThrow();

    const empty = debug.clearWorld(s);
    for (const pose of [
      () => debug.setBallPosition(empty, 0, 0),
      () => debug.setBallVelocity(empty, 0, 0),
      () => debug.setBallSpin(empty, 0),
      () => debug.setBallHeld(empty, true),
      () => debug.setBallHoldTimer(empty, 0),
      () => debug.setBallServeSign(empty, 1),
      () => debug.drawBallServeSign(empty),
    ]) {
      expect(pose).toThrow(/no ball/);
    }
  });

  it("gates the AI and sets the mute bit", () => {
    const s = midMatch();
    expect(debug.setAiTracking(s, true).ai).toEqual({
      tracking: true,
      movement: false,
    });
    expect(debug.setAiMovement(s, true).ai).toEqual({
      tracking: false,
      movement: true,
    });
    expect(debug.setMuted(s, false).muted).toBe(false);
    expect(debug.setMuted(debug.setMuted(s, false), true).muted).toBe(true);
  });

  it("reports menu item regions for the current screen", () => {
    const s = midMatch();
    expect(debug.menuItemRect(s, 0)).toBeNull();
    expect(debug.menuItemRect({ ...s, screen: "paused" }, 1)).toEqual(
      menuItemRect("paused", 1),
    );
    expect(debug.menuItemRect({ ...s, screen: "paused" }, 3)).toBeNull();
    expect(debug.menuItemRect({ ...s, screen: "title" }, 2)).toEqual(
      menuItemRect("title", 2),
    );
  });

  it("leaves the state it was handed as it was", () => {
    const s = midMatch();
    const frozen = JSON.stringify(s);
    debug.setBallPosition(s, 9, 9);
    debug.setPaddleCy(s, "left", 9);
    debug.clearWorld(s);
    debug.reset(s);
    debug.snapshot(s);
    expect(JSON.stringify(s)).toBe(frozen);
  });
});
