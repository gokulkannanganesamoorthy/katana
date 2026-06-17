import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMediaPipe } from './hooks/useMediaPipe';
import { detectSnap, detectKatanaDraw } from './utils/gestureDetection';
import { playSnapSound, playSwordDrawSound } from './utils/audio';
import { ThreeScene } from './components/ThreeScene';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import './index.css';

// ─── ASSET CATALOGUE ──────────────────────────────────────────────────────
const KATANA_OPTIONS = [
  { id: 'none', label: 'None', emoji: '✕', src: null, glow: '#00f5ff' },
  {
    id: 'cyan',
    label: 'Phantom',
    emoji: '🗡️',
    src: '/katana.png',
    glow: '#00f5ff',
  },
  {
    id: 'red',
    label: 'Inferno',
    emoji: '🔥',
    src: '/katana_red.png',
    glow: '#ff3300',
  },
  {
    id: 'gold',
    label: 'Divine',
    emoji: '⚡',
    src: '/katana_gold.png',
    glow: '#ffd700',
  },
] as const;
type KatanaId = (typeof KATANA_OPTIONS)[number]['id'];

const ARMOR_OPTIONS = [
  { id: 'none', label: 'None', emoji: '✕', src: null },
  { id: 'red', label: 'Warlord', emoji: '🥷', src: '/samurai.png' },
  { id: 'white', label: 'Noble', emoji: '🤍', src: '/armor_white.png' },
  { id: 'black', label: 'Oni', emoji: '👹', src: '/armor_black.png' },
] as const;
type ArmorId = (typeof ARMOR_OPTIONS)[number]['id'];

const BG_OPTIONS = [
  { id: 'none', label: 'None', src: null },
  { id: 'dojo', label: 'Dojo', src: '/bg_dojo.png' },
  { id: 'mountain', label: 'Mountain', src: '/bg_mountain.png' },
  { id: 'battlefield', label: 'Battlefield', src: '/bg_battlefield.png' },
] as const;
type BgId = (typeof BG_OPTIONS)[number]['id'];

// Pre-load all images at module level
const imgCache: Record<string, HTMLImageElement> = {};
function loadImg(src: string): HTMLImageElement {
  if (!imgCache[src]) {
    const i = new Image();
    i.src = src;
    imgCache[src] = i;
  }
  return imgCache[src];
}
[...KATANA_OPTIONS, ...ARMOR_OPTIONS, ...BG_OPTIONS].forEach(
  (o) => o.src && loadImg(o.src),
);

// Pre-process AR overlay images: remove black background by setting
// pixel alpha = luminance. This makes them work on ANY background color
// (screen blend only works on dark backgrounds, not bright rooms).
const processedCache: Record<string, OffscreenCanvas> = {};
function getProcessed(img: HTMLImageElement): OffscreenCanvas | null {
  if (!img.complete || !img.naturalWidth) return null;
  if (processedCache[img.src]) return processedCache[img.src];
  const off = new OffscreenCanvas(img.naturalWidth, img.naturalHeight);
  const pCtx = off.getContext('2d')!;
  pCtx.drawImage(img, 0, 0);
  const d = pCtx.getImageData(0, 0, img.naturalWidth, img.naturalHeight);
  for (let i = 0; i < d.data.length; i += 4) {
    const r = d.data[i],
      g = d.data[i + 1],
      b = d.data[i + 2];
    // Pure black background removal:
    // If the pixel is very dark, make it transparent.
    // Otherwise, keep it fully opaque (255) so the asset isn't dim.
    const maxVal = Math.max(r, g, b);
    if (maxVal < 10) {
      d.data[i + 3] = 0;
    } else {
      // Soften the very dark edge pixels slightly for anti-aliasing
      d.data[i + 3] = Math.min(255, maxVal * 12);
    }
  }
  pCtx.putImageData(d, 0, 0);
  processedCache[img.src] = off;
  return off;
}

// ─── HELPERS ──────────────────────────────────────────────────────────────
const d2 = (a: NormalizedLandmark, b: NormalizedLandmark) =>
  Math.hypot(a.x - b.x, a.y - b.y);

// ─── CANVAS DRAW PIPELINE ─────────────────────────────────────────────────
function drawFrame(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  segMask: Uint8ClampedArray | null,
  bgId: BgId,
) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d')!;

  const bgImg = BG_OPTIONS.find((o) => o.id === bgId)?.src
    ? loadImg(BG_OPTIONS.find((o) => o.id === bgId)!.src!)
    : null;
  const armorImg = ARMOR_OPTIONS.find((o) => o.id === armorId)?.src
    ? loadImg(ARMOR_OPTIONS.find((o) => o.id === armorId)!.src!)
    : null;
  const katanaOpt = KATANA_OPTIONS.find((o) => o.id === katanaId)!;
  const katanaImg = katanaOpt.src ? loadImg(katanaOpt.src) : null;

  // KEY FIX: Draw RAW (non-mirrored) video to offscreen.
  // The segmentation mask from MediaPipe is also in raw video space,
  // so mask + video pixel indices always correspond to the same point.
  const rawOff = new OffscreenCanvas(W, H);
  const rawCtx = rawOff.getContext('2d')!;
  rawCtx.drawImage(video, 0, 0, W, H);

  if (bgImg && bgImg.complete && bgImg.naturalWidth > 0 && segMask) {
    // 1a) Background fills the canvas (no orientation needed)
    ctx.drawImage(bgImg, 0, 0, W, H);

    // 1b) Apply mask to the RAW frame — same coordinate space, no mismatch
    const personFrame = rawCtx.getImageData(0, 0, W, H);
    for (let i = 0; i < segMask.length; i++) {
      personFrame.data[i * 4 + 3] = segMask[i];
    }
    const maskedOff = new OffscreenCanvas(W, H);
    maskedOff.getContext('2d')!.putImageData(personFrame, 0, 0);

    // 1c) Draw masked person MIRRORED onto the main canvas
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(maskedOff, -W, 0, W, H);
    ctx.restore();
  } else {
    // No BG swap — mirror the raw video directly
    ctx.save();
    ctx.scale(-1, 1);
    ctx.drawImage(video, -W, 0, W, H);
    ctx.restore();
  }

  // ── 2. Samurai Armor ─────────────────────────────────────────────────
  }
}
// ─── SIDEBAR PICKER ITEM ──────────────────────────────────────────────────
interface PickerItemProps {
  active: boolean;
  label: string;
  emoji: string;
  imgSrc?: string | null;
  accentColor?: string;
  onClick: () => void;
}
function PickerItem({
  active,
  label,
  emoji,
  imgSrc,
  accentColor = '#00f5ff',
  onClick,
}: PickerItemProps) {
  return (
    <div
      className={`picker-item${active ? ' active' : ''}`}
      style={{ '--accent': accentColor } as React.CSSProperties}
      onClick={onClick}
    >
      {imgSrc ? (
        <img src={imgSrc} alt={label} className="picker-thumb" />
      ) : (
        <div className="picker-thumb picker-none">{emoji}</div>
      )}
      <span className="picker-label">{label}</span>
    </div>
  );
}

// ─── APP ──────────────────────────────────────────────────────────────────
export default function App() {
  const {
    videoRef,
    handLandmarker,
    poseLandmarker,
    segmenter,
    isLoaded,
    loadingStatus,
  } = useMediaPipe();

  const [bgId, setBgId] = useState<BgId>('dojo');
  const [armorId, setArmorId] = useState<ArmorId>('none');
  const [katanaId, setKatanaId] = useState<KatanaId>('none');
  const [flash, setFlash] = useState<'red' | 'cyan' | null>(null);

  // Refs for the RAF loop (avoid closure staleness)
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bgIdRef = useRef<BgId>('dojo');
  const armorIdRef = useRef<ArmorId>('none');
  const katanaIdRef = useRef<KatanaId>('none');
  const lastSnapTime = useRef(0);
  const lastDrawTime = useRef(0);
  const rafId = useRef(0);
  
  // Ref to hold high-frequency landmark data without triggering React re-renders
  const landmarksRef = useRef<{ hands: NormalizedLandmark[][] | null; poses: NormalizedLandmark[][] | null }>({
    hands: null,
    poses: null
  });

  useEffect(() => {
    bgIdRef.current = bgId;
  }, [bgId]);
  useEffect(() => {
    armorIdRef.current = armorId;
  }, [armorId]);
  useEffect(() => {
    katanaIdRef.current = katanaId;
  }, [katanaId]);

  const triggerFlash = useCallback((c: 'red' | 'cyan') => {
    setFlash(c);
    setTimeout(() => setFlash(null), 550);
  }, []);

  // Snap gesture cycles through armors; draw gesture cycles through katanas
  const cycleArmor = useCallback(() => {
    setArmorId((prev) => {
      const ids = ARMOR_OPTIONS.map((o) => o.id);
      const next = ids[(ids.indexOf(prev) + 1) % ids.length];
      armorIdRef.current = next;
      return next;
    });
  }, []);

  const cycleKatana = useCallback(() => {
    setKatanaId((prev) => {
      const ids = KATANA_OPTIONS.map((o) => o.id);
      const next = ids[(ids.indexOf(prev) + 1) % ids.length];
      katanaIdRef.current = next;
      return next;
    });
  }, []);

  // Main RAF loop
  useEffect(() => {
    if (!isLoaded || !handLandmarker || !poseLandmarker || !segmenter) return;
    let lastVideoTime = -1;

    const loop = () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) {
        rafId.current = requestAnimationFrame(loop);
        return;
      }

      if (
        canvas.width !== video.videoWidth ||
        canvas.height !== video.videoHeight
      ) {
        canvas.width = video.videoWidth || 1280;
        canvas.height = video.videoHeight || 720;
      }
      if (video.currentTime === lastVideoTime) {
        rafId.current = requestAnimationFrame(loop);
        return;
      }
      lastVideoTime = video.currentTime;

      const ts = performance.now();

      // Segmentation mask
      let segMask: Uint8ClampedArray | null = null;
      if (bgIdRef.current !== 'none') {
        const segResult = segmenter.segmentForVideo(video, ts);
        const catMask = segResult.categoryMask;
        if (catMask) {
          const raw = catMask.getAsUint8Array();
          const inv = new Uint8ClampedArray(raw.length);
          for (let i = 0; i < raw.length; i++) inv[i] = raw[i] === 0 ? 220 : 0;
          segMask = inv;
          catMask.close();
        }
      }

      const hands = handLandmarker.detectForVideo(video, ts).landmarks ?? [];
      const poses = poseLandmarker.detectForVideo(video, ts).landmarks ?? [];
      
      // Update landmarks reference for 3D components to read instantly
      landmarksRef.current = {
        hands: hands.length > 0 ? hands : null,
        poses: poses.length > 0 ? poses : null
      };

      const now = Date.now();
      if (
        hands.length > 0 &&
        detectSnap(hands) &&
        now - lastSnapTime.current > 1000
      ) {
        lastSnapTime.current = now;
        cycleArmor();
        playSnapSound();
        triggerFlash('red');
      }
      if (
        poses.length > 0 &&
        detectKatanaDraw(poses) &&
        now - lastDrawTime.current > 1500
      ) {
        lastDrawTime.current = now;
        cycleKatana();
        playSwordDrawSound();
        triggerFlash('cyan');
      }

      drawFrame(
        canvas,
        video,
        segMask,
        bgIdRef.current,
      );

      rafId.current = requestAnimationFrame(loop);
    };

    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, [
    isLoaded,
    handLandmarker,
    poseLandmarker,
    segmenter,
    triggerFlash,
    cycleArmor,
    cycleKatana,
    videoRef,
  ]);

  return (
    <div className="app-shell">
      {!isLoaded && (
        <div className="loading-screen">
          <div className="loading-kanji">刀</div>
          <div className="loading-ring" />
          <p className="loading-status">{loadingStatus}</p>
        </div>
      )}

      {/* ── Left Sidebar ── */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo">刀 KATANA AR</div>
          <div className="sidebar-subtitle">Samurai Experience</div>
        </div>

        {/* BACKGROUND */}
        <div className="sidebar-section">
          <div className="section-label">🌄 Background</div>
          <div className="picker-grid">
            {BG_OPTIONS.map((opt) => (
              <PickerItem
                key={opt.id}
                active={bgId === opt.id}
                label={opt.label}
                emoji="🌄"
                imgSrc={opt.src}
                accentColor="#ffd700"
                onClick={() => setBgId(opt.id)}
              />
            ))}
          </div>
        </div>

        {/* ARMOR */}
        <div className="sidebar-section">
          <div className="section-label">🥷 Samurai Dress</div>
          <div className="picker-grid">
            {ARMOR_OPTIONS.map((opt) => (
              <PickerItem
                key={opt.id}
                active={armorId === opt.id}
                label={opt.label}
                emoji={opt.emoji}
                imgSrc={opt.src}
                accentColor="#e63946"
                onClick={() => {
                  setArmorId(opt.id);
                  armorIdRef.current = opt.id;
                }}
              />
            ))}
          </div>
          <div className="tip-text">✌️ Snap fingers to cycle</div>
        </div>

        {/* KATANA */}
        <div className="sidebar-section">
          <div className="section-label">🗡️ Katana</div>
          <div className="picker-grid">
            {KATANA_OPTIONS.map((opt) => (
              <PickerItem
                key={opt.id}
                active={katanaId === opt.id}
                label={opt.label}
                emoji={opt.emoji}
                imgSrc={opt.src}
                accentColor={opt.glow}
                onClick={() => {
                  setKatanaId(opt.id);
                  katanaIdRef.current = opt.id;
                }}
              />
            ))}
          </div>
          <div className="tip-text">⚔️ Draw gesture to cycle</div>
        </div>

        <div style={{ flex: 1 }} />
        <div className="sidebar-footer">
          {isLoaded ? '🟢 AI Models Active' : `⏳ ${loadingStatus}`}
        </div>
      </aside>

      {/* ── Stage ── */}
      <div className="video-stage">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="webcam-video"
        />
        {/* 2D Canvas for Segmentation Background Swap */}
        <canvas ref={canvasRef} className="ar-canvas" />

        {/* 3D WebGL Canvas for Samurai Armor and Katana */}
        {isLoaded && (
          <React.Suspense fallback={null}>
            <ThreeScene 
              landmarksRef={landmarksRef}
              isSamuraiMode={armorId !== 'none'}
              isKatanaDrawn={katanaId !== 'none'}
              armorId={armorId}
              katanaId={katanaId}
            />
          </React.Suspense>
        )}

        {flash && <div className={`flash-vfx ${flash}`} key={Date.now()} />}

        {isLoaded && (
          <div className="hud">
            <div className="hud-status">
              <div
                className={`status-pill${armorId !== 'none' ? ' on-samurai' : ''}`}
              >
                <div className="dot" />
                {armorId === 'none'
                  ? 'No Armor'
                  : ARMOR_OPTIONS.find((o) => o.id === armorId)?.label}
              </div>
              <div
                className={`status-pill${katanaId !== 'none' ? ' on-katana' : ''}`}
              >
                <div className="dot" />
                {katanaId === 'none'
                  ? 'No Katana'
                  : KATANA_OPTIONS.find((o) => o.id === katanaId)?.label}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
