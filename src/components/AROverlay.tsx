import React, { useEffect, useRef } from 'react';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

interface AROverlayProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  handLandmarks: NormalizedLandmark[][] | null;
  poseLandmarks: NormalizedLandmark[][] | null;
  isSamuraiMode: boolean;
  isKatanaMode: boolean;
}

const samuraiImg = new Image();
samuraiImg.src = '/samurai.png';
const katanaImg = new Image();
katanaImg.src = '/katana.png';

const dist2D = (a: NormalizedLandmark, b: NormalizedLandmark) =>
  Math.hypot(a.x - b.x, a.y - b.y);

export const AROverlay: React.FC<AROverlayProps> = ({
  canvasRef,
  handLandmarks,
  poseLandmarks,
  isSamuraiMode,
  isKatanaMode,
}) => {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // ── SAMURAI ARMOR ─────────────────────────────────────────────────────
    if (isSamuraiMode && poseLandmarks && poseLandmarks.length > 0 && samuraiImg.complete) {
      const pose = poseLandmarks[0];
      const ls = pose[11]; // left shoulder
      const rs = pose[12]; // right shoulder
      const lh = pose[23]; // left hip
      const rh = pose[24]; // right hip

      if (ls && rs && lh && rh) {
        // mirror x because canvas is mirrored
        const shoulderCX = (1 - (ls.x + rs.x) / 2) * W;
        const shoulderCY = ((ls.y + rs.y) / 2) * H;
        const hipCY      = ((lh.y + rh.y) / 2) * H;

        const shoulderWidthPx = dist2D(ls, rs) * W;
        // Draw armor wider than the shoulder span, and tall enough to cover torso
        const drawW = shoulderWidthPx * 2.8;
        const drawH = (hipCY - shoulderCY) * 2.2 || drawW; // fallback

        ctx.save();
        ctx.globalCompositeOperation = 'screen'; // removes black bg from image
        ctx.globalAlpha = 0.92;
        ctx.drawImage(samuraiImg, shoulderCX - drawW / 2, shoulderCY - drawH * 0.15, drawW, drawH);
        ctx.restore();
      }
    }

    // ── KATANA ────────────────────────────────────────────────────────────
    if (isKatanaMode && handLandmarks && handLandmarks.length > 0 && katanaImg.complete) {
      const hand = handLandmarks[0];
      const wrist      = hand[0];
      const indexBase  = hand[5];
      const pinkyBase  = hand[17];

      if (wrist && indexBase && pinkyBase) {
        // Mirror x coords because canvas is mirrored
        const wx = (1 - wrist.x) * W;
        const wy = wrist.y * H;

        // Direction vector from wrist to mid-metacarpals
        const midBaseX = (1 - (indexBase.x + pinkyBase.x) / 2) * W;
        const midBaseY = ((indexBase.y + pinkyBase.y) / 2) * H;

        const angle = Math.atan2(midBaseY - wy, midBaseX - wx) - Math.PI / 2;

        const katanaH = 380;
        const katanaW = 80;

        ctx.save();
        ctx.translate(wx, wy);
        ctx.rotate(angle);

        // VFX: glow halo
        ctx.shadowColor = '#00f5ff';
        ctx.shadowBlur  = 30;

        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.95;
        // Draw so handle is at origin (wrist), blade extends in the hand direction
        ctx.drawImage(katanaImg, -katanaW / 2, -katanaH + 60, katanaW, katanaH);

        // Extra glow pass
        ctx.globalAlpha = 0.25;
        ctx.drawImage(katanaImg, -katanaW / 2 - 5, -katanaH + 55, katanaW + 10, katanaH + 10);

        ctx.restore();
      }
    }
  });

  return null;
};
