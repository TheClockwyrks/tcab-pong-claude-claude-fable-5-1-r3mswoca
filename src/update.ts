// One update of the game, as a pure function: the current state and the
// frame's input in, the next state and the cues the frame raised out.

import type { DeepReadonly } from "ts-essentials";
import type { CueName } from "./constants";
import { advanceField } from "./field";
import type { CaromState, Screen } from "./game";
import { NO_INPUT, type FrameInput } from "./input";
import { applyMenuKeys, applyMenuPointer, pruneMenuPresses } from "./menus";

export interface Advanced {
  readonly state: CaromState;
  readonly cues: readonly CueName[];
}

/** Whether `screen` is one the field advances on. */
export function isLive(screen: Screen): screen is "countdown" | "playing" {
  return screen === "countdown" || screen === "playing";
}

/**
 * Advances the game by `dt` seconds. The input is read for the screen the
 * update began on, then the screen the input left the game on advances; a
 * screen reached this update takes its first input on the next one
 * (specs/ui.md).
 */
export function advance(
  state: DeepReadonly<CaromState>,
  input: FrameInput,
  dt: number,
): Advanced {
  const screen = state.screen;
  const opened: CaromState = {
    ...state,
    simTime: state.simTime + dt,
    muted: input.pressed.mute ? !state.muted : state.muted,
  };

  let next = opened;
  let fieldInput = input;
  if (isLive(screen)) {
    if (input.pressed.pause) {
      next = {
        ...opened,
        resumeScreen: screen,
        screen: "paused",
        menuIndex: 0,
      };
    }
  } else {
    next = applyMenuKeys(opened, input);
    if (next.screen === screen) next = applyMenuPointer(next, input);
    fieldInput = NO_INPUT;
  }

  let cues: readonly CueName[] = [];
  if (isLive(next.screen)) {
    const frame = advanceField(next, fieldInput, dt);
    next = frame.state;
    cues = frame.cues;
  }
  return { state: pruneMenuPresses(next, input), cues };
}
