import type { NormalizedLandmark } from "@mediapipe/tasks-vision";

// ── SNAP GESTURE ──────────────────────────────────────────────────────────
// We use a state machine: OPEN → PINCHED → OPEN (fast) = snap event

type SnapState = 'open' | 'pinched';

interface SnapTracker {
  state: SnapState;
  pinchedAt: number;
}

const snapTrackers: SnapTracker[] = [
  { state: 'open', pinchedAt: 0 },
  { state: 'open', pinchedAt: 0 },
];

const dist2D = (a: NormalizedLandmark, b: NormalizedLandmark) =>
  Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Returns true once per snap event (thumb‑tip ↔ middle‑finger‑tip pinch then release).
 */
export const detectSnap = (handLandmarks: NormalizedLandmark[][]): boolean => {
  if (!handLandmarks || handLandmarks.length === 0) return false;

  let snapped = false;
  const now = Date.now();

  for (let i = 0; i < handLandmarks.length; i++) {
    const hand = handLandmarks[i];
    const tracker = snapTrackers[i] ?? (snapTrackers[i] = { state: 'open', pinchedAt: 0 });

    const thumbTip  = hand[4];
    const midTip    = hand[12];
    if (!thumbTip || !midTip) continue;

    const d = dist2D(thumbTip, midTip);

    if (tracker.state === 'open' && d < 0.06) {
      tracker.state = 'pinched';
      tracker.pinchedAt = now;
    } else if (tracker.state === 'pinched' && d > 0.10) {
      // Must have opened within 800ms of the pinch
      if (now - tracker.pinchedAt < 800) {
        snapped = true;
      }
      tracker.state = 'open';
    }
  }

  return snapped;
};

// ── KATANA DRAW GESTURE ───────────────────────────────────────────────────
// State machine: IDLE → COCKED (wrist near shoulder) → THRUST (wrist extends fast) = draw event

type DrawState = 'idle' | 'cocked';

interface DrawTracker {
  state: DrawState;
  cockedAt: number;
  lastWristX: number;
}

const drawTracker: DrawTracker = { state: 'idle', cockedAt: 0, lastWristX: 0 };

/**
 * Returns true once per draw event (pull wrist to shoulder → thrust forward).
 */
export const detectKatanaDraw = (poseLandmarks: NormalizedLandmark[][]): boolean => {
  if (!poseLandmarks || poseLandmarks.length === 0) return false;

  const pose = poseLandmarks[0];
  // Landmark indices: 15=leftWrist 16=rightWrist  11=leftShoulder 12=rightShoulder
  const rightWrist    = pose[16];
  const rightShoulder = pose[12];
  const leftWrist     = pose[15];
  const leftShoulder  = pose[11];

  if (!rightWrist || !rightShoulder || !leftWrist || !leftShoulder) return false;

  // Work with whichever wrist is currently closer to its own shoulder
  const rightDist = dist2D(rightWrist, rightShoulder);
  const leftDist  = dist2D(leftWrist,  leftShoulder);

  const wrist    = rightDist <= leftDist ? rightWrist    : leftWrist;
  const shoulder = rightDist <= leftDist ? rightShoulder : leftShoulder;
  const d        = Math.min(rightDist, leftDist);

  const now = Date.now();

  if (drawTracker.state === 'idle' && d < 0.18) {
    drawTracker.state   = 'cocked';
    drawTracker.cockedAt = now;
    drawTracker.lastWristX = wrist.x;
  } else if (drawTracker.state === 'cocked') {
    // Timeout – reset if they held the cocked pose too long without thrusting
    if (now - drawTracker.cockedAt > 2000) {
      drawTracker.state = 'idle';
      return false;
    }

    const extensionDist = dist2D(wrist, shoulder);
    if (extensionDist > 0.38 && now - drawTracker.cockedAt < 1500) {
      drawTracker.state = 'idle';
      return true; // ← DRAW!
    }
  }

  return false;
};
