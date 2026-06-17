import React, { useEffect, useRef, useState, useCallback } from 'react';
import { useMediaPipe } from './hooks/useMediaPipe';
import { detectSnap, detectKatanaDraw } from './utils/gestureDetection';
import { playSnapSound, playSwordDrawSound } from './utils/audio';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import './index.css';

// ─── ASSET CATALOGUE ──────────────────────────────────────────────────────
const KATANA_OPTIONS = [
  { id: 'none',  label: 'None',    emoji: '✕',  src: null,              glow: '#00f5ff' },
  { id: 'cyan',  label: 'Phantom', emoji: '🗡️', src: '/katana.png',     glow: '#00f5ff' },
  { id: 'red',   label: 'Inferno', emoji: '🔥', src: '/katana_red.png', glow: '#ff3300' },
  { id: 'gold',  label: 'Divine',  emoji: '⚡', src: '/katana_gold.png',glow: '#ffd700' },
] as const;
type KatanaId = typeof KATANA_OPTIONS[number]['id'];

const ARMOR_OPTIONS = [
  { id: 'none',  label: 'None',    emoji: '✕',  src: null },
  { id: 'red',   label: 'Warlord', emoji: '🥷', src: '/samurai.png' },
  { id: 'white', label: 'Noble',   emoji: '🤍', src: '/armor_white.png' },
  { id: 'black', label: 'Oni',     emoji: '👹', src: '/armor_black.png' },
] as const;
type ArmorId = typeof ARMOR_OPTIONS[number]['id'];

const BG_OPTIONS = [
  { id: 'none',        label: 'None',       src: null },
  { id: 'dojo',        label: 'Dojo',       src: '/bg_dojo.png' },
  { id: 'mountain',    label: 'Mountain',   src: '/bg_mountain.png' },
  { id: 'battlefield', label: 'Battlefield',src: '/bg_battlefield.png' },
] as const;
type BgId = typeof BG_OPTIONS[number]['id'];

// Pre-load all images at module level
const imgCache: Record<string, HTMLImageElement> = {};
function loadImg(src: string): HTMLImageElement {
  if (!imgCache[src]) { const i = new Image(); i.src = src; imgCache[src] = i; }
  return imgCache[src];
}
[...KATANA_OPTIONS, ...ARMOR_OPTIONS, ...BG_OPTIONS].forEach(o => o.src && loadImg(o.src));

// ─── HELPERS ──────────────────────────────────────────────────────────────
const d2 = (a: NormalizedLandmark, b: NormalizedLandmark) => Math.hypot(a.x - b.x, a.y - b.y);

// ─── CANVAS DRAW PIPELINE ─────────────────────────────────────────────────
function drawFrame(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  segMask: Uint8ClampedArray | null,
  hands: NormalizedLandmark[][] | null,
  poses: NormalizedLandmark[][] | null,
  bgId: BgId,
  armorId: ArmorId,
  katanaId: KatanaId,
) {
  const W = canvas.width;
  const H = canvas.height;
  const ctx = canvas.getContext('2d')!;

  const bgImg     = BG_OPTIONS.find(o => o.id === bgId)?.src     ? loadImg(BG_OPTIONS.find(o => o.id === bgId)!.src!) : null;
  const armorImg  = ARMOR_OPTIONS.find(o => o.id === armorId)?.src  ? loadImg(ARMOR_OPTIONS.find(o => o.id === armorId)!.src!) : null;
  const katanaOpt = KATANA_OPTIONS.find(o => o.id === katanaId)!;
  const katanaImg = katanaOpt.src ? loadImg(katanaOpt.src) : null;

  // ── 1. Draw mirrored video to offscreen, then composite ──────────────
  const offscreen = new OffscreenCanvas(W, H);
  const offCtx    = offscreen.getContext('2d')!;
  offCtx.save(); offCtx.scale(-1, 1); offCtx.drawImage(video, -W, 0, W, H); offCtx.restore();

  if (bgImg && bgImg.complete && bgImg.naturalWidth > 0 && segMask) {
    // Draw background first
    ctx.drawImage(bgImg, 0, 0, W, H);

    // Build masked person layer
    const personFrame = offCtx.getImageData(0, 0, W, H);
    for (let i = 0; i < segMask.length; i++) {
      personFrame.data[i * 4 + 3] = segMask[i]; // apply person mask as alpha
    }
    const masked = new OffscreenCanvas(W, H);
    masked.getContext('2d')!.putImageData(personFrame, 0, 0);
    ctx.drawImage(masked, 0, 0);
  } else {
    // No BG swap — just show mirrored webcam
    ctx.drawImage(offscreen, 0, 0);
  }

  // ── 2. Samurai Armor ─────────────────────────────────────────────────
  if (armorImg && armorImg.complete && armorImg.naturalWidth > 0 && poses && poses.length > 0) {
    const pose = poses[0];
    const ls = pose[11]; const rs = pose[12];
    const lh = pose[23]; const rh = pose[24];
    if (ls && rs) {
      const cx    = (1 - (ls.x + rs.x) / 2) * W;
      const cy    = ((ls.y + rs.y) / 2) * H;
      const hipCY = (lh && rh) ? ((lh.y + rh.y) / 2) * H : cy + H * 0.32;
      const bodyH = Math.max(hipCY - cy, 90);
      const drawW = Math.max(d2(ls, rs) * W * 2.8, 180);
      const drawH = bodyH * 2.2;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.9;
      ctx.drawImage(armorImg, cx - drawW / 2, cy - drawH * 0.08, drawW, drawH);
      ctx.restore();
    }
  }

  // ── 3. Katana ────────────────────────────────────────────────────────
  if (katanaImg && katanaImg.complete && katanaImg.naturalWidth > 0 && hands && hands.length > 0) {
    const hand = hands[0];
    const wrist     = hand[0];
    const indexBase = hand[5];
    if (wrist && indexBase) {
      const wx  = (1 - wrist.x)     * W;
      const wy  = wrist.y            * H;
      const ibx = (1 - indexBase.x) * W;
      const iby = indexBase.y        * H;
      const angle = Math.atan2(iby - wy, ibx - wx) - Math.PI / 2;

      const kH = Math.min(H * 0.52, 380);
      const kW = kH * 0.22;

      ctx.save();
      ctx.translate(wx, wy);
      ctx.rotate(angle);
      ctx.shadowColor = katanaOpt.glow;
      ctx.shadowBlur  = 40;
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.95;
      ctx.drawImage(katanaImg, -kW / 2, -kH + kH * 0.18, kW, kH);
      ctx.globalAlpha = 0.2;
      ctx.shadowBlur  = 70;
      ctx.drawImage(katanaImg, -kW, -kH + kH * 0.16, kW * 2, kH * 1.04);
      ctx.restore();
    }
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
function PickerItem({ active, label, emoji, imgSrc, accentColor = '#00f5ff', onClick }: PickerItemProps) {
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
  const { videoRef, handLandmarker, poseLandmarker, segmenter, isLoaded, loadingStatus } = useMediaPipe();

  const [bgId,     setBgId]     = useState<BgId>('dojo');
  const [armorId,  setArmorId]  = useState<ArmorId>('none');
  const [katanaId, setKatanaId] = useState<KatanaId>('none');
  const [flash,    setFlash]    = useState<'red' | 'cyan' | null>(null);

  // Refs for the RAF loop (avoid closure staleness)
  const canvasRef    = useRef<HTMLCanvasElement | null>(null);
  const bgIdRef      = useRef<BgId>('dojo');
  const armorIdRef   = useRef<ArmorId>('none');
  const katanaIdRef  = useRef<KatanaId>('none');
  const lastSnapTime = useRef(0);
  const lastDrawTime = useRef(0);
  const rafId        = useRef(0);

  useEffect(() => { bgIdRef.current    = bgId;     }, [bgId]);
  useEffect(() => { armorIdRef.current = armorId;  }, [armorId]);
  useEffect(() => { katanaIdRef.current= katanaId; }, [katanaId]);

  const triggerFlash = useCallback((c: 'red' | 'cyan') => {
    setFlash(c); setTimeout(() => setFlash(null), 550);
  }, []);

  // Snap gesture cycles through armors; draw gesture cycles through katanas
  const cycleArmor = useCallback(() => {
    setArmorId(prev => {
      const ids = ARMOR_OPTIONS.map(o => o.id);
      const next = ids[(ids.indexOf(prev) + 1) % ids.length];
      armorIdRef.current = next; return next;
    });
  }, []);

  const cycleKatana = useCallback(() => {
    setKatanaId(prev => {
      const ids = KATANA_OPTIONS.map(o => o.id);
      const next = ids[(ids.indexOf(prev) + 1) % ids.length];
      katanaIdRef.current = next; return next;
    });
  }, []);

  // Main RAF loop
  useEffect(() => {
    if (!isLoaded || !handLandmarker || !poseLandmarker || !segmenter) return;
    let lastVideoTime = -1;

    const loop = () => {
      const video  = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) { rafId.current = requestAnimationFrame(loop); return; }

      if (canvas.width !== video.videoWidth || canvas.height !== video.videoHeight) {
        canvas.width  = video.videoWidth  || 1280;
        canvas.height = video.videoHeight || 720;
      }
      if (video.currentTime === lastVideoTime) { rafId.current = requestAnimationFrame(loop); return; }
      lastVideoTime = video.currentTime;

      const ts = performance.now();

      // Segmentation mask
      let segMask: Uint8ClampedArray | null = null;
      if (bgIdRef.current !== 'none') {
        const segResult = segmenter.segmentForVideo(video, ts);
        const catMask   = segResult.categoryMask;
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

      const now = Date.now();
      if (hands.length > 0 && detectSnap(hands) && now - lastSnapTime.current > 1000) {
        lastSnapTime.current = now;
        cycleArmor(); playSnapSound(); triggerFlash('red');
      }
      if (poses.length > 0 && detectKatanaDraw(poses) && now - lastDrawTime.current > 1500) {
        lastDrawTime.current = now;
        cycleKatana(); playSwordDrawSound(); triggerFlash('cyan');
      }

      drawFrame(
        canvas, video, segMask,
        hands.length > 0 ? hands : null,
        poses.length > 0 ? poses : null,
        bgIdRef.current, armorIdRef.current, katanaIdRef.current,
      );

      rafId.current = requestAnimationFrame(loop);
    };

    rafId.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId.current);
  }, [isLoaded, handLandmarker, poseLandmarker, segmenter, triggerFlash, cycleArmor, cycleKatana, videoRef]);

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
            {BG_OPTIONS.map(opt => (
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
            {ARMOR_OPTIONS.map(opt => (
              <PickerItem
                key={opt.id}
                active={armorId === opt.id}
                label={opt.label}
                emoji={opt.emoji}
                imgSrc={opt.src}
                accentColor="#e63946"
                onClick={() => { setArmorId(opt.id); armorIdRef.current = opt.id; }}
              />
            ))}
          </div>
          <div className="tip-text">✌️ Snap fingers to cycle</div>
        </div>

        {/* KATANA */}
        <div className="sidebar-section">
          <div className="section-label">🗡️ Katana</div>
          <div className="picker-grid">
            {KATANA_OPTIONS.map(opt => (
              <PickerItem
                key={opt.id}
                active={katanaId === opt.id}
                label={opt.label}
                emoji={opt.emoji}
                imgSrc={opt.src}
                accentColor={opt.glow}
                onClick={() => { setKatanaId(opt.id); katanaIdRef.current = opt.id; }}
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
        <video ref={videoRef} autoPlay playsInline muted className="webcam-video" />
        <canvas ref={canvasRef} className="ar-canvas" />

        {flash && <div className={`flash-vfx ${flash}`} key={Date.now()} />}

        {isLoaded && (
          <div className="hud">
            <div className="hud-status">
              <div className={`status-pill${armorId !== 'none' ? ' on-samurai' : ''}`}>
                <div className="dot" />
                {armorId === 'none' ? 'No Armor' : ARMOR_OPTIONS.find(o => o.id === armorId)?.label}
              </div>
              <div className={`status-pill${katanaId !== 'none' ? ' on-katana' : ''}`}>
                <div className="dot" />
                {katanaId === 'none' ? 'No Katana' : KATANA_OPTIONS.find(o => o.id === katanaId)?.label}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
