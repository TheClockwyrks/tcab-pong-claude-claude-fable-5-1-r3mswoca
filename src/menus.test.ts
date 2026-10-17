import { describe, expect, it } from "vitest";
import type { PointerSample } from "@clockwyrks/simple-2d";
import {
  FIELD_CX,
  MATCHOVER_ITEMS,
  PAUSE_ITEMS,
  TITLE_ITEMS,
} from "./constants";
import type { CaromState, Screen } from "./game";
import { inputWith, NO_INPUT } from "./input";
import {
  applyMenuKeys,
  applyMenuPointer,
  confirmMenuItem,
  hitMenuItem,
  MENU_ITEMS,
  menuItemRect,
  pruneMenuPresses,
  wrapIndex,
} from "./menus";
import { startMatch, titleState } from "./world";

function on(screen: Screen, extra: Partial<CaromState> = {}): CaromState {
  const base =
    screen === "title" || screen === "howto"
      ? titleState(false)
      : startMatch(titleState(false), "versus");
  return { ...base, screen, ...extra };
}

function sample(
  type: PointerSample["type"],
  x: number,
  y: number,
  extra: Partial<PointerSample> = {},
): PointerSample {
  return {
    type,
    x,
    y,
    id: 1,
    primary: true,
    device: "mouse",
    button: type === "move" ? null : "primary",
    buttons: type === "up" ? [] : ["primary"],
    ...extra,
  };
}

function center(screen: Screen, index: number): { x: number; y: number } {
  const r = menuItemRect(screen, index);
  if (r === null) throw new Error(`no item ${index} on ${screen}`);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
}

describe("layout", () => {
  it("lists each screen's items in the spec's order", () => {
    expect(MENU_ITEMS.title).toEqual(TITLE_ITEMS);
    expect(MENU_ITEMS.paused).toEqual(PAUSE_ITEMS);
    expect(MENU_ITEMS.matchover).toEqual(MATCHOVER_ITEMS);
    expect(MENU_ITEMS.howto).toHaveLength(1);
    expect(MENU_ITEMS.countdown).toEqual([]);
    expect(MENU_ITEMS.playing).toEqual([]);
  });

  it("lays out non-overlapping regions centered on the field", () => {
    for (const screen of ["title", "howto", "paused", "matchover"] as const) {
      const rects = MENU_ITEMS[screen].map((_, i) => menuItemRect(screen, i));
      rects.forEach((r, i) => {
        if (r === null) throw new Error("missing rect");
        expect(r.x + r.w / 2).toBe(FIELD_CX);
        expect(r.w).toBeGreaterThan(0);
        expect(r.h).toBeGreaterThan(0);
        const next = rects[i + 1];
        if (next) expect(next.y).toBeGreaterThanOrEqual(r.y + r.h);
      });
    }
  });

  it("returns null for screens with no menu and for indices past the items", () => {
    expect(menuItemRect("countdown", 0)).toBeNull();
    expect(menuItemRect("playing", 0)).toBeNull();
    expect(menuItemRect("title", 3)).toBeNull();
    expect(menuItemRect("title", -1)).toBeNull();
    expect(menuItemRect("title", 1.5)).toBeNull();
    expect(menuItemRect("howto", 1)).toBeNull();
  });

  it("hit-tests a point against the items", () => {
    const { x, y } = center("title", 1);
    expect(hitMenuItem("title", x, y)).toBe(1);
    expect(hitMenuItem("title", 10, 10)).toBeNull();
    const r = menuItemRect("title", 0);
    if (r === null) throw new Error("no rect");
    expect(hitMenuItem("title", r.x, r.y)).toBe(0);
    expect(hitMenuItem("title", r.x + r.w, r.y)).toBeNull();
  });

  it("wraps an index both ways", () => {
    expect(wrapIndex(0, -1, 3)).toBe(2);
    expect(wrapIndex(2, 1, 3)).toBe(0);
    expect(wrapIndex(1, 1, 3)).toBe(2);
    expect(wrapIndex(0, 1, 0)).toBe(0);
  });
});

describe("keyboard", () => {
  it("moves the title highlight, wrapping, and up wins over down", () => {
    let s = on("title");
    s = applyMenuKeys(s, inputWith({ pressed: { "p1-up": true } }));
    expect(s.menuIndex).toBe(2);
    s = applyMenuKeys(s, inputWith({ pressed: { "p2-down": true } }));
    expect(s.menuIndex).toBe(0);
    s = applyMenuKeys(
      s,
      inputWith({ pressed: { "p1-up": true, "p1-down": true } }),
    );
    expect(s.menuIndex).toBe(2);
    s = applyMenuKeys(
      s,
      inputWith({ pressed: { "p2-up": true, confirm: true } }),
    );
    expect(s.menuIndex).toBe(1);
    expect(s.screen).toBe("title");
  });

  it("confirms SOLO, VERSUS, and HOW TO PLAY and remembers the selection", () => {
    const solo = applyMenuKeys(
      on("title"),
      inputWith({ pressed: { confirm: true } }),
    );
    expect(solo).toMatchObject({
      screen: "countdown",
      mode: "solo",
      titleIndex: 0,
    });
    const versus = applyMenuKeys(
      on("title", { menuIndex: 1 }),
      inputWith({ pressed: { confirm: true } }),
    );
    expect(versus).toMatchObject({
      screen: "countdown",
      mode: "versus",
      titleIndex: 1,
    });
    const howto = applyMenuKeys(
      on("title", { menuIndex: 2 }),
      inputWith({ pressed: { confirm: true } }),
    );
    expect(howto).toMatchObject({
      screen: "howto",
      menuIndex: 0,
      titleIndex: 2,
    });
  });

  it("ignores back on the title", () => {
    const s = applyMenuKeys(
      on("title", { menuIndex: 1 }),
      inputWith({ pressed: { back: true } }),
    );
    expect(s).toMatchObject({ screen: "title", menuIndex: 1 });
  });

  it("leaves the how-to screen on confirm or back, restoring the title selection", () => {
    const s = on("howto", { titleIndex: 2, menuIndex: 0 });
    expect(
      applyMenuKeys(s, inputWith({ pressed: { confirm: true } })),
    ).toMatchObject({ screen: "title", menuIndex: 2 });
    expect(
      applyMenuKeys(s, inputWith({ pressed: { back: true } })),
    ).toMatchObject({ screen: "title", menuIndex: 2 });
    expect(
      applyMenuKeys(s, inputWith({ pressed: { "p1-down": true } })).screen,
    ).toBe("howto");
  });

  it("resumes from the pause menu on pause or back before anything else", () => {
    const s = on("paused", { resumeScreen: "countdown", menuIndex: 2 });
    const a = applyMenuKeys(
      s,
      inputWith({
        pressed: { pause: true, back: true, confirm: true, "p1-up": true },
      }),
    );
    expect(a).toMatchObject({ screen: "countdown", menuIndex: 2 });
    const b = applyMenuKeys(s, inputWith({ pressed: { back: true } }));
    expect(b.screen).toBe("countdown");
  });

  it("navigates and confirms the pause menu", () => {
    let s = on("paused", { score: { p1: 3, p2: 2 }, mode: "solo" });
    s = applyMenuKeys(s, inputWith({ pressed: { "p2-down": true } }));
    expect(s.menuIndex).toBe(1);
    const restarted = applyMenuKeys(
      s,
      inputWith({ pressed: { confirm: true } }),
    );
    expect(restarted).toMatchObject({
      screen: "countdown",
      mode: "solo",
      score: { p1: 0, p2: 0 },
    });
    const resumed = applyMenuKeys(
      { ...s, menuIndex: 0 },
      inputWith({ pressed: { confirm: true } }),
    );
    expect(resumed.screen).toBe("playing");
    const quit = applyMenuKeys(
      { ...s, menuIndex: 2, titleIndex: 1 },
      inputWith({ pressed: { confirm: true } }),
    );
    expect(quit).toMatchObject({ screen: "title", menuIndex: 1 });
  });

  it("navigates and confirms the match-over menu", () => {
    const s = on("matchover", {
      winner: "left",
      score: { p1: 11, p2: 4 },
      mode: "versus",
    });
    const again = applyMenuKeys(s, inputWith({ pressed: { confirm: true } }));
    expect(again).toMatchObject({
      screen: "countdown",
      mode: "versus",
      winner: null,
    });
    const menu = applyMenuKeys(
      { ...s, menuIndex: 1 },
      inputWith({ pressed: { confirm: true } }),
    );
    expect(menu.screen).toBe("title");
    const back = applyMenuKeys(
      s,
      inputWith({ pressed: { back: true, "p1-down": true } }),
    );
    expect(back.screen).toBe("title");
    const moved = applyMenuKeys(s, inputWith({ pressed: { "p1-up": true } }));
    expect(moved.menuIndex).toBe(1);
  });

  it("confirming on a screen with no menu changes nothing", () => {
    const s = on("playing");
    expect(confirmMenuItem(s, 0)).toEqual(s);
    expect(applyMenuKeys(s, inputWith({ pressed: { confirm: true } }))).toEqual(
      s,
    );
  });
});

describe("pointer and touch", () => {
  it("selects the item a pointer moves onto", () => {
    const { x, y } = center("title", 2);
    const s = applyMenuPointer(
      on("title"),
      inputWith({ samples: [sample("move", x, y)] }),
    );
    expect(s.menuIndex).toBe(2);
    const off = applyMenuPointer(
      s,
      inputWith({ samples: [sample("move", 5, 5)] }),
    );
    expect(off.menuIndex).toBe(2);
  });

  it("confirms a press and release inside one item, across frames", () => {
    const { x, y } = center("title", 1);
    const pressed = applyMenuPointer(
      on("title"),
      inputWith({
        samples: [sample("down", x, y)],
        contacts: [
          { id: 1, x, y, primary: true, device: "mouse", buttons: ["primary"] },
        ],
      }),
    );
    expect(pressed.menuIndex).toBe(1);
    expect(pressed.screen).toBe("title");
    expect(pressed.menuPresses).toEqual([{ id: 1, screen: "title", item: 1 }]);
    const released = applyMenuPointer(
      pressed,
      inputWith({ samples: [sample("up", x + 3, y - 3)] }),
    );
    expect(released).toMatchObject({
      screen: "countdown",
      mode: "versus",
      titleIndex: 1,
    });
    expect(released.menuPresses).toEqual([]);
  });

  it("confirms a press and release that arrive on one frame", () => {
    const { x, y } = center("title", 2);
    const s = applyMenuPointer(
      on("title"),
      inputWith({ samples: [sample("down", x, y), sample("up", x, y)] }),
    );
    expect(s.screen).toBe("howto");
  });

  it("does not confirm when the edges fall in different regions or outside", () => {
    const a = center("title", 0);
    const b = center("title", 1);
    const crossed = applyMenuPointer(
      on("title"),
      inputWith({
        samples: [
          sample("down", a.x, a.y),
          sample("move", b.x, b.y),
          sample("up", b.x, b.y),
        ],
      }),
    );
    expect(crossed.screen).toBe("title");
    expect(crossed.menuIndex).toBe(1);
    const outside = applyMenuPointer(
      on("title"),
      inputWith({
        samples: [
          sample("down", 5, 5),
          sample("move", b.x, b.y),
          sample("up", b.x, b.y),
        ],
      }),
    );
    expect(outside.screen).toBe("title");
    expect(outside.menuIndex).toBe(1);
    const dragOut = applyMenuPointer(
      on("title"),
      inputWith({ samples: [sample("down", a.x, a.y), sample("up", 5, 5)] }),
    );
    expect(dragOut.screen).toBe("title");
  });

  it("drives the menu from a touch contact, by its own id", () => {
    const { x, y } = center("paused", 2);
    const touch = { id: 7, device: "touch" as const };
    const landed = applyMenuPointer(
      on("paused", { titleIndex: 1 }),
      inputWith({
        samples: [sample("down", 5, 5, touch), sample("move", x, y, touch)],
      }),
    );
    expect(landed.menuIndex).toBe(2);
    expect(landed.screen).toBe("paused");
    const lifted = applyMenuPointer(
      landed,
      inputWith({ samples: [sample("up", x, y, touch)] }),
    );
    expect(lifted.screen).toBe("paused");
    const tapped = applyMenuPointer(
      on("paused", { titleIndex: 1 }),
      inputWith({
        samples: [sample("down", x, y, touch), sample("up", x, y, touch)],
      }),
    );
    expect(tapped).toMatchObject({ screen: "title", menuIndex: 1 });
  });

  it("leaves samples after a confirm for the next screen", () => {
    const { x, y } = center("title", 2);
    const s = applyMenuPointer(
      on("title"),
      inputWith({
        samples: [
          sample("down", x, y),
          sample("up", x, y),
          sample("move", x, y - 100),
        ],
      }),
    );
    expect(s).toMatchObject({ screen: "howto", menuIndex: 0 });
  });

  it("ignores a secondary button's edges", () => {
    const { x, y } = center("title", 1);
    const s = applyMenuPointer(
      on("title"),
      inputWith({
        samples: [
          sample("down", x, y, { button: "secondary" }),
          sample("up", x, y, { button: "secondary" }),
        ],
      }),
    );
    expect(s.screen).toBe("title");
    expect(s.menuPresses).toEqual([]);
  });

  it("forgets a press from another screen and prunes lifted contacts", () => {
    const { x, y } = center("paused", 0);
    const stale: CaromState = on("paused", {
      menuPresses: [{ id: 1, screen: "title", item: 0 }],
    });
    const s = applyMenuPointer(
      stale,
      inputWith({ samples: [sample("up", x, y)] }),
    );
    expect(s.screen).toBe("paused");
    expect(s.menuPresses).toEqual([]);

    const held: CaromState = on("title", {
      menuPresses: [
        { id: 1, screen: "title", item: 0 },
        { id: 2, screen: "title", item: null },
      ],
    });
    const pruned = pruneMenuPresses(
      held,
      inputWith({
        contacts: [
          {
            id: 2,
            x: 0,
            y: 0,
            primary: false,
            device: "touch",
            buttons: ["primary"],
          },
        ],
      }),
    );
    expect(pruned.menuPresses).toEqual([
      { id: 2, screen: "title", item: null },
    ]);
    expect(
      pruneMenuPresses(
        pruned,
        inputWith({
          contacts: [
            {
              id: 2,
              x: 0,
              y: 0,
              primary: false,
              device: "touch",
              buttons: ["primary"],
            },
          ],
        }),
      ),
    ).toBe(pruned);
    expect(pruneMenuPresses(on("title"), NO_INPUT).menuPresses).toEqual([]);
  });
});
