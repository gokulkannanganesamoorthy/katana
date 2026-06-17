import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import * as THREE from 'three';

interface Katana3DProps {
  landmarksRef: React.MutableRefObject<{
    hands: NormalizedLandmark[][] | null;
    poses: NormalizedLandmark[][] | null;
  }>;
  isActive: boolean;
  katanaId: string;
}

export const Katana3D: React.FC<Katana3DProps> = ({
  landmarksRef,
  isActive,
  katanaId,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  // Load the downloaded models
  const normalKatana = useGLTF('/models/Katana Japanese Sword.glb');
  const dragonKatana = useGLTF('/models/Dragon Katana Oni Koroshi.glb');
  
  // Model Configuration Dictionary
  // scale of 0.5 makes it 500 pixels long (assuming it's a 100 unit / 1 meter model).
  // Models might need a rotOffset (e.g. Math.PI / 2) to align the blade with the hand's Y axis.
  const configs: Record<string, { scale: [number, number, number], posOffset: [number, number, number], rotOffset: [number, number, number], gltf: any }> = {
    'normal': { scale: [1, 1, 1], posOffset: [0, 0, 0], rotOffset: [Math.PI / 2, 0, 0], gltf: normalKatana },
    'red': { scale: [0.5, 0.5, 0.5], posOffset: [0, 0, 0], rotOffset: [Math.PI / 2, 0, 0], gltf: dragonKatana },
  };

  const config = configs[katanaId] || configs['normal'];
  const currentGLTF = config.gltf;

  useFrame(() => {
    if (!groupRef.current) return;
    const hands = landmarksRef.current.hands;

    if (isActive && hands && hands.length > 0) {
      const hand = hands[0];
      const indexBase = hand[5];
      const pinkyBase = hand[17];

      if (indexBase && pinkyBase) {
        groupRef.current.visible = true;

        // Convert normalized coordinates to 3D world space
        // Note: x is mirrored: (0.5 - x) instead of (x - 0.5)
        const getVec3 = (lm: NormalizedLandmark) =>
          new THREE.Vector3(
            (0.5 - lm.x) * viewport.width,
            (0.5 - lm.y) * viewport.height,
            -lm.z * viewport.width, // scale Z roughly the same as X for proportion
          );

        const vIndex = getVec3(indexBase);
        const vPinky = getVec3(pinkyBase);

        // Position at the midpoint of the knuckles (the fist)
        const midpoint = new THREE.Vector3()
          .addVectors(vIndex, vPinky)
          .multiplyScalar(0.5);
        groupRef.current.position.copy(midpoint);

        // Calculate direction from pinky to index (the blade direction)
        const direction = new THREE.Vector3()
          .subVectors(vIndex, vPinky)
          .normalize();

        // Align the group's Y-axis to point in the blade direction
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(
          up,
          direction,
        );
        groupRef.current.quaternion.copy(quaternion);
      } else {
        groupRef.current.visible = false;
      }
    } else {
      groupRef.current.visible = false;
    }
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* 
        We use a scale modifier because models are often huge or tiny.
        We might need to adjust scale and rotation manually if the downloaded
        model doesn't have the blade pointing exactly along the Y-axis.
      */}
      <primitive
        object={currentGLTF.scene.clone()}
        scale={config.scale}
        position={config.posOffset}
        rotation={config.rotOffset}
      />
    </group>
  );
};

// Preload models for faster startup
useGLTF.preload('/models/Katana Japanese Sword.glb');
useGLTF.preload('/models/Dragon Katana Oni Koroshi.glb');
