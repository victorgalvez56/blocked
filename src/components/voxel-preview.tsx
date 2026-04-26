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

const BRICK_HEIGHT = 1.2;
const BRICK_VISUAL_HEIGHT = 1.15;
const STUD_RADIUS = 0.31;
const STUD_HEIGHT = 0.21;

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
      dummy.position.set(
        v.coord[0] + sx / 2 - 0.5,
        v.coord[1] * BRICK_HEIGHT + BRICK_VISUAL_HEIGHT / 2,
        v.coord[2] + sz / 2 - 0.5,
      );
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [group.voxels, count, sx, sz]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      castShadow
      receiveShadow
    >
      <boxGeometry args={[sx - 0.04, BRICK_VISUAL_HEIGHT, sz - 0.04]} />
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.04} />
    </instancedMesh>
  );
}

function StudsInstanced({
  colorId,
  positions,
}: {
  colorId: string;
  positions: Array<[number, number, number]>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = positions.length;
  const color = colorByIdHex[colorId] ?? '#888888';

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const [x, y, z] = positions[i];
      dummy.position.set(x, y + STUD_HEIGHT / 2, z);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [positions, count]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      castShadow
      receiveShadow
    >
      <cylinderGeometry args={[STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 16]} />
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.04} />
    </instancedMesh>
  );
}

export function VoxelPreview({ plan }: { plan: VoxelGridSnapshot }) {
  const center = useMemo(
    () => ({
      x: plan.size.x / 2 - 0.5,
      y: (plan.size.y * BRICK_HEIGHT) / 2,
      z: plan.size.z / 2 - 0.5,
    }),
    [plan.size.x, plan.size.y, plan.size.z],
  );

  const groups = useMemo<BrickGroup[]>(() => {
    const m = new Map<string, BrickGroup>();
    for (const v of plan.voxels) {
      const key = `${v.brickId}|${v.rotation}|${v.colorId}`;
      const existing = m.get(key);
      if (existing) existing.voxels.push(v);
      else
        m.set(key, {
          key,
          brickId: v.brickId,
          rotation: v.rotation,
          colorId: v.colorId,
          voxels: [v],
        });
    }
    return Array.from(m.values());
  }, [plan.voxels]);

  const occupied = useMemo(() => {
    const set = new Set<string>();
    for (const v of plan.voxels) {
      const def = getBrick(v.brickId);
      if (!def) continue;
      const sx = v.rotation === 90 ? def.dimensions.studsZ : def.dimensions.studsX;
      const sz = v.rotation === 90 ? def.dimensions.studsX : def.dimensions.studsZ;
      for (let i = 0; i < sx; i++) {
        for (let j = 0; j < sz; j++) {
          set.add(`${v.coord[0] + i},${v.coord[1]},${v.coord[2] + j}`);
        }
      }
    }
    return set;
  }, [plan.voxels]);

  const studsByColor = useMemo(() => {
    const m = new Map<string, Array<[number, number, number]>>();
    for (const v of plan.voxels) {
      const def = getBrick(v.brickId);
      if (!def) continue;
      const sx = v.rotation === 90 ? def.dimensions.studsZ : def.dimensions.studsX;
      const sz = v.rotation === 90 ? def.dimensions.studsX : def.dimensions.studsZ;
      const list = m.get(v.colorId) ?? [];
      const wyTop = v.coord[1] * BRICK_HEIGHT + BRICK_VISUAL_HEIGHT;
      for (let i = 0; i < sx; i++) {
        for (let j = 0; j < sz; j++) {
          const above = `${v.coord[0] + i},${v.coord[1] + 1},${v.coord[2] + j}`;
          if (occupied.has(above)) continue;
          list.push([v.coord[0] + i, wyTop, v.coord[2] + j]);
        }
      }
      m.set(v.colorId, list);
    }
    return m;
  }, [plan.voxels, occupied]);

  const cameraDistance = Math.max(plan.size.x, plan.size.y * BRICK_HEIGHT) * 1.65;

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
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[center.x + 30, 50, center.z + 25]}
        intensity={1.15}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-20, 22, -10]} intensity={0.35} color="#bbd8ff" />
      <hemisphereLight args={['#ffffff', '#988366', 0.35]} />

      <mesh position={[center.x, -0.1, center.z]} receiveShadow>
        <boxGeometry args={[plan.baseplate.width, 0.18, plan.baseplate.depth]} />
        <meshStandardMaterial color="#14161f" roughness={0.95} />
      </mesh>

      {groups.map((g) => (
        <BrickInstancedGroup key={g.key} group={g} />
      ))}

      {Array.from(studsByColor).map(([colorId, positions]) => (
        <StudsInstanced key={colorId} colorId={colorId} positions={positions} />
      ))}
    </Canvas>
  );
}
