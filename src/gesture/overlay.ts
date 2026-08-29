import type { Point } from "./pose";

// MediaPipe hand topology: 21 landmarks, 21 bones.
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export const PALM_COLOR = "#54e0a1";
export const IDLE_COLOR = "rgba(255, 255, 255, 0.85)";

export interface OverlayHand {
  landmarks: Point[];
  palm: boolean;
}

// The subset of CanvasRenderingContext2D the overlay uses, so the drawing
// maths stays testable from landmark data without a browser canvas.
export interface OverlayContext {
  strokeStyle: string | CanvasGradient | CanvasPattern;
  fillStyle: string | CanvasGradient | CanvasPattern;
  lineWidth: number;
  lineCap: CanvasLineCap;
  clearRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  stroke(): void;
  arc(x: number, y: number, r: number, start: number, end: number): void;
  fill(): void;
}

// Draws in raw (unmirrored) landmark coordinates; the canvas element carries
// the same CSS scaleX(-1) as the selfie video, so the skeleton stays glued to
// the hand the user sees.
export function drawHands(ctx: OverlayContext, width: number, height: number, hands: OverlayHand[]) {
  ctx.clearRect(0, 0, width, height);
  const bone = Math.max(2, Math.round(width / 220));
  for (const hand of hands) {
    if (hand.landmarks.length < 21) continue;
    const color = hand.palm ? PALM_COLOR : IDLE_COLOR;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = bone;
    ctx.lineCap = "round";
    for (const [a, b] of HAND_CONNECTIONS) {
      ctx.beginPath();
      ctx.moveTo(hand.landmarks[a].x * width, hand.landmarks[a].y * height);
      ctx.lineTo(hand.landmarks[b].x * width, hand.landmarks[b].y * height);
      ctx.stroke();
    }
    for (let i = 0; i < 21; i++) {
      const joint = i === 0 || i === 4 || i === 8 || i === 12 || i === 16 || i === 20;
      ctx.beginPath();
      ctx.arc(hand.landmarks[i].x * width, hand.landmarks[i].y * height, joint ? bone * 1.7 : bone * 1.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}
