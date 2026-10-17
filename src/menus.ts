// The menus (specs/ui.md): the items each screen shows, where they sit, and how
// the keyboard, a pointer, and a touch contact drive them.

import type { PointerSample } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { CaromState, MenuPress, MenuRect, Screen } from "./game";
import type { FrameInput } from "./input";
import { returnToTitle, startMatch } from "./world";

/** The how-to screen's single item; its copy is the build's. */
export const HOWTO_ITEM = "BACK TO TITLE";

/** The items each screen's menu shows, in order. */
export const MENU_ITEMS: Readonly<Record<Screen, readonly string[]>> = {
  title: TITLE_ITEMS,
  howto: [HOWTO_ITEM],
  countdown: [],
  playing: [],
  paused: PAUSE_ITEMS,
  matchover: MATCHOVER_ITEMS,
};

export const MENU_ITEM_W = 400;
export const MENU_ITEM_H = 58;
/** The vertical distance between one item's top and the next's. */
export const MENU_ITEM_PITCH = 72;

/** The top of each screen's first item. */
const MENU_TOP: Readonly<Record<Screen, number>> = {
  title: 392,
  howto: 612,
  countdown: 0,
  playing: 0,
  paused: 322,
  matchover: 416,
};

/** The hit region of item `index` on `screen`'s menu, or `null` for no such item. */
export function menuItemRect(screen: Screen, index: number): MenuRect | null {
  if (!Number.isInteger(index) || index < 0) return null;
  if (index >= MENU_ITEMS[screen].length) return null;
  return {
    x: FIELD_CX - MENU_ITEM_W / 2,
    y: MENU_TOP[screen] + index * MENU_ITEM_PITCH,
    w: MENU_ITEM_W,
    h: MENU_ITEM_H,
  };
}

/** The item of `screen`'s menu whose region holds `(x, y)`, or `null`. */
export function hitMenuItem(
  screen: Screen,
  x: number,
  y: number,
): number | null {
  const count = MENU_ITEMS[screen].length;
  for (let index = 0; index < count; index++) {
    const r = menuItemRect(screen, index);
    if (r !== null && x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h) {
      return index;
    }
  }
  return null;
}

/** `index` moved by `delta` over `count` items, wrapping both ways. */
export function wrapIndex(index: number, delta: number, count: number): number {
  if (count === 0) return 0;
  return (((index + delta) % count) + count) % count;
}

/** Confirms item `index` on the current screen's menu. */
export function confirmMenuItem(
  state: DeepReadonly<CaromState>,
  index: number,
): CaromState {
  switch (state.screen) {
    case "title": {
      const remembered = { ...state, titleIndex: index };
      if (TITLE_ITEMS[index] === "SOLO") return startMatch(remembered, "solo");
      if (TITLE_ITEMS[index] === "VERSUS") {
        return startMatch(remembered, "versus");
      }
      return { ...remembered, screen: "howto", menuIndex: 0 };
    }
    case "howto":
      return returnToTitle(state);
    case "paused":
      if (PAUSE_ITEMS[index] === "RESUME") return resume(state);
      if (PAUSE_ITEMS[index] === "RESTART") {
        return startMatch(state, state.mode);
      }
      return returnToTitle(state);
    case "matchover":
      if (MATCHOVER_ITEMS[index] === "PLAY AGAIN") {
        return startMatch(state, state.mode);
      }
      return returnToTitle(state);
    default:
      return { ...state };
  }
}

/** Leaves the pause menu for the screen it was opened from. */
export function resume(state: DeepReadonly<CaromState>): CaromState {
  return { ...state, screen: state.resumeScreen };
}

/** Moves the highlight by the frame's up and down edges, up winning a tie. */
function navigate(
  state: DeepReadonly<CaromState>,
  input: FrameInput,
): CaromState | null {
  const count = MENU_ITEMS[state.screen].length;
  const up = input.pressed["p1-up"] || input.pressed["p2-up"];
  const down = input.pressed["p1-down"] || input.pressed["p2-down"];
  if (up) return { ...state, menuIndex: wrapIndex(state.menuIndex, -1, count) };
  if (down) {
    return { ...state, menuIndex: wrapIndex(state.menuIndex, 1, count) };
  }
  return null;
}

/** Applies the frame's keyboard edges to the menu the screen shows. */
export function applyMenuKeys(
  state: DeepReadonly<CaromState>,
  input: FrameInput,
): CaromState {
  const { pressed } = input;
  switch (state.screen) {
    case "title": {
      const moved = navigate(state, input);
      if (moved !== null) return moved;
      if (pressed.confirm) return confirmMenuItem(state, state.menuIndex);
      return { ...state };
    }
    case "howto":
      if (pressed.confirm || pressed.back) return returnToTitle(state);
      return { ...state };
    case "paused": {
      if (pressed.pause || pressed.back) return resume(state);
      const moved = navigate(state, input);
      if (moved !== null) return moved;
      if (pressed.confirm) return confirmMenuItem(state, state.menuIndex);
      return { ...state };
    }
    case "matchover": {
      if (pressed.back) return returnToTitle(state);
      const moved = navigate(state, input);
      if (moved !== null) return moved;
      if (pressed.confirm) return confirmMenuItem(state, state.menuIndex);
      return { ...state };
    }
    default:
      return { ...state };
  }
}

/** Whether a pointer sample's button is the one that confirms a menu item. */
function isPrimaryEdge(sample: PointerSample): boolean {
  return sample.button === "primary";
}

/**
 * Applies the frame's pointer and touch samples, in arrival order, to the menu
 * the screen shows. A sample that moves onto an item selects it; a contact that
 * lands and lifts inside one item confirms it. Samples after a confirm that
 * changed the screen are left for that screen's next frame.
 */
export function applyMenuPointer(
  state: DeepReadonly<CaromState>,
  input: FrameInput,
): CaromState {
  const screen = state.screen;
  let next: CaromState = { ...state };
  let presses: MenuPress[] = [...state.menuPresses];

  for (const sample of input.samples) {
    if (next.screen !== screen) break;
    const item = hitMenuItem(screen, sample.x, sample.y);
    if (sample.type === "move") {
      if (item !== null && item !== next.menuIndex) {
        next = { ...next, menuIndex: item };
      }
    } else if (sample.type === "down") {
      if (!isPrimaryEdge(sample)) continue;
      presses = presses.filter((p) => p.id !== sample.id);
      presses.push({ id: sample.id, screen, item });
      if (item !== null && item !== next.menuIndex) {
        next = { ...next, menuIndex: item };
      }
    } else {
      const press = presses.find((p) => p.id === sample.id);
      presses = presses.filter((p) => p.id !== sample.id);
      if (!isPrimaryEdge(sample) || press === undefined) continue;
      if (
        press.screen === screen &&
        press.item !== null &&
        item === press.item
      ) {
        next = confirmMenuItem({ ...next, menuIndex: item }, item);
      }
    }
  }
  return { ...next, menuPresses: presses };
}

/** Drops every press whose contact has left the surface. */
export function pruneMenuPresses(
  state: CaromState,
  input: FrameInput,
): CaromState {
  if (state.menuPresses.length === 0) return state;
  const live = state.menuPresses.filter((p) =>
    input.contacts.some((c) => c.id === p.id),
  );
  return live.length === state.menuPresses.length
    ? state
    : { ...state, menuPresses: live };
}
