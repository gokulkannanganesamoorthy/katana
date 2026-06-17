import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMediaPipe } from './hooks/useMediaPipe';
import { detectSnap, detectKatanaDraw } from './utils/gestureDetection';
import { playSnapSound, playSwordDrawSound } from './utils/audio';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import './index.css';

// Pre-load images once at module level so they're always ready
const samuraiImg = new Image();
samuraiImg.src = '/samurai.png';
const katanaImg = new Image();
katanaImg.src = '/katana.png';

const dist2D = (a: NormalizedLandmark, b: NormalizedLandmark) =>
  Math.hypot(a.x - b.x, a.y - b.y);

function drawAR(
  canvas: HTMLCanvasElement,
  handLandmarks: NormalizedLandmark[][] | null,
  poseLandmarks: NormalizedLandmark[][] | null,
  samurai: boolean,
  katana: boolean,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const W = canvas.width;
  const H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  // ── SAMURAI ARMOR ─────────────────────────────────────────────────────
  if (samurai && poseLandmarks && poseLandmarks.length > 0 && samuraiImg.complete && samuraiImg.naturalWidth > 0) {
    const pose = poseLandmarks[0];
    const ls = pose[11]; // left shoulder
    const rs = pose[12]; // right shoulder
    const lh = pose[23]; // left hip
    const rh = pose[24]; // right hip

    if (ls && rs) {
      // Video is mirrored, so we flip x: mirrored_x = 1 - original_x
      const shoulderCX = (1 - (ls.x + rs.x) / 2) * W;
      const shoulderCY = ((ls.y + rs.y) / 2) * H;

      const hipCY = lh && rh ? ((lh.y + rh.y) / 2) * H : shoulderCY + H * 0.35;
      const bodyHeight = Math.max(hipCY - shoulderCY, 80);

      const shoulderWidthPx = dist2D(ls, rs) * W;
      const drawW = Math.max(shoulderWidthPx * 2.6, 200);
      const drawH = bodyHeight * 2.0;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.88;
      ctx.drawImage(samuraiImg, shoulderCX - drawW / 2, shoulderCY - drawH * 0.1, drawW, drawH);
      ctx.restore();
    }
  }

  // ── KATANA ────────────────────────────────────────────────────────────
  if (katana && handLandmarks && handLandmarks.length > 0 && katanaImg.complete && katanaImg.naturalWidth > 0) {
    const hand = handLandmarks[0];
    const wrist     = hand[0];
    const indexBase = hand[5];
    const pinkyBase = hand[17];

    if (wrist && indexBase && pinkyBase) {
      // Mirror x
      const wx = (1 - wrist.x) * W;
      const wy = wrist.y * H;
      const midBaseX = (1 - (indexBase.x + pinkyBase.x) / 2) * W;
      const midBaseY = ((indexBase.y + pinkyBase.y) / 2) * H;

      const angle = Math.atan2(midBaseY - wy, midBaseX - wx) - Math.PI / 2;

      const katanaH = Math.min(H * 0.55, 400);
      const katanaW = katanaH * 0.22;

      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(angle);

      // Glow VFX
      ctx.shadowColor = '#00f5ff';
      ctx.shadowBlur  = 35;

      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.95;
      ctx.drawImage(katanaImg, -katanaW / 2, -katanaH + katanaH * 0.15, katanaW, katanaH);

      // Second glow pass
      ctx.globalAlpha = 0.3;
      ctx.drawImage(katanaImg, -katanaW, -katanaH + katanaH * 0.13, katanaW * 2, katanaH * 1.05);

      ctx.restore();
    }
  }
}

function App() {
  const { videoRef, handLandmarker, poseLandmarker, isLoaded, loadingStatus } = useMediaPipe();

  const [isSamuraiMode, setIsSamuraiMode] = useState(false);
  const [isKatanaMode,  setIsKatanaMode]  = useState(false);
  const [flashColor,    setFlashColor]    = useState<'red' | 'cyan' | null>(null);

  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const isSamuraiRef = useRef(false);
  const isKatanaRef  = useRef(false);
  const lastSnapTime = useRef(0);
  const lastDrawTime = useRef(0);
  const rafId        = useRef<number>(0);

  useEffect(() => { isSamuraiRef.current = isSamuraiMode; }, [isSamuraiMode]);
  useEffect(() => { isKatanaRef.current  = isKatanaMode;  }, [isKatanaMode]);

  const triggerFlash = useCallback((color: 'red' | 'cyan') => {
    setFlashColor(color);
    setTimeout(() => setFlashColor(null), 500);
  }, []);

  useEffect(() => {
    if (!isLoaded || !handLandmarker || !poseLandmarker) return;

    let lastVideoTime = -1;

    const loop = () => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;

      if (!video || video.readyState < 2) {
        rafId.current = requestAnimationFrame(loop);
        return;
      }

      // Sync canvas dimensions to video
      if (canvas && (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight)) {
        canvas.width  = video.videoWidth  || 1280;
        canvas.height = video.videoHeight || 720;
      }

      if (video.currentTime !== lastVideoTime) {
        lastVideoTime = video.currentTime;

        const ts = performance.now();

        const handResult = handLandmarker.detectForVideo(video, ts);
        const hands = handResult.landmarks ?? [];

        const poseResult = poseLandmarker.detectForVideo(video, ts);
        const poses = poseResult.landmarks ?? [];

        // Gesture checks
        const now = Date.now();

        if (hands.length > 0) {
          const isSnap = detectSnap(hands);
          if (isSnap && now - lastSnapTime.current > 1000) {
            lastSnapTime.current = now;
            setIsSamuraiMode(prev => !prev);
            // Pass new value directly to isSamuraiRef
            isSamuraiRef.current = !isSamuraiRef.current;
            playSnapSound();
            triggerFlash('red');
          }
        }

        if (poses.length > 0) {
          const isDraw = detectKatanaDraw(poses);
          if (isDraw && now - lastDrawTime.current > 1500) {
            lastDrawTime.current = now;
            setIsKatanaMode(prev => !prev);
            isKatanaRef.current = !isKatanaRef.current;
            playSwordDrawSound();
            triggerFlash('cyan');
          }
        }

        // Draw AR directly on canvas — bypass React rendering entirely for AR layer
        if (canvas) {
          drawAR(
            canvas,
            hands.length > 0 ? hands : null,
            poses.length > 0 ? poses : null,
            isSamuraiRef.current,
            isKatanaRef.current,
          );
        }
      }

      rafId.current = requestAnimationFrame(loop);
    };

    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, [isLoaded, handLandmarker, poseLandmarker, triggerFlash, videoRef]);

  return (
    <div className="app-shell">
      {!isLoaded && (
        <div className="loading-screen">
          <div className="loading-title">刀</div>
          <div className="loading-ring" />
          <p className="loading-text">{loadingStatus}</p>
        </div>
      )}

      <div className="video-stage">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="webcam-video"
        />
        <canvas ref={canvasRef} className="ar-canvas" />

        {flashColor && (
          <div className={`flash-overlay flash-${flashColor}`} key={Date.now()} />
        )}

        {isLoaded && (
          <div className="hud">
            <div className="hud-title">
              <h1>KATANA AR</h1>
              <span className="subtitle">MediaPipe Vision</span>
            </div>

            <div className="hud-instructions">
              <div className="instruction-item">
                <span className="instruction-icon">🤌</span>
                <span>Pinch thumb + middle finger then <b>release</b> quickly to toggle Samurai armor</span>
              </div>
              <div className="instruction-item">
                <span className="instruction-icon">⚔️</span>
                <span>Pull wrist to shoulder, then thrust forward to draw/sheathe Katana</span>
              </div>
            </div>

            <div className="hud-status">
              <div className={`status-pill${isSamuraiMode ? ' active-samurai' : ''}`}>
                <div className="dot" />
                Samurai {isSamuraiMode ? 'ON' : 'OFF'}
              </div>
              <div className={`status-pill${isKatanaMode ? ' active-katana' : ''}`}>
                <div className="dot" />
                Katana {isKatanaMode ? 'ON' : 'OFF'}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
