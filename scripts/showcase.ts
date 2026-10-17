// Captures the showcase media (specs/showcase.md) from the running game in a
// headless Chromium: the screenshots and the replay the carousel names.
//
//   node scripts/showcase.ts
//
// It serves `scripts/capture.html` through the Vite dev server, drives the
// game through the debug surface the page exposes, and writes into
// `showcase/`. Chromium runs with `--no-sandbox` because this container has no
// sandbox to give it.

import { gzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright";
import type { Page } from "playwright";
import { createServer } from "vite";
import type { CaptureHandle } from "./capture";

declare global {
  interface Window {
    carom: CaptureHandle;
  }
}

const OUT = new URL("../showcase/", import.meta.url);
const REPLAY_FRAMES = 60 * 9;

async function screenshot(page: Page, name: string): Promise<void> {
  const path = new URL(name, OUT);
  await page.screenshot({ path: path.pathname, type: "png" });
  console.log(`wrote ${path.pathname}`);
}

async function main(): Promise<void> {
  mkdirSync(OUT, { recursive: true });
  const server = await createServer({
    server: { port: 0, host: "127.0.0.1" },
    logLevel: "error",
  });
  await server.listen();
  const base = server.resolvedUrls?.local[0];
  if (base === undefined) throw new Error("vite gave no local url");
  const url = `${base}scripts/capture.html`;

  const browser = await chromium.launch({ args: ["--no-sandbox"] });
  try {
    // Screenshots at 2x for a crisp store page.
    const shots = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 2,
    });
    const page = await shots.newPage();
    page.on("pageerror", (error) => console.error("page error:", error));
    await page.goto(url);
    await page.waitForFunction(() => window.carom !== undefined);

    // The title screen.
    await page.evaluate(async () => {
      const { engine } = window.carom;
      engine.apply((s) => engine.debug.reset(s));
      await engine.advance(1);
    });
    await screenshot(page, "title.png");

    // A rally, caught mid-field at speed with a full trail.
    await page.evaluate(async () => {
      const { engine, openSoloMatch, stepScriptedFrame } = window.carom;
      openSoloMatch();
      for (let i = 0; i < 60 * 20; i++) {
        await stepScriptedFrame();
        const snap = engine.debug.snapshot(engine.state);
        const ball = snap.ball;
        if (
          snap.screen === "playing" &&
          ball !== null &&
          ball.speed > 640 &&
          Math.abs(ball.spin) > 150 &&
          ball.x > 420 &&
          ball.x < 860
        ) {
          break;
        }
      }
    });
    await screenshot(page, "rally.png");

    // Match point, won.
    await page.evaluate(async () => {
      const { engine } = window.carom;
      const d = engine.debug;
      engine.apply((s) => d.setScore(s, 10, 8));
      engine.apply((s) => d.setPaddleCy(s, "right", 120));
      engine.apply((s) => d.setBallPosition(s, 1100, 520));
      engine.apply((s) => d.setBallVelocity(s, 900, -60));
      engine.apply((s) => d.setBallSpin(s, -300));
      for (let i = 0; i < 120; i++) {
        await engine.advance(1);
        if (engine.debug.snapshot(engine.state).screen === "matchover") break;
      }
      await engine.advance(1);
    });
    await screenshot(page, "matchover.png");
    await shots.close();

    // The replay, at 1x: the serve and the rally that follows it.
    const replay = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });
    const replayPage = await replay.newPage();
    replayPage.on("pageerror", (error) => console.error("page error:", error));
    await replayPage.goto(url);
    await replayPage.waitForFunction(() => window.carom !== undefined);
    const json = await replayPage.evaluate(async (frames: number) => {
      const { engine, openSoloMatch, stepScriptedFrame } = window.carom;
      openSoloMatch();
      await engine.advance(1);
      engine.startRecording();
      for (let i = 0; i < frames; i++) await stepScriptedFrame();
      const recording = engine.stopRecording();
      const snap = engine.debug.snapshot(engine.state);
      return JSON.stringify({
        recording,
        score: snap.score,
        screen: snap.screen,
      });
    }, REPLAY_FRAMES);
    const { recording, score, screen } = JSON.parse(json) as {
      recording: unknown;
      score: { p1: number; p2: number };
      screen: string;
    };
    const path = new URL("rally.json.gz", OUT);
    writeFileSync(path.pathname, gzipSync(JSON.stringify(recording)));
    console.log(
      `wrote ${path.pathname} (${REPLAY_FRAMES} frames, ended ${score.p1}-${score.p2} on ${screen})`,
    );
    await replay.close();
  } finally {
    await browser.close();
    await server.close();
  }
}

await main();
