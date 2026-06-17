import React from 'react';
import { Canvas } from '@react-three/fiber';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { Katana3D } from './Katana3D';
import { Armor3D } from './Armor3D';

interface ThreeSceneProps {
  landmarksRef: React.MutableRefObject<{
    hands: NormalizedLandmark[][] | null;
    poses: NormalizedLandmark[][] | null;
  }>;
  isSamuraiMode: boolean;
  isKatanaDrawn: boolean;
  armorId: string;
  katanaId: string;
}

export const ThreeScene: React.FC<ThreeSceneProps> = ({
  landmarksRef,
  isSamuraiMode,
  isKatanaDrawn,
  armorId,
  katanaId,
}) => {
  return (
    <Canvas
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        zIndex: 2,
        pointerEvents: 'none',
      }}
      orthographic
      camera={{ position: [0, 0, 100], zoom: 1, near: 0.1, far: 1000 }}
    >
      <ambientLight intensity={1.5} />
      <directionalLight position={[5, 5, 5]} intensity={2} />
      <directionalLight position={[-5, 5, 5]} intensity={1} color="#aaa" />

      <Katana3D
        landmarksRef={landmarksRef}
        isActive={isSamuraiMode && isKatanaDrawn}
        katanaId={katanaId}
      />
      <Armor3D
        landmarksRef={landmarksRef}
        isActive={isSamuraiMode}
        armorId={armorId}
      />
    </Canvas>
  );
};
