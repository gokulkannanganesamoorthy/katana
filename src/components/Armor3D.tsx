import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import * as THREE from 'three';

interface Armor3DProps {
  landmarksRef: React.MutableRefObject<{
    hands: NormalizedLandmark[][] | null;
    poses: NormalizedLandmark[][] | null;
  }>;
  isActive: boolean;
  armorId: string;
}

export const Armor3D: React.FC<Armor3DProps> = ({
  landmarksRef,
  isActive,
  armorId,
}) => {
  const groupRef = useRef<THREE.Group>(null);
  const { viewport } = useThree();

  const armorWhite = useGLTF('/models/Samurai (1).glb');
  const armorBlack = useGLTF('/models/Samurai (2).glb');
  const armorCyber = useGLTF('/models/Cyber Samurai.glb');
  
  // Model Configuration Dictionary
  // Armor is usually centered at the feet. Since we anchor to the shoulders, 
  // we must move the model DOWN along the Y axis by its shoulder height.
  const configs: Record<string, { scale: [number, number, number], posOffset: [number, number, number], rotOffset: [number, number, number], gltf: any }> = {
    'white': { scale: [1.2, 1.2, 1.2], posOffset: [0, -180, 0], rotOffset: [0, Math.PI, 0], gltf: armorWhite },
    'black': { scale: [1.2, 1.2, 1.2], posOffset: [0, -180, 0], rotOffset: [0, Math.PI, 0], gltf: armorBlack },
    'cyber': { scale: [1.2, 1.2, 1.2], posOffset: [0, -180, 0], rotOffset: [0, Math.PI, 0], gltf: armorCyber },
  };

  const config = configs[armorId] || configs['white'];
  const currentGLTF = config.gltf;

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

        const getVec3 = (lm: NormalizedLandmark) =>
          new THREE.Vector3(
            (0.5 - lm.x) * viewport.width,
            (0.5 - lm.y) * viewport.height,
            -lm.z * viewport.width,
          );

        const vLS = getVec3(ls);
        const vRS = getVec3(rs);

        // Center between shoulders (ignore hips as they are often off-camera)
        const topMid = new THREE.Vector3().addVectors(vLS, vRS).multiplyScalar(0.5);
        
        groupRef.current.position.copy(topMid);

        // Basic rotation: look at normal of the chest plane
        // Vector from right shoulder to left shoulder (mirrored space, so x is flipped)
        const xDir = new THREE.Vector3().subVectors(vLS, vRS).normalize();
        // Assume straight up for Y dir since hips are unreliable
        const yDir = new THREE.Vector3(0, 1, 0);
        
        // Z direction is cross product (pointing OUT of the chest towards camera)
        const zDir = new THREE.Vector3().crossVectors(xDir, yDir).normalize();
        
        // Recompute true Y to maintain orthogonality
        const trueYDir = new THREE.Vector3().crossVectors(zDir, xDir).normalize();
        
        // Create rotation matrix
        const matrix = new THREE.Matrix4().makeBasis(xDir, trueYDir, zDir);
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
        The model might need default scaling depending on its actual dimensions.
        We adjust scale and rotation to match the chest tracking.
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

useGLTF.preload('/models/Samurai (1).glb');
useGLTF.preload('/models/Samurai (2).glb');
useGLTF.preload('/models/Cyber Samurai.glb');
