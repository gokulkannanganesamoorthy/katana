import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// ─── HELPERS ──────────────────────────────────────────────────────────────
const dist2D = (a: NormalizedLandmark, b: NormalizedLandmark) =>
  Math.hypot(a.x - b.x, a.y - b.y);

// ─── SNAP GESTURE ─────────────────────────────────────────────────────────
// State machine: OPEN → PINCHED → OPEN (fast) = snap event

type SnapState = 'open' | 'pinched';
interface SnapTracker { state: SnapState; pinchedAt: number; }

const snapTrackers: SnapTracker[] = [
  { state: 'open', pinchedAt: 0 },
  { state: 'open', pinchedAt: 0 },
];

/** Returns true once per snap (thumb ↔ middle-finger pinch then quick release). */
export const detectSnap = (hands: NormalizedLandmark[][]): boolean => {
  if (!hands || hands.length === 0) return false;
  let fired = false;
  const now = Date.now();
  for (let i = 0; i < hands.length; i++) {
    const hand = hands[i];
    const tracker = snapTrackers[i] ?? (snapTrackers[i] = { state: 'open', pinchedAt: 0 });
    const thumbTip = hand[4];
    const midTip   = hand[12];
    if (!thumbTip || !midTip) continue;
    const d = dist2D(thumbTip, midTip);
    if (tracker.state === 'open' && d < 0.06) {
      tracker.state = 'pinched'; tracker.pinchedAt = now;
    } else if (tracker.state === 'pinched' && d > 0.10) {
      if (now - tracker.pinchedAt < 800) fired = true;
      tracker.state = 'open';
    }
  }
  return fired;
};

// ─── KATANA DRAW GESTURE ──────────────────────────────────────────────────
// State machine: IDLE → COCKED (wrist near shoulder) → THRUST (extends fast)

type DrawState = 'idle' | 'cocked';
interface DrawTracker { state: DrawState; cockedAt: number; }

const drawTracker: DrawTracker = { state: 'idle', cockedAt: 0 };

/** Returns true once per draw event. */
export const detectKatanaDraw = (poses: NormalizedLandmark[][]): boolean => {
  if (!poses || poses.length === 0) return false;
  const pose = poses[0];

  // Try both wrists, pick whichever is closer to its shoulder
  const rw = pose[16]; const rs = pose[12];
  const lw = pose[15]; const ls = pose[11];
  if (!rw || !rs || !lw || !ls) return false;

  const rd = dist2D(rw, rs);
  const ld = dist2D(lw, ls);
  const wrist    = rd <= ld ? rw : lw;
  const shoulder = rd <= ld ? rs : ls;
  const d        = Math.min(rd, ld);

  const now = Date.now();

  if (drawTracker.state === 'idle' && d < 0.18) {
    drawTracker.state = 'cocked'; drawTracker.cockedAt = now;
  } else if (drawTracker.state === 'cocked') {
    if (now - drawTracker.cockedAt > 2000) { drawTracker.state = 'idle'; return false; }
    if (dist2D(wrist, shoulder) > 0.38 && now - drawTracker.cockedAt < 1500) {
      drawTracker.state = 'idle'; return true;
    }
  }
  return false;
};
