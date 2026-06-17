import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { NormalizedLandmark } from '@mediapipe/tasks-vision';
import * as THREE from 'three';

interface Katana3DProps {
  landmarksRef: React.MutableRefObject<{ hands: NormalizedLandmark[][] | null; poses: NormalizedLandmark[][] | null }>;
  isActive: boolean;
  katanaId: string;
}

export const Katana3D: React.FC<Katana3DProps> = ({ landmarksRef, isActive, katanaId }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  // Load the downloaded models
  const normalKatana = useGLTF('/models/Katana Japanese Sword.glb');
  const dragonKatana = useGLTF('/models/Dragon Katana Oni Koroshi.glb');
  
  // Select model based on katanaId
  const currentGLTF = katanaId === 'red' ? dragonKatana : normalKatana;

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
        const getVec3 = (lm: NormalizedLandmark) => new THREE.Vector3(
          (0.5 - lm.x) * viewport.width,
          (0.5 - lm.y) * viewport.height,
          -lm.z * viewport.width // scale Z roughly the same as X for proportion
        );

        const vIndex = getVec3(indexBase);
        const vPinky = getVec3(pinkyBase);

        // Position at the midpoint of the knuckles (the fist)
        const midpoint = new THREE.Vector3().addVectors(vIndex, vPinky).multiplyScalar(0.5);
        groupRef.current.position.copy(midpoint);

        // Calculate direction from pinky to index (the blade direction)
        const direction = new THREE.Vector3().subVectors(vIndex, vPinky).normalize();
        
        // Align the group's Y-axis to point in the blade direction
        const up = new THREE.Vector3(0, 1, 0);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(up, direction);
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
        scale={[2, 2, 2]} 
        position={[0, 0, 0]} 
      />
    </group>
  );
};

// Preload models for faster startup
useGLTF.preload('/models/Katana Japanese Sword.glb');
useGLTF.preload('/models/Dragon Katana Oni Koroshi.glb');
