// The four cues specs/audio.md names, synthesized by the engine from these
// specs. Each is a distinct short blip so the events are told apart by ear.

import type { CueSpec } from "@clockwyrks/simple-2d";
import { CUES, type CueName } from "./constants";

export const CUE_SPECS: Readonly<Record<CueName, CueSpec>> = {
  [CUES.paddleHit]: {
    wave: "square",
    freq: 520,
    freqTo: 360,
    gain: 0.16,
    durationMs: 70,
  },
  [CUES.wallBounce]: {
    wave: "sine",
    freq: 330,
    freqTo: 240,
    gain: 0.18,
    durationMs: 55,
  },
  [CUES.obstacleBounce]: {
    wave: "triangle",
    freq: 820,
    freqTo: 600,
    gain: 0.2,
    durationMs: 80,
  },
  [CUES.score]: {
    wave: "square",
    freq: 440,
    freqTo: 880,
    gain: 0.14,
    durationMs: 240,
  },
};
