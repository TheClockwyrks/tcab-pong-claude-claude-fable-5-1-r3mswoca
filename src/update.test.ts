import { describe, expect, it } from "vitest";
import { FIELD_CY, HOLD_TIME } from "./constants";
import type { CaromState } from "./game";
import { inputWith, NO_INPUT } from "./input";
import { menuItemRect } from "./menus";
import { advance, isLive } from "./update";
import { parkedBall, startMatch, titleState } from "./world";

const DT = 1 / 60;

describe("advance", () => {
  it("accumulates simTime on every screen", () => {
    let s = titleState(false);
    for (const screen of [
      "title",
      "howto",
      "paused",
      "matchover",
      "countdown",
      "playing",
    ] as const) {
      const before = s.simTime;
      s = advance({ ...s, screen }, NO_INPUT, 0.25).state;
      expect(s.simTime).toBeCloseTo(before + 0.25, 9);
    }
  });

  it("toggles muted from the mute action on any screen", () => {
    let s = titleState(false);
    s = advance(s, inputWith({ pressed: { mute: true } }), DT).state;
    expect(s.muted).toBe(true);
    s = advance(
      { ...s, screen: "playing" },
      inputWith({ pressed: { mute: true } }),
      DT,
    ).state;
    expect(s.muted).toBe(false);
  });

  it("advances nothing on the menu screens", () => {
    const match = startMatch(titleState(false), "versus");
    for (const screen of ["title", "howto", "paused", "matchover"] as const) {
      const s: CaromState = {
        ...match,
        screen,
        ball: { ...parkedBall(), holdTimer: 0.5 },
      };
      const next = advance(s, inputWith({ held: { "p1-down": 1 } }), DT).state;
      expect(next.paddles.left.cy).toBe(FIELD_CY);
      expect(next.ball?.holdTimer).toBe(0.5);
      expect(next.ball?.trail).toEqual([]);
    }
  });

  it("pauses from countdown and playing, remembering where to resume", () => {
    const match = startMatch(titleState(false), "versus");
    const fromCountdown = advance(
      match,
      inputWith({ pressed: { pause: true, back: true } }),
      DT,
    ).state;
    expect(fromCountdown).toMatchObject({
      screen: "paused",
      resumeScreen: "countdown",
      menuIndex: 0,
    });
    expect(fromCountdown.ball?.holdTimer).toBe(HOLD_TIME);
    const fromPlaying = advance(
      { ...match, screen: "playing", menuIndex: 2 },
      inputWith({ pressed: { pause: true } }),
      DT,
    ).state;
    expect(fromPlaying).toMatchObject({
      screen: "paused",
      resumeScreen: "playing",
      menuIndex: 0,
    });
  });

  it("runs the field on live screens and serves after the hold", () => {
    let s = startMatch(titleState(false), "versus");
    for (let i = 0; i < 70; i++) s = advance(s, NO_INPUT, DT).state;
    expect(s.screen).toBe("playing");
    expect(s.ball?.held).toBe(false);
    expect(s.ball?.x).not.toBe(640);
  });

  it("advances the screen a menu confirm reached, without that frame's input", () => {
    const s = titleState(false);
    const next = advance(
      s,
      inputWith({ pressed: { confirm: true }, held: { "p1-down": 1 } }),
      DT,
    ).state;
    expect(next.screen).toBe("countdown");
    expect(next.ball?.holdTimer).toBeCloseTo(HOLD_TIME - DT, 9);
    expect(next.paddles.left.cy).toBe(FIELD_CY);
  });

  it("applies the pointer after the keyboard on the same frame", () => {
    const r = menuItemRect("title", 2);
    if (r === null) throw new Error("no rect");
    const s = advance(
      titleState(false),
      inputWith({
        pressed: { "p1-down": true },
        samples: [
          {
            type: "move",
            x: r.x + 1,
            y: r.y + 1,
            id: 1,
            primary: true,
            device: "mouse",
            button: null,
            buttons: [],
          },
        ],
      }),
      DT,
    ).state;
    expect(s.menuIndex).toBe(2);
  });

  it("confirms the keyboard's item alone when a pointer confirm arrives with it", () => {
    const r = menuItemRect("title", 2);
    if (r === null) throw new Error("no rect");
    const x = r.x + 1;
    const y = r.y + 1;
    const s = advance(
      { ...titleState(false), menuIndex: 1 },
      inputWith({
        pressed: { confirm: true },
        samples: [
          {
            type: "down",
            x,
            y,
            id: 1,
            primary: true,
            device: "mouse",
            button: "primary",
            buttons: ["primary"],
          },
          {
            type: "up",
            x,
            y,
            id: 1,
            primary: true,
            device: "mouse",
            button: "primary",
            buttons: [],
          },
        ],
      }),
      DT,
    ).state;
    expect(s).toMatchObject({ screen: "countdown", mode: "versus" });
  });

  it("names the live screens", () => {
    expect(isLive("countdown")).toBe(true);
    expect(isLive("playing")).toBe(true);
    expect(isLive("paused")).toBe(false);
  });
});

describe("delta-time independence", () => {
  interface Drive {
    hits: number;
    walls: number;
    points: number;
    time: number;
    atHit: { speed: number; vx: number; vy: number } | null;
  }

  function drive(dt: number): Drive {
    let s: CaromState = {
      ...startMatch(titleState(false), "solo"),
      screen: "playing",
      ai: { tracking: true, movement: false },
      ball: {
        ...parkedBall(),
        held: false,
        holdTimer: 0,
        x: 640,
        y: 360,
        vx: 500,
        vy: -100,
        spin: 200,
      },
    };
    const out: Drive = { hits: 0, walls: 0, points: 0, time: 0, atHit: null };
    for (let i = 0; i < 20000 && out.points === 0; i++) {
      const { state, cues } = advance(s, NO_INPUT, dt);
      s = state;
      for (const cue of cues) {
        if (cue === "paddle-hit") {
          out.hits++;
          const ball = s.ball;
          if (out.atHit === null && ball !== null) {
            out.atHit = {
              speed: Math.hypot(ball.vx, ball.vy),
              vx: ball.vx,
              vy: ball.vy,
            };
          }
        }
        if (cue === "wall-bounce") out.walls++;
        if (cue === "score") out.points++;
      }
    }
    out.time = s.simTime;
    return out;
  }

  it("plays the same scenario out under 2 ms and 16 ms frames", () => {
    const fine = drive(0.002);
    const coarse = drive(0.016);
    expect(fine.points).toBe(1);
    expect(coarse.points).toBe(1);
    expect(fine.hits).toBeGreaterThan(0);
    expect(coarse.hits).toBe(fine.hits);
    expect(coarse.walls).toBe(fine.walls);
    if (fine.atHit === null || coarse.atHit === null) {
      throw new Error("no paddle hit");
    }
    expect(Math.abs(fine.atHit.speed - coarse.atHit.speed)).toBeLessThan(10);
    expect(Math.sign(fine.atHit.vx)).toBe(Math.sign(coarse.atHit.vx));
    const level = (vy: number): number =>
      Math.abs(vy) < 120 ? 0 : Math.sign(vy);
    expect(level(fine.atHit.vy)).toBe(level(coarse.atHit.vy));
    expect(Math.abs(fine.time - coarse.time) / fine.time).toBeLessThan(0.08);
  });
});
