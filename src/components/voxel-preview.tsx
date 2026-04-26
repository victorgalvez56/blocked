'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useMemo } from 'react';
import { PALETTE } from '@/lib/palette';
import type { VoxelGridSnapshot } from '@/types/voxel.types';

const colorByIdHex: Record<string, string> = Object.fromEntries(
  PALETTE.map((c) => [c.id, `#${c.hex}`]),
);

export function VoxelPreview({ plan }: { plan: VoxelGridSnapshot }) {
  const center = useMemo(
    () => ({
      x: plan.baseplate.width / 2 - 0.5,
      y: 0,
      z: plan.baseplate.depth / 2 - 0.5,
    }),
    [plan.baseplate.width, plan.baseplate.depth],
  );

  const cameraDistance = Math.max(plan.baseplate.width, plan.baseplate.depth, plan.size.y) * 1.6;

  return (
    <Canvas shadows dpr={[1, 2]} className="rounded-lg">
      <color attach="background" args={['#0e0f12']} />
      <PerspectiveCamera
        makeDefault
        position={[center.x + cameraDistance, cameraDistance * 0.8, center.z + cameraDistance]}
        fov={40}
      />
      <OrbitControls target={[center.x, plan.size.y / 2, center.z]} makeDefault />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[center.x + 20, 30, center.z + 20]}
        intensity={1.1}
        castShadow
      />
      <hemisphereLight args={['#bbd8ff', '#3a2d20', 0.4]} />

      <mesh
        position={[center.x, -0.6, center.z]}
        receiveShadow
      >
        <boxGeometry args={[plan.baseplate.width, 0.2, plan.baseplate.depth]} />
        <meshStandardMaterial color="#3a3d44" roughness={0.85} />
      </mesh>

      {plan.voxels.map((v, i) => (
        <mesh
          key={`${v.coord[0]}-${v.coord[1]}-${v.coord[2]}-${i}`}
          position={[v.coord[0], v.coord[1] + 0.5, v.coord[2]]}
          castShadow
          receiveShadow
        >
          <boxGeometry args={[0.96, 0.96, 0.96]} />
          <meshStandardMaterial
            color={colorByIdHex[v.colorId] ?? '#888'}
            roughness={0.5}
            metalness={0.05}
          />
        </mesh>
      ))}
    </Canvas>
  );
}
