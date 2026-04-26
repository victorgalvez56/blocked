'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { PALETTE } from '@/lib/palette';
import { getBrick } from '@/lib/bricks';
import type { VoxelGridSnapshot, Voxel } from '@/types/voxel.types';

const colorByIdHex: Record<string, string> = Object.fromEntries(
  PALETTE.map((c) => [c.id, `#${c.hex}`]),
);

interface BrickGroup {
  key: string;
  brickId: string;
  rotation: number;
  colorId: string;
  voxels: Voxel[];
}

function dimsFor(brickId: string, rotation: number): { sx: number; sz: number } {
  const def = getBrick(brickId);
  if (!def) return { sx: 1, sz: 1 };
  const { studsX, studsZ } = def.dimensions;
  return rotation === 90 ? { sx: studsZ, sz: studsX } : { sx: studsX, sz: studsZ };
}

function BrickInstancedGroup({ group }: { group: BrickGroup }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = group.voxels.length;
  const color = colorByIdHex[group.colorId] ?? '#888888';
  const { sx, sz } = dimsFor(group.brickId, group.rotation);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const v = group.voxels[i];
      // Anchor at coord = lower-corner; center the mesh by offsetting half-size
      dummy.position.set(
        v.coord[0] + sx / 2 - 0.5,
        v.coord[1] + 0.5,
        v.coord[2] + sz / 2 - 0.5,
      );
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [group.voxels, count, sx, sz]);

  // Slim each axis by 0.04 to expose seams between adjacent pieces
  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[sx - 0.04, 0.96, sz - 0.04]} />
      <meshStandardMaterial color={color} roughness={0.55} metalness={0.04} />
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

  const groups = useMemo<BrickGroup[]>(() => {
    const m = new Map<string, BrickGroup>();
    for (const v of plan.voxels) {
      const key = `${v.brickId}|${v.rotation}|${v.colorId}`;
      const existing = m.get(key);
      if (existing) {
        existing.voxels.push(v);
      } else {
        m.set(key, {
          key,
          brickId: v.brickId,
          rotation: v.rotation,
          colorId: v.colorId,
          voxels: [v],
        });
      }
    }
    return Array.from(m.values());
  }, [plan.voxels]);

  const cameraDistance = Math.max(plan.size.x, plan.size.y) * 1.65;

  return (
    <Canvas shadows dpr={[1, 2]} className="block">
      <color attach="background" args={['#f2ebdd']} />
      <PerspectiveCamera
        makeDefault
        position={[
          center.x + cameraDistance * 0.7,
          center.y + cameraDistance * 0.55,
          cameraDistance,
        ]}
        fov={38}
      />
      <OrbitControls
        target={[center.x, center.y, center.z]}
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.6}
      />
      <ambientLight intensity={0.65} />
      <directionalLight
        position={[center.x + 30, 45, center.z + 25]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-20, 18, -10]} intensity={0.35} color="#bbd8ff" />
      <hemisphereLight args={['#ffffff', '#988366', 0.35]} />

      <mesh position={[center.x, -0.55, center.z]} receiveShadow>
        <boxGeometry args={[plan.baseplate.width, 0.18, plan.baseplate.depth]} />
        <meshStandardMaterial color="#14161f" roughness={0.95} />
      </mesh>

      {groups.map((g) => (
        <BrickInstancedGroup key={g.key} group={g} />
      ))}
    </Canvas>
  );
}
