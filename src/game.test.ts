import { afterEach, describe, expect, it } from "vitest";
import { TOUCH_LAYOUTS } from "@clockwyrks/simple-2d";
import {
  ACTIONS,
  BALL_R,
  CUES,
  FIELD_CY,
  FIELD_W,
  HOLD_TIME,
  LAYOUT,
  PADDLE_MAX_CY,
  PADDLE_SPEED,
} from "./constants";
import { DIAGNOSTIC_SOURCES } from "./diagnostics";
import { menuItemRect } from "./menus";
import { createHarness, type Harness } from "./testing/harness";

const harnesses: Harness[] = [];

async function stand(stepMs?: number): Promise<Harness> {
  const h = await createHarness(stepMs);
  harnesses.push(h);
  return h;
}

afterEach(() => {
  for (const h of harnesses.splice(0)) h.destroy();
});

describe("initialize", () => {
  it("opens on the title screen and registers the layout's vocabulary", async () => {
    const h = await stand();
    const snap = h.snapshot();
    expect(snap.screen).toBe("title");
    expect(snap.muted).toBe(false);
    expect(snap.simTime).toBe(0);
    expect([...ACTIONS]).toEqual(TOUCH_LAYOUTS[LAYOUT]?.actions);
    expect(h.engine.debug.version).toBe(1);
  });

  it("registers the diagnostic sources as pure reads", async () => {
    const h = await stand();
    const readings = h.engine.diagnostics();
    expect(readings.map((r) => r.name)).toEqual(
      DIAGNOSTIC_SOURCES.map(([name]) => name),
    );
    for (const reading of readings) expect(reading.error).toBeUndefined();
    const byName = Object.fromEntries(readings.map((r) => [r.name, r.value]));
    expect(byName.screen).toBe("title");
    expect(byName.score).toBe("0 - 0");
    expect(byName.ball).toBe("640.0, 360.0");
    h.pose((d, s) => d.clearWorld(s));
    const cleared = Object.fromEntries(
      h.engine.diagnostics().map((r) => [r.name, r.value]),
    );
    expect(cleared.ball).toBe("-");
    expect(cleared["ball speed"]).toBe("-");
    expect(h.snapshot().ball).toBeNull();
  });
});

describe("a match through the engine", () => {
  it("starts from the keyboard, serves, and plays cues", async () => {
    const h = await stand();
    h.tap("Enter");
    await h.advance(1);
    expect(h.snapshot()).toMatchObject({
      screen: "countdown",
      mode: "solo",
      titleIndex: 0,
    });
    await h.advanceSeconds(HOLD_TIME);
    expect(h.snapshot().screen).toBe("playing");
    // Put the ball on a short straight run into the stationary left paddle.
    h.pose((d, s) => d.setBallPosition(s, 200, FIELD_CY));
    h.pose((d, s) => d.setBallVelocity(s, -600, 0));
    await h.advanceSeconds(0.5);
    expect(h.cues).toContain(CUES.paddleHit);
    expect(h.snapshot().ball?.vx).toBeGreaterThan(0);
  });

  it("moves the paddles from held keys and the AI from its rule", async () => {
    const h = await stand();
    h.tap("Enter");
    await h.advance(1);
    h.keyDown("KeyS");
    await h.advance(10);
    const snap = h.snapshot();
    expect(snap.paddles.left.cy).toBeCloseTo(
      FIELD_CY + PADDLE_SPEED * h.dt * 10,
      6,
    );
    expect(snap.paddles.left.vy).toBe(PADDLE_SPEED);
    h.keyUp("KeyS");
    await h.advance(1);
    expect(h.snapshot().paddles.left.vy).toBe(0);
    // The AI homes during the countdown.
    expect(h.snapshot().paddles.right.cy).toBe(FIELD_CY);
  });

  it("pauses with Escape once and resumes with Escape once", async () => {
    const h = await stand();
    h.tap("Enter");
    await h.advance(2);
    h.tap("Escape");
    await h.advance(1);
    expect(h.snapshot()).toMatchObject({
      screen: "paused",
      resumeScreen: "countdown",
    });
    await h.advance(3);
    expect(h.snapshot().screen).toBe("paused");
    h.tap("Escape");
    await h.advance(1);
    expect(h.snapshot().screen).toBe("countdown");
  });

  it("toggles the runtime's mute bit from the M key and from the surface", async () => {
    const h = await stand();
    h.tap("KeyM");
    await h.advance(1);
    expect(h.snapshot().muted).toBe(true);
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setBallPosition(s, 300, BALL_R + 1));
    h.pose((d, s) => d.setBallVelocity(s, 0, -400));
    const gains: number[] = [];
    h.engine.events.on("cue:played", (e) => gains.push(e.gain));
    await h.advance(1);
    expect(gains).toEqual([0]);
    h.pose((d, s) => d.setMuted(s, false));
    expect(h.snapshot().muted).toBe(false);
    h.pose((d, s) => d.setBallVelocity(s, 0, -400));
    h.pose((d, s) => d.setBallPosition(s, 300, BALL_R + 1));
    await h.advance(1);
    expect(gains[1]).toBeGreaterThan(0);
    h.tap("KeyM");
    await h.advance(1);
    expect(h.snapshot().muted).toBe(true);
  });

  it("drives a paddle from the surface, carrying drivenVy into vy", async () => {
    const h = await stand();
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setPaddleVy(s, "right", 300));
    expect(h.snapshot().paddles.right).toMatchObject({
      vy: 0,
      drivenVy: 300,
      driven: false,
    });
    await h.advance(1);
    expect(h.snapshot().paddles.right.cy).toBe(FIELD_CY);
    h.pose((d, s) => d.setPaddleDriven(s, "right", true));
    await h.advance(1);
    expect(h.snapshot().paddles.right).toMatchObject({
      vy: 300,
      drivenVy: 300,
      driven: true,
    });
    expect(h.snapshot().paddles.right.cy).toBeCloseTo(FIELD_CY + 300 * h.dt, 6);
    h.pose((d, s) => d.setPaddleCy(s, "right", PADDLE_MAX_CY));
    await h.advance(1);
    expect(h.snapshot().paddles.right).toMatchObject({
      cy: PADDLE_MAX_CY,
      vy: 0,
    });
  });

  it("scores a driven point and ends the match on the win rule", async () => {
    const h = await stand();
    h.pose((d, s) => d.setScreen(s, "playing"));
    h.pose((d, s) => d.setScore(s, 10, 3));
    h.pose((d, s) => d.setPaddleCy(s, "right", 100));
    h.pose((d, s) => d.setBallPosition(s, FIELD_W - 60, FIELD_CY));
    h.pose((d, s) => d.setBallVelocity(s, 900, 0));
    await h.advanceSeconds(0.2);
    expect(h.snapshot()).toMatchObject({
      screen: "matchover",
      winner: "left",
      score: { p1: 11, p2: 3 },
    });
    expect(h.cues).toContain(CUES.score);
    h.tap("Enter");
    await h.advance(1);
    expect(h.snapshot()).toMatchObject({
      screen: "countdown",
      score: { p1: 0, p2: 0 },
      winner: null,
    });
  });

  it("drives the menus from the pointer through the engine's fit", async () => {
    const h = await stand();
    const rect = menuItemRect("title", 2);
    if (rect === null) throw new Error("no rect");
    h.pointerMove(rect.x + 10, rect.y + 10);
    await h.advance(1);
    expect(h.snapshot().menuIndex).toBe(2);
    h.click(rect.x + 10, rect.y + 10);
    await h.advance(1);
    expect(h.snapshot()).toMatchObject({ screen: "howto", titleIndex: 2 });
    const back = h.debug.menuItemRect(h.engine.state, 0);
    if (back === null) throw new Error("no back item");
    h.pointerDown(back.x + 5, back.y + 5, { device: "touch", id: 9 });
    await h.advance(2);
    expect(h.snapshot().screen).toBe("howto");
    h.pointerUp(back.x + 5, back.y + 5, { device: "touch", id: 9 });
    await h.advance(1);
    expect(h.snapshot()).toMatchObject({ screen: "title", menuIndex: 2 });
  });

  it("resets from any screen and keeps the surface inert otherwise", async () => {
    const h = await stand();
    h.tap("Enter");
    await h.advance(30);
    h.pose((d, s) => d.reset(s));
    expect(h.snapshot()).toMatchObject({
      screen: "title",
      simTime: 0,
      score: { p1: 0, p2: 0 },
    });
    const before = h.snapshot();
    h.pose((d, s) => d.reconcile(s));
    expect(h.snapshot()).toEqual(before);
  });
});
