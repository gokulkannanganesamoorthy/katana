import { useEffect, useRef, useState } from 'react';
import { FilesetResolver, HandLandmarker, PoseLandmarker } from '@mediapipe/tasks-vision';

export interface MediaPipeState {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  handLandmarker: HandLandmarker | null;
  poseLandmarker: PoseLandmarker | null;
  isLoaded: boolean;
  loadingStatus: string;
}

export const useMediaPipe = (): MediaPipeState => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [handLandmarker, setHandLandmarker] = useState<HandLandmarker | null>(null);
  const [poseLandmarker, setPoseLandmarker] = useState<PoseLandmarker | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Initializing...');

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      try {
        setLoadingStatus('Loading AI Vision runtime...');
        const vision = await FilesetResolver.forVisionTasks(
          "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.12/wasm"
        );

        setLoadingStatus('Loading hand tracking model...');
        const hl = await HandLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          numHands: 2,
          minHandDetectionConfidence: 0.5,
          minHandPresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        setLoadingStatus('Loading body pose model...');
        const pl = await PoseLandmarker.createFromOptions(vision, {
          baseOptions: {
            modelAssetPath: `https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task`,
            delegate: "GPU"
          },
          runningMode: "VIDEO",
          minPoseDetectionConfidence: 0.5,
          minPosePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        if (cancelled) return;

        setLoadingStatus('Starting webcam...');
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false,
        });

        if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }

        setHandLandmarker(hl);
        setPoseLandmarker(pl);
        setIsLoaded(true);
        setLoadingStatus('Ready!');
      } catch (e) {
        console.error("MediaPipe init error:", e);
        setLoadingStatus(`Error: ${e instanceof Error ? e.message : String(e)}`);
      }
    };

    init();

    return () => {
      cancelled = true;
    };
  }, []);

  return { videoRef, handLandmarker, poseLandmarker, isLoaded, loadingStatus };
};
