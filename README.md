# Carom

Carom is a top-down paddle duel that runs entirely in the browser. Two paddles
face each other across a dark field while a ball ricochets between them, off
the top and bottom walls, and off a pair of obstacles standing mid-field. A
player scores when the ball crosses the far edge behind the opponent's paddle.
First to 11 points wins, by a lead of two.

What sets Carom apart is spin. The motion of your paddle at the moment it
strikes the ball curves the ball's flight afterwards: strike while moving down
and the ball bends clockwise, strike while moving up and it bends the other way.
The two obstacles turn the open field into a bank-shot puzzle, and a curving
ball finds angles a straight one never could.

Carom ships two modes:

- **Solo**: you take the left paddle against the machine on the right.
- **Versus**: two players share one keyboard, player one on the left and player
  two on the right.

Everything is drawn in code on a single canvas. The game ships no art or audio
files, fetches nothing at runtime, and needs no backend, account, or key.

## Install

Carom is a TypeScript project built with [Vite](https://vite.dev). It needs
Node.js 20 or newer and npm.

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Vite serves the game with hot reload and prints the local URL (by default
`http://localhost:5173`). Open it in any modern browser.

## Build for production

```sh
npm run build
```

This type-checks the project and emits a complete static site into `dist/`,
with `index.html` at its root. Serve that directory as-is from any static file
server; `npm run preview` serves it locally on port 4173 for a final check.

## Controls

| Action | Keys |
| --- | --- |
| Player one up / down | `W` / `S` |
| Player two up / down | `↑` / `↓` |
| Confirm a menu item | `Enter` or `Space` |
| Back out of a menu | `Esc` |
| Pause / resume | `P` or `Esc` |
| Mute / unmute | `M` |

In Solo, both pairs of movement keys move your paddle. Menus can also be driven
with the mouse or by touch: hover or tap to highlight an item, click or tap it
to confirm. On a touchscreen the engine draws a vertical slider along each edge
of the screen for the paddles and the menu buttons across the top.

The backtick key (`` ` ``) toggles a diagnostics overlay showing the screen,
the scores, and the ball's and paddles' positions and velocities.

## Project layout

| Path | Holds |
| --- | --- |
| `src/game.ts` | The state contract, the debug surface's type, and the three functions the engine drives. |
| `src/update.ts`, `src/field.ts`, `src/physics.ts`, `src/paddles.ts`, `src/menus.ts`, `src/world.ts` | The simulation, as pure functions over the state. |
| `src/debug.ts` | The debug and automation surface. |
| `src/render.ts` | Everything drawn on the canvas. |
| `src/constants.ts` | Every figure the specification fixes. |
| `src/**/*.test.ts` | The unit tests, run headlessly with Vitest. |
| `specs/` | The specification the game is built to. |
| `engine/` | The Simple 2D engine's documentation. |
| `showcase/` | The store-page description, carousel, screenshots, and a replay. |
| `scripts/` | The script that captures the showcase media from a headless browser. |

## Checks

```sh
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm run format      # prettier, in check mode
npm test            # vitest, with coverage
```

The tests stand the engine up over a headless canvas and a constant clock, so
they need no browser. To regenerate the showcase media, run
`node scripts/showcase.ts`, which drives the game in a headless Chromium.
