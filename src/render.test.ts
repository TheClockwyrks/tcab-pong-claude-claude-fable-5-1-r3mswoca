import { describe, expect, it } from "vitest";
import { createCanvas } from "@napi-rs/canvas";
import { FIELD_H, FIELD_W } from "./constants";
import type { CaromState, Screen } from "./game";
import { modeLabel, render, roundedRect, winnerLabel } from "./render";
import { parkedBall, startMatch, titleState } from "./world";

function context(): { ctx: CanvasRenderingContext2D; calls: string[] } {
  const raw = createCanvas(FIELD_W, FIELD_H).getContext("2d");
  const calls: string[] = [];
  const ctx = new Proxy(raw, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value === "function") {
        return (...args: unknown[]) => {
          calls.push(String(prop));
          return Reflect.apply(value, target, args);
        };
      }
      return value;
    },
    set(target, prop, value) {
      return Reflect.set(target, prop, value);
    },
  }) as unknown as CanvasRenderingContext2D;
  return { ctx, calls };
}

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "countdown",
  "playing",
  "paused",
  "matchover",
];

describe("render", () => {
  it("draws every screen, with and without a ball, obstacles, and a winner", () => {
    const match = startMatch(titleState(true), "solo");
    const flying: CaromState = {
      ...match,
      ball: {
        ...parkedBall(),
        held: false,
        x: 500,
        y: 300,
        vx: 400,
        vy: 100,
        trail: [
          { x: 480, y: 290, t: 0.9 },
          { x: 490, y: 295, t: 0.95 },
          { x: 500, y: 300, t: 1 },
        ],
      },
      simTime: 1,
    };
    for (const screen of SCREENS) {
      const { ctx, calls } = context();
      render(
        { ...flying, screen, winner: screen === "matchover" ? "right" : null },
        ctx,
      );
      expect(calls).toContain("fillText");
      expect(calls).toContain("arc");
    }
    const { ctx } = context();
    render({ ...flying, screen: "playing", ball: null, obstacles: [] }, ctx);
    render({ ...flying, screen: "countdown", ball: null }, ctx);
    render(
      { ...flying, screen: "matchover", winner: "left", mode: "versus" },
      ctx,
    );
    render(
      { ...flying, screen: "matchover", winner: "left", muted: false },
      ctx,
    );
  });

  it("draws the trail as one segment per pair of samples", () => {
    const match = startMatch(titleState(false), "versus");
    const { ctx, calls } = context();
    render({ ...match, screen: "playing" }, ctx);
    const strokesWithout = calls.filter((c) => c === "stroke").length;
    const samples = Array.from({ length: 6 }, (_, i) => ({
      x: 600 + i * 5,
      y: 360,
      t: i / 60,
    }));
    const trailed = context();
    render(
      {
        ...match,
        screen: "playing",
        simTime: 0.1,
        ball: { ...match.ball!, trail: samples },
      },
      trailed.ctx,
    );
    const strokesWith = trailed.calls.filter((c) => c === "stroke").length;
    expect(strokesWith - strokesWithout).toBe(samples.length - 1);
  });

  it("builds a rounded rectangle path", () => {
    const { ctx, calls } = context();
    roundedRect(ctx, 0, 0, 100, 50, 60);
    expect(calls.filter((c) => c === "arcTo")).toHaveLength(4);
    expect(calls[0]).toBe("beginPath");
  });

  it("names the mode and the winner", () => {
    const s = titleState(false);
    expect(modeLabel(s)).toContain("SOLO");
    expect(modeLabel({ ...s, mode: "versus" })).toContain("VERSUS");
    expect(winnerLabel(s)).toBe("MATCH OVER");
    expect(winnerLabel({ ...s, winner: "left" })).toBe("YOU WIN");
    expect(winnerLabel({ ...s, winner: "right" })).toBe("THE MACHINE WINS");
    expect(winnerLabel({ ...s, winner: "left", mode: "versus" })).toBe(
      "PLAYER ONE WINS",
    );
    expect(winnerLabel({ ...s, winner: "right", mode: "versus" })).toBe(
      "PLAYER TWO WINS",
    );
  });
});
