import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { NormalizedLandmark } from '@mediapipe/tasks-vision';
import * as THREE from 'three';

interface Armor3DProps {
  landmarksRef: React.MutableRefObject<{ hands: NormalizedLandmark[][] | null; poses: NormalizedLandmark[][] | null }>;
  isActive: boolean;
  armorId: string;
}

export const Armor3D: React.FC<Armor3DProps> = ({ landmarksRef, isActive, armorId }) => {
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  const color = armorId === 'white' ? '#f0f0f0' : armorId === 'black' ? '#1a1a1a' : '#882222';

  useFrame(() => {
    if (!groupRef.current) return;
    const poses = landmarksRef.current.poses;

    if (isActive && poses && poses.length > 0) {
      const pose = poses[0];
      const ls = pose[11]; // left shoulder
      const rs = pose[12]; // right shoulder
      const lh = pose[23]; // left hip
      const rh = pose[24]; // right hip

      if (ls && rs && lh && rh) {
        groupRef.current.visible = true;

        const getVec3 = (lm: NormalizedLandmark) => new THREE.Vector3(
          (0.5 - lm.x) * viewport.width,
          (0.5 - lm.y) * viewport.height,
          -lm.z * viewport.width
        );

        const vLS = getVec3(ls);
        const vRS = getVec3(rs);
        const vLH = getVec3(lh);
        const vRH = getVec3(rh);

        // Center of the chest
        const topMid = new THREE.Vector3().addVectors(vLS, vRS).multiplyScalar(0.5);
        const botMid = new THREE.Vector3().addVectors(vLH, vRH).multiplyScalar(0.5);
        const chestCenter = new THREE.Vector3().addVectors(topMid, botMid).multiplyScalar(0.5);
        
        groupRef.current.position.copy(chestCenter);

        // Scale based on shoulder width and torso height
        const width = vLS.distanceTo(vRS) * 1.6; // Wider than shoulders
        const height = topMid.distanceTo(botMid) * 1.2; // Torso length
        const depth = width * 0.6; // Human proportion approx

        groupRef.current.scale.set(width, height, depth);

        // Basic rotation: look at normal of the chest plane
        // Vector from right shoulder to left shoulder (mirrored space, so x is flipped)
        const xDir = new THREE.Vector3().subVectors(vLS, vRS).normalize();
        // Vector from bottom mid to top mid
        const yDir = new THREE.Vector3().subVectors(topMid, botMid).normalize();
        
        // Z direction is cross product (pointing OUT of the chest towards camera)
        const zDir = new THREE.Vector3().crossVectors(xDir, yDir).normalize();
        
        // Create rotation matrix
        const matrix = new THREE.Matrix4().makeBasis(xDir, yDir, zDir);
        const quaternion = new THREE.Quaternion().setFromRotationMatrix(matrix);
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
        Placeholder 3D Samurai Armor. 
        Replace with a real GLB file!
      */}
      
      {/* Chest Plate */}
      <mesh position={[0, 0, 0]}>
        <boxGeometry args={[1, 1, 1]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
      </mesh>
      
      {/* Shoulder Pads */}
      <mesh position={[-0.6, 0.4, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
      </mesh>
      <mesh position={[0.6, 0.4, 0]}>
        <sphereGeometry args={[0.3, 16, 16]} />
        <meshStandardMaterial color={color} roughness={0.4} metalness={0.6} />
      </mesh>
    </group>
  );
};
