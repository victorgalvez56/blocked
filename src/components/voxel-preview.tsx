'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '@/lib/palette';
import { getBrick } from '@/lib/bricks';
import type { VoxelGridSnapshot, Voxel } from '@/types/voxel.types';

const colorByIdHex: Record<string, string> = Object.fromEntries(
  PALETTE.map((c) => [c.id, `#${c.hex}`]),
);

const BRICK_HEIGHT = 1.2;
const BRICK_VISUAL_HEIGHT = 1.15;
const BRICK_WALL = 0.16; // wall + ceiling thickness for the open-bottom shell
const STUD_RADIUS = 0.31;
const STUD_HEIGHT = 0.21;
const EXPLODE_REACH = 18; // world units that 100% explode pushes a max-radius brick out by

// Build a brick: open bottom (cavity), 4 outer walls + top cap.
// Centered on the origin, sy along Y, sx × sz on the floor plane.
function buildOpenBottomBrick(sx: number, sy: number, sz: number, wall: number): THREE.BufferGeometry {
  const inner = sy - wall;
  const top = new THREE.BoxGeometry(sx, wall, sz);
  top.translate(0, sy / 2 - wall / 2, 0);
  const front = new THREE.BoxGeometry(sx, inner, wall);
  front.translate(0, -wall / 2, sz / 2 - wall / 2);
  const back = new THREE.BoxGeometry(sx, inner, wall);
  back.translate(0, -wall / 2, -(sz / 2 - wall / 2));
  const innerZ = Math.max(0.001, sz - 2 * wall);
  const left = new THREE.BoxGeometry(wall, inner, innerZ);
  left.translate(-(sx / 2 - wall / 2), -wall / 2, 0);
  const right = new THREE.BoxGeometry(wall, inner, innerZ);
  right.translate(sx / 2 - wall / 2, -wall / 2, 0);
  return mergeGeometries([top, front, back, left, right]);
}

const brickGeomCache = new Map<string, THREE.BufferGeometry>();
function getBrickGeometry(sx: number, sz: number): THREE.BufferGeometry {
  const key = `${sx}|${sz}`;
  let g = brickGeomCache.get(key);
  if (!g) {
    g = buildOpenBottomBrick(sx - 0.04, BRICK_VISUAL_HEIGHT, sz - 0.04, BRICK_WALL);
    brickGeomCache.set(key, g);
  }
  return g;
}

export type Highlight = { brickId: string; colorId?: string } | null;

interface BrickGroup {
  key: string;
  brickId: string;
  rotation: number;
  colorId: string;
  voxels: Voxel[];
}

interface StudInstance {
  pos: [number, number, number]; // stud world position (no explode)
  anchor: [number, number, number]; // owning brick center (used to compute explode direction)
}

interface StudGroup {
  key: string;
  brickId: string;
  colorId: string;
  studs: StudInstance[];
}

function dimsFor(brickId: string, rotation: number): { sx: number; sz: number } {
  const def = getBrick(brickId);
  if (!def) return { sx: 1, sz: 1 };
  const { studsX, studsZ } = def.dimensions;
  return rotation === 90 ? { sx: studsZ, sz: studsX } : { sx: studsX, sz: studsZ };
}

function matchesHighlight(brickId: string, colorId: string, h: Highlight): boolean {
  if (!h) return true;
  if (h.brickId !== brickId) return false;
  if (h.colorId !== undefined && h.colorId !== colorId) return false;
  return true;
}

function explodeOffset(
  base: [number, number, number],
  center: { x: number; y: number; z: number },
  explode: number,
): [number, number, number] {
  if (explode <= 0) return [0, 0, 0];
  const dx = base[0] - center.x;
  const dy = base[1] - center.y;
  const dz = base[2] - center.z;
  const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
  if (len < 1e-4) return [0, 0, 0];
  const k = (explode * EXPLODE_REACH) / Math.max(len, 1);
  // multiply by distance so far pieces fly farther than near pieces — classic exploded look
  return [dx * k, dy * k, dz * k];
}

function BrickInstancedGroup({
  group,
  dimmed,
  emphasized,
  explode,
  center,
}: {
  group: BrickGroup;
  dimmed: boolean;
  emphasized: boolean;
  explode: number;
  center: { x: number; y: number; z: number };
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = group.voxels.length;
  const color = colorByIdHex[group.colorId] ?? '#888888';
  const { sx, sz } = dimsFor(group.brickId, group.rotation);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const v = group.voxels[i];
      const bx = v.coord[0] + sx / 2 - 0.5;
      const by = v.coord[1] * BRICK_HEIGHT + BRICK_VISUAL_HEIGHT / 2;
      const bz = v.coord[2] + sz / 2 - 0.5;
      const [ox, oy, oz] = explodeOffset([bx, by, bz], center, explode);
      dummy.position.set(bx + ox, by + oy, bz + oz);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [group.voxels, count, sx, sz, explode, center.x, center.y, center.z]);

  const geometry = useMemo(() => getBrickGeometry(sx, sz), [sx, sz]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, undefined, count]}
      castShadow={!dimmed && explode < 0.05}
      receiveShadow
      renderOrder={dimmed ? 0 : 1}
    >
      <meshStandardMaterial
        color={color}
        roughness={0.45}
        metalness={0.04}
        side={THREE.DoubleSide}
        transparent={dimmed}
        opacity={dimmed ? 0.08 : 1}
        depthWrite={!dimmed}
        emissive={emphasized ? color : '#000000'}
        emissiveIntensity={emphasized ? 0.32 : 0}
      />
    </instancedMesh>
  );
}

function StudsInstanced({
  group,
  dimmed,
  emphasized,
  explode,
  center,
}: {
  group: StudGroup;
  dimmed: boolean;
  emphasized: boolean;
  explode: number;
  center: { x: number; y: number; z: number };
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = group.studs.length;
  const color = colorByIdHex[group.colorId] ?? '#888888';

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    for (let i = 0; i < count; i++) {
      const s = group.studs[i];
      const [ox, oy, oz] = explodeOffset(s.anchor, center, explode);
      dummy.position.set(s.pos[0] + ox, s.pos[1] + STUD_HEIGHT / 2 + oy, s.pos[2] + oz);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [group.studs, count, explode, center.x, center.y, center.z]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[undefined, undefined, count]}
      castShadow={!dimmed && explode < 0.05}
      receiveShadow
    >
      <cylinderGeometry args={[STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 16]} />
      <meshStandardMaterial
        color={color}
        roughness={0.45}
        metalness={0.04}
        transparent={dimmed}
        opacity={dimmed ? 0.08 : 1}
        depthWrite={!dimmed}
        emissive={emphasized ? color : '#000000'}
        emissiveIntensity={emphasized ? 0.32 : 0}
      />
    </instancedMesh>
  );
}

function CurrentVoxelSpotlight({
  voxel,
  center,
  explode,
}: {
  voxel: Voxel;
  center: { x: number; y: number; z: number };
  explode: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const def = getBrick(voxel.brickId);
  const sx = !def
    ? 1
    : voxel.rotation === 90
      ? def.dimensions.studsZ
      : def.dimensions.studsX;
  const sz = !def
    ? 1
    : voxel.rotation === 90
      ? def.dimensions.studsX
      : def.dimensions.studsZ;
  const baseX = voxel.coord[0] + sx / 2 - 0.5;
  const baseY = voxel.coord[1] * BRICK_HEIGHT + BRICK_VISUAL_HEIGHT / 2;
  const baseZ = voxel.coord[2] + sz / 2 - 0.5;
  const [ox, oy, oz] = explodeOffset([baseX, baseY, baseZ], center, explode);

  useFrame(({ clock }) => {
    if (!groupRef.current) return;
    const pulse = 1 + Math.sin(clock.getElapsedTime() * 4.2) * 0.07;
    groupRef.current.scale.setScalar(pulse);
  });

  return (
    <group ref={groupRef} position={[baseX + ox, baseY + oy, baseZ + oz]}>
      <mesh>
        <boxGeometry args={[sx + 0.35, BRICK_VISUAL_HEIGHT + 0.35, sz + 0.35]} />
        <meshBasicMaterial color="#ffd400" transparent opacity={0.32} depthWrite={false} />
      </mesh>
      <mesh>
        <boxGeometry args={[sx + 0.55, BRICK_VISUAL_HEIGHT + 0.55, sz + 0.55]} />
        <meshBasicMaterial color="#ffd400" transparent opacity={0.12} depthWrite={false} />
      </mesh>
    </group>
  );
}

export function VoxelPreview({
  plan,
  highlight = null,
  explode = 0,
  currentVoxel = null,
}: {
  plan: VoxelGridSnapshot;
  highlight?: Highlight;
  explode?: number;
  currentVoxel?: Voxel | null;
}) {
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

  const studGroups = useMemo<StudGroup[]>(() => {
    const m = new Map<string, StudGroup>();
    for (const v of plan.voxels) {
      const def = getBrick(v.brickId);
      if (!def) continue;
      const sx = v.rotation === 90 ? def.dimensions.studsZ : def.dimensions.studsX;
      const sz = v.rotation === 90 ? def.dimensions.studsX : def.dimensions.studsZ;
      const key = `${v.brickId}|${v.colorId}`;
      let g = m.get(key);
      if (!g) {
        g = { key, brickId: v.brickId, colorId: v.colorId, studs: [] };
        m.set(key, g);
      }
      const wyTop = v.coord[1] * BRICK_HEIGHT + BRICK_VISUAL_HEIGHT;
      const anchor: [number, number, number] = [
        v.coord[0] + sx / 2 - 0.5,
        v.coord[1] * BRICK_HEIGHT + BRICK_VISUAL_HEIGHT / 2,
        v.coord[2] + sz / 2 - 0.5,
      ];
      for (let i = 0; i < sx; i++) {
        for (let j = 0; j < sz; j++) {
          const above = `${v.coord[0] + i},${v.coord[1] + 1},${v.coord[2] + j}`;
          if (occupied.has(above)) continue;
          g.studs.push({
            pos: [v.coord[0] + i, wyTop, v.coord[2] + j],
            anchor,
          });
        }
      }
    }
    return Array.from(m.values());
  }, [plan.voxels, occupied]);

  const cameraDistance = Math.max(plan.size.x, plan.size.y * BRICK_HEIGHT) * 1.65;
  const isExploding = explode > 0.02;

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
        autoRotate={highlight === null && !isExploding}
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

      {groups.map((g) => {
        const match = matchesHighlight(g.brickId, g.colorId, highlight);
        if (highlight !== null && !match) return null;
        return (
          <BrickInstancedGroup
            key={g.key}
            group={g}
            dimmed={false}
            emphasized={highlight !== null && match}
            explode={explode}
            center={center}
          />
        );
      })}

      {studGroups.map((g) => {
        const match = matchesHighlight(g.brickId, g.colorId, highlight);
        if (highlight !== null && !match) return null;
        return (
          <StudsInstanced
            key={g.key}
            group={g}
            dimmed={false}
            emphasized={highlight !== null && match}
            explode={explode}
            center={center}
          />
        );
      })}

      {currentVoxel && (
        <CurrentVoxelSpotlight voxel={currentVoxel} center={center} explode={explode} />
      )}
    </Canvas>
  );
}
