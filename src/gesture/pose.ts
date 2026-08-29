export interface Point {
  x: number;
  y: number;
  z?: number;
}

export interface Point3 {
  x: number;
  y: number;
  z: number;
}

const FINGER_TIPS = [8, 12, 16, 20];
const FINGER_PIPS = [6, 10, 14, 18];
const THUMB_CLEAR_ON = 1;
const THUMB_CLEAR_OFF = 0.85;

function distance(a: Point, b: Point) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function distance3(a: Point3, b: Point3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function usable3D(world?: Point3[] | null): world is Point3[] {
  return Array.isArray(world) && world.length >= 21 && Number.isFinite(world[0]?.z);
}

function span(a: number, b: number, landmarks: Point[], world?: Point3[] | null) {
  return usable3D(world) ? distance3(world[a], world[b]) : distance(landmarks[a], landmarks[b]);
}

export function fingersExtended(landmarks: Point[], world?: Point3[] | null): boolean[] {
  if (landmarks.length < 21) return [false, false, false, false];
  return FINGER_TIPS.map((tip, index) => {
    const pip = FINGER_PIPS[index];
    return span(tip, 0, landmarks, world) > span(pip, 0, landmarks, world) * 1.08;
  });
}

// This is the same pose seam used by dsh-jarvis-hud: three extended fingers
// plus a thumb deliberately clear of the index. It has no frame-height or
// handedness branch, so either hand works at a natural laptop-camera height.
export function isOpenPalm(
  landmarks: Point[],
  world: Point3[] | null | undefined,
  wasPalm: boolean,
): boolean {
  if (landmarks.length < 21) return false;
  const extended = fingersExtended(landmarks, world);
  if (extended.filter(Boolean).length < 3) return false;
  const palm = span(0, 9, landmarks, world) || 0.0001;
  const thumbClear = span(4, 8, landmarks, world) / palm;
  return thumbClear > (wasPalm ? THUMB_CLEAR_OFF : THUMB_CLEAR_ON);
}
