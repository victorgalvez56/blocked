'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PALETTE } from '@/lib/palette';
import type { VoxelGridSnapshot, Voxel } from '@/types/voxel.types';

const colorByIdHex: Record<string, string> = Object.fromEntries(
  PALETTE.map((c) => [c.id, `#${c.hex}`]),
);

function VoxelInstancedGroup({ colorId, voxels }: { colorId: string; voxels: Voxel[] }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = voxels.length;
  const color = colorByIdHex[colorId] ?? '#888888';

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const v = voxels[i];
      dummy.position.set(v.coord[0], v.coord[1] + 0.5, v.coord[2]);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [voxels, count]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[0.96, 0.96, 0.96]} />
      <meshStandardMaterial color={color} roughness={0.5} metalness={0.05} />
    </instancedMesh>
  );
}

export function VoxelPreview({ plan }: { plan: VoxelGridSnapshot }) {
  const center = useMemo(
    () => ({
      x: plan.size.x / 2 - 0.5,
      y: plan.size.y / 2,
      z: plan.size.z / 2 - 0.5,
    }),
    [plan.size.x, plan.size.y, plan.size.z],
  );

  const groups = useMemo(() => {
    const m = new Map<string, Voxel[]>();
    for (const v of plan.voxels) {
      const arr = m.get(v.colorId) ?? [];
      arr.push(v);
      m.set(v.colorId, arr);
    }
    return Array.from(m.entries());
  }, [plan.voxels]);

  const cameraDistance = Math.max(plan.size.x, plan.size.y) * 1.6;

  return (
    <Canvas shadows dpr={[1, 2]} className="rounded-lg">
      <color attach="background" args={['#0e0f12']} />
      <PerspectiveCamera
        makeDefault
        position={[center.x + cameraDistance * 0.7, center.y + cameraDistance * 0.5, cameraDistance]}
        fov={40}
      />
      <OrbitControls target={[center.x, center.y, center.z]} makeDefault />
      <ambientLight intensity={0.6} />
      <directionalLight
        position={[center.x + 30, 40, center.z + 30]}
        intensity={1.2}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <hemisphereLight args={['#bbd8ff', '#3a2d20', 0.4]} />

      <mesh position={[center.x, -0.6, center.z]} receiveShadow>
        <boxGeometry args={[plan.baseplate.width, 0.2, plan.baseplate.depth]} />
        <meshStandardMaterial color="#3a3d44" roughness={0.85} />
      </mesh>

      {groups.map(([colorId, voxels]) => (
        <VoxelInstancedGroup key={colorId} colorId={colorId} voxels={voxels} />
      ))}
    </Canvas>
  );
}
