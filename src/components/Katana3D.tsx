import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
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

  // Color mapping based on katanaId
  const color = katanaId === 'red' ? '#ff3333' : katanaId === 'gold' ? '#ffcc00' : '#44aaff';

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
        This is a placeholder 3D Katana made of basic shapes.
        Users can replace this <group> contents with <primitive object={gltf.scene} /> 
        once they load a real .glb file.
      */}
      
      {/* Blade */}
      <mesh position={[0, 4, 0]}> {/* Shifted up so origin is at the handle */}
        <cylinderGeometry args={[0.05, 0.1, 8, 8]} />
        <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.5} roughness={0.2} metalness={0.8} />
      </mesh>

      {/* Handle */}
      <mesh position={[0, -1, 0]}>
        <cylinderGeometry args={[0.15, 0.15, 2, 8]} />
        <meshStandardMaterial color="#111" roughness={0.9} />
      </mesh>
      
      {/* Guard (Tsuba) */}
      <mesh position={[0, 0, 0]}>
        <cylinderGeometry args={[0.4, 0.4, 0.1, 16]} />
        <meshStandardMaterial color="#333" metalness={0.9} roughness={0.4} />
      </mesh>
    </group>
  );
};
