// Drawing (specs/overview.md, specs/ui.md): the field and its furniture, the
// heads-up display, and each screen's menu. Everything is drawn in logical
// units through the context the engine prepares; nothing here touches the
// state.

import {
  BALL_R,
  FIELD_CX,
  FIELD_CY,
  FIELD_H,
  FIELD_W,
  HOLD_TIME,
  NET_X,
  OBSTACLE_H,
  OBSTACLE_W,
  P1_X0,
  P2_X0,
  PADDLE_H,
  PADDLE_W,
  TITLE_TEXT,
  TRAIL_TIME,
} from "./constants";
import type { BallState, Screen, Side, StateView } from "./game";
import { MENU_ITEMS, menuItemRect } from "./menus";

export const PALETTE = {
  field: "#0b1020",
  line: "#1c2745",
  net: "#34426b",
  leftPaddle: "#3fe0ff",
  rightPaddle: "#ff5fa8",
  ball: "#fff3b0",
  obstacle: "#ffb648",
  text: "#eef1ff",
  dim: "#8d98c4",
  overlay: "rgba(8, 12, 28, 0.74)",
  highlight: "#3fe0ff",
  highlightText: "#0b1020",
} as const;

const FONT = '"Trebuchet MS", "Segoe UI", Helvetica, Arial, sans-serif';

function font(size: number, weight: "bold" | "normal" = "bold"): string {
  return `${weight} ${size}px ${FONT}`;
}

/** A rounded rectangle path, built from arcs so it draws the same everywhere. */
export function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function text(
  ctx: CanvasRenderingContext2D,
  copy: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign = "center",
  weight: "bold" | "normal" = "bold",
): void {
  ctx.font = font(size, weight);
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillText(copy, x, y);
}

// ---- The field ---------------------------------------------------------------

function drawBackdrop(ctx: CanvasRenderingContext2D): void {
  // Goal zones, faintly tinted in each side's color.
  ctx.fillStyle = "rgba(63, 224, 255, 0.05)";
  ctx.fillRect(0, 0, P1_X0, FIELD_H);
  ctx.fillStyle = "rgba(255, 95, 168, 0.05)";
  ctx.fillRect(P2_X0 + PADDLE_W, 0, FIELD_W - P2_X0 - PADDLE_W, FIELD_H);

  // The walls.
  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(0, 2);
  ctx.lineTo(FIELD_W, 2);
  ctx.moveTo(0, FIELD_H - 2);
  ctx.lineTo(FIELD_W, FIELD_H - 2);
  ctx.stroke();

  // The center net: decoration, no collision.
  ctx.strokeStyle = PALETTE.net;
  ctx.lineWidth = 4;
  ctx.setLineDash([18, 14]);
  ctx.beginPath();
  ctx.moveTo(NET_X, 10);
  ctx.lineTo(NET_X, FIELD_H - 10);
  ctx.stroke();
  ctx.setLineDash([]);

  // The center circle.
  ctx.strokeStyle = PALETTE.line;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(FIELD_CX, FIELD_CY, 90, 0, Math.PI * 2);
  ctx.stroke();
}

function drawObstacles(ctx: CanvasRenderingContext2D, state: StateView): void {
  for (const obstacle of state.obstacles) {
    ctx.save();
    ctx.shadowColor = PALETTE.obstacle;
    ctx.shadowBlur = 18;
    ctx.fillStyle = PALETTE.obstacle;
    roundedRect(
      ctx,
      obstacle.cx - OBSTACLE_W / 2,
      obstacle.cy - OBSTACLE_H / 2,
      OBSTACLE_W,
      OBSTACLE_H,
      OBSTACLE_W / 2,
    );
    ctx.fill();
    ctx.restore();
  }
}

function drawPaddle(
  ctx: CanvasRenderingContext2D,
  side: Side,
  cy: number,
): void {
  const x = side === "left" ? P1_X0 : P2_X0;
  const color = side === "left" ? PALETTE.leftPaddle : PALETTE.rightPaddle;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 22;
  ctx.fillStyle = color;
  roundedRect(ctx, x, cy - PADDLE_H / 2, PADDLE_W, PADDLE_H, PADDLE_W / 2);
  ctx.fill();
  ctx.restore();
}

/** The ball's path over the last `TRAIL_TIME` seconds, fading toward its tail. */
function drawTrail(
  ctx: CanvasRenderingContext2D,
  ball: BallState,
  simTime: number,
): void {
  const samples = ball.trail;
  if (samples.length < 2) return;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (let i = 1; i < samples.length; i++) {
    const from = samples[i - 1];
    const to = samples[i];
    if (from === undefined || to === undefined) continue;
    const age = Math.max(0, Math.min(1, (simTime - to.t) / TRAIL_TIME));
    const k = 1 - age;
    ctx.strokeStyle = `rgba(255, 243, 176, ${(0.55 * k).toFixed(3)})`;
    ctx.lineWidth = 2 + 2 * BALL_R * k * 0.8;
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBall(ctx: CanvasRenderingContext2D, ball: BallState): void {
  ctx.save();
  ctx.shadowColor = PALETTE.ball;
  ctx.shadowBlur = 24;
  ctx.fillStyle = PALETTE.ball;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** The field and everything on it. */
function drawField(ctx: CanvasRenderingContext2D, state: StateView): void {
  drawBackdrop(ctx);
  drawObstacles(ctx, state);
  drawPaddle(ctx, "left", state.paddles.left.cy);
  drawPaddle(ctx, "right", state.paddles.right.cy);
  if (state.ball !== null) {
    drawTrail(ctx, state.ball, state.simTime);
    drawBall(ctx, state.ball);
  }
}

// ---- The heads-up display -----------------------------------------------------

export function modeLabel(state: StateView): string {
  return state.mode === "solo" ? "SOLO  ·  YOU vs CPU" : "VERSUS  ·  P1 vs P2";
}

function drawHud(ctx: CanvasRenderingContext2D, state: StateView): void {
  const { p1, p2 } = state.score;
  text(ctx, String(p1), FIELD_CX - 70, 72, 64, PALETTE.leftPaddle, "right");
  text(ctx, String(p2), FIELD_CX + 70, 72, 64, PALETTE.rightPaddle, "left");
  text(ctx, modeLabel(state), FIELD_CX, 32, 16, PALETTE.dim);
}

// ---- Menus ---------------------------------------------------------------------

function drawMenu(
  ctx: CanvasRenderingContext2D,
  screen: Screen,
  menuIndex: number,
): void {
  const items = MENU_ITEMS[screen];
  items.forEach((label, index) => {
    const rect = menuItemRect(screen, index);
    if (rect === null) return;
    const highlighted = index === menuIndex;
    ctx.save();
    if (highlighted) {
      ctx.shadowColor = PALETTE.highlight;
      ctx.shadowBlur = 20;
      ctx.fillStyle = PALETTE.highlight;
      roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
      ctx.fill();
    } else {
      ctx.strokeStyle = PALETTE.net;
      ctx.lineWidth = 2;
      roundedRect(ctx, rect.x, rect.y, rect.w, rect.h, 12);
      ctx.stroke();
    }
    ctx.restore();
    text(
      ctx,
      label,
      rect.x + rect.w / 2,
      rect.y + rect.h / 2 + 1,
      26,
      highlighted ? PALETTE.highlightText : PALETTE.text,
    );
  });
}

function dimField(ctx: CanvasRenderingContext2D): void {
  ctx.fillStyle = PALETTE.overlay;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

function drawTitle(ctx: CanvasRenderingContext2D, state: StateView): void {
  drawField(ctx, state);
  dimField(ctx);
  ctx.save();
  ctx.shadowColor = PALETTE.leftPaddle;
  ctx.shadowBlur = 40;
  text(ctx, TITLE_TEXT, FIELD_CX, 215, 132, PALETTE.text);
  ctx.restore();
  text(ctx, "A TOP-DOWN PADDLE DUEL", FIELD_CX, 300, 22, PALETTE.dim);
  drawMenu(ctx, "title", state.menuIndex);
  text(
    ctx,
    "W / S and ARROWS move   ·   ENTER selects   ·   ESC backs out   ·   M mutes",
    FIELD_CX,
    FIELD_H - 34,
    16,
    PALETTE.dim,
    "center",
    "normal",
  );
}

/** The how-to screen's sections: a heading and the lines under it. */
const HOWTO_SECTIONS: ReadonlyArray<readonly [string, readonly string[]]> = [
  [
    "CONTROLS",
    [
      "Player one: W and S.   Player two: Up and Down arrows.",
      "In Solo either pair moves you; the machine takes the right paddle.",
      "P or Esc pauses.   M mutes.   Enter confirms.   Esc backs out of a menu.",
    ],
  ],
  [
    "SPIN",
    [
      "Strike the ball while your paddle is moving and its flight curves:",
      "moving down bends it clockwise, moving up counter-clockwise. Spin fades fast.",
    ],
  ],
  [
    "OBSTACLES",
    ["Two bars stand mid-field. Bank the ball off them to open up an angle."],
  ],
  [
    "RULES",
    [
      "First to 11 points wins, by a lead of two. The side scored on serves next.",
    ],
  ],
];

function drawHowto(ctx: CanvasRenderingContext2D, state: StateView): void {
  drawField(ctx, state);
  dimField(ctx);
  text(ctx, "HOW TO PLAY", FIELD_CX, 90, 56, PALETTE.text);
  let y = 172;
  for (const [heading, lines] of HOWTO_SECTIONS) {
    text(ctx, heading, 180, y, 20, PALETTE.obstacle, "left");
    for (const line of lines) {
      text(ctx, line, 340, y, 19, PALETTE.text, "left", "normal");
      y += 32;
    }
    y += 16;
  }
  drawMenu(ctx, "howto", state.menuIndex);
}

function drawCountdown(ctx: CanvasRenderingContext2D, state: StateView): void {
  drawField(ctx, state);
  drawHud(ctx, state);
  const ball = state.ball;
  if (ball === null) return;
  const remaining = Math.max(0, Math.min(1, ball.holdTimer / HOLD_TIME));
  ctx.save();
  ctx.strokeStyle = PALETTE.ball;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(
    ball.x,
    ball.y,
    BALL_R + 14,
    -Math.PI / 2,
    -Math.PI / 2 + Math.PI * 2 * (1 - remaining),
  );
  ctx.stroke();
  ctx.restore();
  const toward = state.receiver === "left" ? "◀  SERVE" : "SERVE  ▶";
  text(ctx, toward, FIELD_CX, FIELD_CY - 60, 22, PALETTE.dim);
}

function drawPlaying(ctx: CanvasRenderingContext2D, state: StateView): void {
  drawField(ctx, state);
  drawHud(ctx, state);
}

function drawPaused(ctx: CanvasRenderingContext2D, state: StateView): void {
  drawField(ctx, state);
  drawHud(ctx, state);
  dimField(ctx);
  text(ctx, "PAUSED", FIELD_CX, 230, 72, PALETTE.text);
  drawMenu(ctx, "paused", state.menuIndex);
}

export function winnerLabel(state: StateView): string {
  if (state.winner === null) return "MATCH OVER";
  if (state.mode === "solo") {
    return state.winner === "left" ? "YOU WIN" : "THE MACHINE WINS";
  }
  return state.winner === "left" ? "PLAYER ONE WINS" : "PLAYER TWO WINS";
}

function drawMatchover(ctx: CanvasRenderingContext2D, state: StateView): void {
  drawField(ctx, state);
  drawHud(ctx, state);
  dimField(ctx);
  const color =
    state.winner === "right" ? PALETTE.rightPaddle : PALETTE.leftPaddle;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  text(ctx, winnerLabel(state), FIELD_CX, 212, 64, color);
  ctx.restore();
  const side = state.winner === "right" ? "RIGHT SIDE" : "LEFT SIDE";
  text(ctx, side, FIELD_CX, 268, 20, PALETTE.dim);
  text(
    ctx,
    `${state.score.p1}  –  ${state.score.p2}`,
    FIELD_CX,
    340,
    56,
    PALETTE.text,
  );
  drawMenu(ctx, "matchover", state.menuIndex);
}

/** Draws the state the update left, on whichever screen it is showing. */
export function render(state: StateView, ctx: CanvasRenderingContext2D): void {
  switch (state.screen) {
    case "title":
      drawTitle(ctx, state);
      break;
    case "howto":
      drawHowto(ctx, state);
      break;
    case "countdown":
      drawCountdown(ctx, state);
      break;
    case "playing":
      drawPlaying(ctx, state);
      break;
    case "paused":
      drawPaused(ctx, state);
      break;
    case "matchover":
      drawMatchover(ctx, state);
      break;
  }
  if (state.muted) {
    text(ctx, "MUTED", FIELD_W - 24, FIELD_H - 22, 14, PALETTE.dim, "right");
  }
}
