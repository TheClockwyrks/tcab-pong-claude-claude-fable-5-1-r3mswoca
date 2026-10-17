// One frame's input, read once from the engine at the top of `update` and
// handed to the pure simulation: the four movement actions as held values,
// every action as a press edge, and the pointer's samples and contacts.

import type {
  PointerContact,
  PointerSample,
  UpdateApi,
} from "@clockwyrks/simple-2d";
import { ACTIONS, type ActionName } from "./constants";

export interface FrameInput {
  /** Each action's held value, `0` or `1`. */
  readonly held: Readonly<Record<ActionName, number>>;
  /** Whether each action was pressed since the last frame. */
  readonly pressed: Readonly<Record<ActionName, boolean>>;
  /** Every pointer sample delivered since the last frame, in arrival order. */
  readonly samples: readonly PointerSample[];
  /** Every pointer in contact with the surface. */
  readonly contacts: readonly PointerContact[];
}

function record<T>(value: (name: ActionName) => T): Record<ActionName, T> {
  const out = {} as Record<ActionName, T>;
  for (const name of ACTIONS) out[name] = value(name);
  return out;
}

/** A frame with nothing held, nothing pressed, and no pointer activity. */
export const NO_INPUT: FrameInput = {
  held: record(() => 0),
  pressed: record(() => false),
  samples: [],
  contacts: [],
};

/** Reads the frame's input from the engine. Every edge is consumed here. */
export function readInput(input: UpdateApi["input"]): FrameInput {
  return {
    held: record((name) => input.value(name)),
    pressed: record((name) => input.pressed(name)),
    samples: input.pointerSamples(),
    contacts: input.pointerContacts(),
  };
}

/** `NO_INPUT` with some actions held or pressed; a convenience for tests and scripts. */
export function inputWith(
  overrides: {
    held?: Partial<Record<ActionName, number>>;
    pressed?: Partial<Record<ActionName, boolean>>;
    samples?: readonly PointerSample[];
    contacts?: readonly PointerContact[];
  } = {},
): FrameInput {
  return {
    held: { ...NO_INPUT.held, ...overrides.held },
    pressed: { ...NO_INPUT.pressed, ...overrides.pressed },
    samples: overrides.samples ?? [],
    contacts: overrides.contacts ?? [],
  };
}
