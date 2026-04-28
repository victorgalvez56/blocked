'use client';

import { Canvas, useFrame, useThree } from '@react-three/fiber';
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

function brickRotHash(coord: readonly [number, number, number], salt: number): number {
  const n = coord[0] * 127 + coord[1] * 311 + coord[2] * 74 + salt * 997;
  return Math.abs(Math.sin(n) * 43758.5453) % 1;
}

// Standard bounce-out easing (matches GSAP's bounce.out)
function bounceOut(t: number): number {
  const n = 7.5625, d = 2.75;
  if (t < 1 / d) return n * t * t;
  if (t < 2 / d) { const t2 = t - 1.5 / d; return n * t2 * t2 + 0.75; }
  if (t < 2.5 / d) { const t2 = t - 2.25 / d; return n * t2 * t2 + 0.9375; }
  const t2 = t - 2.625 / d; return n * t2 * t2 + 0.984375;
}

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
  nuke,
  gravityOffsets,
  gravityProgress,
  maxGridY,
  gravityRestoring,
  disco,
  blackholeProgress,
  maxGridDist,
  hiddenKeys,
  recolorMap,
}: {
  group: BrickGroup;
  dimmed: boolean;
  emphasized: boolean;
  explode: number;
  center: { x: number; y: number; z: number };
  nuke?: boolean;
  gravityOffsets?: Map<string, number>;
  gravityProgress?: number;
  maxGridY?: number;
  gravityRestoring?: boolean;
  disco?: boolean;
  blackholeProgress?: number;
  maxGridDist?: number;
  hiddenKeys?: Set<string>;
  recolorMap?: Map<string, string>;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const count = group.voxels.length;
  const mappedColorId = recolorMap?.get(group.colorId) ?? group.colorId;
  const color = colorByIdHex[mappedColorId] ?? '#888888';
  const { sx, sz } = dimsFor(group.brickId, group.rotation);
  const tempColor = useMemo(() => new THREE.Color(), []);

  useFrame((state) => {
    if (!meshRef.current || !matRef.current || !disco) return;
    const t = state.clock.elapsedTime * 0.35;
    for (let i = 0; i < count; i++) {
      const v = group.voxels[i];
      const hue = ((t + v.coord[0] * 0.08 + v.coord[2] * 0.08 + v.coord[1] * 0.04) % 1 + 1) % 1;
      tempColor.setHSL(hue, 1.0, 0.5);
      meshRef.current.setColorAt(i, tempColor);
    }
    meshRef.current.instanceColor!.needsUpdate = true;
    matRef.current.color.set('#ffffff');
  });

  useEffect(() => {
    if (!disco && meshRef.current) {
      const base = new THREE.Color(color);
      for (let i = 0; i < count; i++) meshRef.current.setColorAt(i, base);
      if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
    }
  }, [disco, color, count]);

  useEffect(() => {
    if (!meshRef.current) return;
    const dummy = new THREE.Object3D();
    const gp = gravityProgress ?? 0;
    const maxY = maxGridY ?? 1;
    const bhp = blackholeProgress ?? 0;
    const mDist = maxGridDist ?? 1;

    for (let i = 0; i < count; i++) {
      const v = group.voxels[i];
      const coordKey = `${v.coord[0]},${v.coord[1]},${v.coord[2]}`;

      if (hiddenKeys?.has(coordKey)) {
        dummy.position.set(0, -9999, 0);
        dummy.scale.setScalar(0);
        dummy.rotation.set(0, 0, 0);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        continue;
      }

      const bx = v.coord[0] + sx / 2 - 0.5;
      const bz = v.coord[2] + sz / 2 - 0.5;

      let gridY = v.coord[1];
      if (gp > 0 && gravityOffsets) {
        const delta = gravityOffsets.get(coordKey) ?? 0;
        if (delta !== 0) {
          let factor: number;
          if (gravityRestoring) {
            factor = gp;
          } else {
            const delay = maxY > 0 ? (v.coord[1] / maxY) * 0.28 : 0;
            const t = Math.max(0, Math.min(1, (gp - delay) / (1 - delay + 0.001)));
            factor = bounceOut(t);
          }
          gridY = v.coord[1] + delta * factor;
        }
      }

      const by = gridY * BRICK_HEIGHT + BRICK_VISUAL_HEIGHT / 2;

      if (bhp > 0) {
        const origDist = Math.sqrt((bx - center.x) ** 2 + (bz - center.z) ** 2);
        const normalizedDist = origDist / (mDist + 0.001);
        const delay = normalizedDist * 0.35;
        const localT = Math.max(0, Math.min(1, (bhp - delay) / (1 - delay + 0.001)));
        const angle = brickRotHash(v.coord, 5) * Math.PI * 2 + localT * Math.PI * 5;
        const dist = origDist * (1 - localT);
        dummy.position.set(
          center.x + Math.cos(angle) * dist,
          by + (center.y - by) * localT * 0.8,
          center.z + Math.sin(angle) * dist,
        );
        dummy.rotation.set(
          brickRotHash(v.coord, 6) * Math.PI * 2 * localT,
          brickRotHash(v.coord, 7) * Math.PI * 4 * localT,
          0,
        );
        dummy.scale.setScalar(Math.max(0, 1 - localT * 1.1));
      } else {
        const [ox, oy, oz] = explodeOffset([bx, by, bz], center, explode);
        dummy.position.set(bx + ox, by + oy, bz + oz);
        dummy.scale.setScalar(1);
        if (nuke && explode > 0) {
          const spin = Math.min(explode, 1.5);
          dummy.rotation.set(
            brickRotHash(v.coord, 0) * Math.PI * 6 * spin,
            brickRotHash(v.coord, 1) * Math.PI * 6 * spin,
            brickRotHash(v.coord, 2) * Math.PI * 6 * spin,
          );
        } else {
          dummy.rotation.set(0, 0, 0);
        }
      }

      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
  }, [group.voxels, count, sx, sz, explode, center.x, center.y, center.z, nuke, gravityOffsets, gravityProgress, maxGridY, gravityRestoring, blackholeProgress, maxGridDist, hiddenKeys]);

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
        ref={matRef}
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

function Missile({
  active,
  center,
}: {
  active: boolean;
  center: { x: number; y: number; z: number };
}) {
  const groupRef = useRef<THREE.Group>(null);
  const tRef = useRef(1);

  useEffect(() => {
    if (active) tRef.current = 0;
  }, [active]);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    if (!active) {
      g.visible = false;
      return;
    }
    g.visible = true;
    tRef.current = Math.min(1, tRef.current + delta / 1.1);
    const t = tRef.current;
    const easeIn = t * t * t;
    g.position.set(center.x, center.y + 30 * (1 - easeIn), center.z);
  });

  return (
    <group ref={groupRef} visible={false}>
      {/* Body */}
      <mesh>
        <cylinderGeometry args={[0.28, 0.28, 2.4, 6]} />
        <meshStandardMaterial color="#1a1a1a" roughness={0.7} />
      </mesh>
      {/* Nose cone — tip points down (-Y), base at body bottom */}
      <mesh position={[0, -1.7, 0]} rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.28, 1.0, 6]} />
        <meshStandardMaterial color="#999" metalness={0.3} roughness={0.4} />
      </mesh>
      {/* Red danger band */}
      <mesh position={[0, -0.5, 0]}>
        <cylinderGeometry args={[0.29, 0.29, 0.18, 6]} />
        <meshStandardMaterial color="#cc0000" />
      </mesh>
      {/* 4 fins at tail */}
      <group position={[0, 1.0, 0]}>
        {[0, 1, 2, 3].map((i) => (
          <mesh key={i} rotation={[0, (i * Math.PI) / 2, 0]}>
            <boxGeometry args={[0.06, 0.9, 0.6]} />
            <meshStandardMaterial color="#111" roughness={0.8} />
          </mesh>
        ))}
      </group>
      {/* Exhaust flame */}
      <mesh position={[0, 2.0, 0]}>
        <coneGeometry args={[0.18, 0.8, 6]} />
        <meshStandardMaterial
          color="#ff8800"
          emissive="#ff4400"
          emissiveIntensity={3}
          transparent
          opacity={0.9}
        />
      </mesh>
      <pointLight position={[0, 2.2, 0]} color="#ff6600" intensity={4} distance={8} decay={2} />
    </group>
  );
}

function ShockwaveRing({
  impactKey,
  center,
}: {
  impactKey: number;
  center: { x: number; y: number; z: number };
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshBasicMaterial>(null);
  const tRef = useRef(1);

  useEffect(() => {
    tRef.current = 0;
  }, [impactKey]);

  useFrame((_, delta) => {
    if (!meshRef.current || !matRef.current) return;
    if (tRef.current >= 1) {
      meshRef.current.visible = false;
      return;
    }
    tRef.current = Math.min(1, tRef.current + delta * 2.5);
    const t = tRef.current;
    meshRef.current.visible = true;
    meshRef.current.scale.setScalar(t * 20);
    matRef.current.opacity = (1 - t) * 0.85;
  });

  return (
    <mesh
      ref={meshRef}
      position={[center.x, center.y, center.z]}
      rotation={[Math.PI / 2, 0, 0]}
      visible={false}
    >
      <torusGeometry args={[1, 0.06, 6, 48]} />
      <meshBasicMaterial ref={matRef} color="#ff6600" transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

function CameraRig({
  photoMode,
  center,
  distance,
}: {
  photoMode: boolean;
  center: { x: number; y: number; z: number };
  distance: number;
}) {
  const { camera } = useThree();
  useEffect(() => {
    if (!photoMode) return;
    const iso = new THREE.Vector3(1, 1, 1).normalize();
    camera.position.set(
      center.x + iso.x * distance,
      center.y + iso.y * distance,
      center.z + iso.z * distance,
    );
    (camera as THREE.PerspectiveCamera).lookAt(center.x, center.y, center.z);
  }, [photoMode, center.x, center.y, center.z, distance, camera]);
  return null;
}

export type PosterData = {
  sizeX: number; sizeY: number; sizeZ: number;
  pieceCount: number; stamp: string;
};

function ScreenshotCapture({ trigger, posterData }: { trigger: number; posterData?: PosterData | null }) {
  const { gl } = useThree();
  const prevRef = useRef(trigger);
  useEffect(() => {
    if (trigger === prevRef.current) return;
    prevRef.current = trigger;

    const src = gl.domElement;
    const w = src.width;
    const h = src.height;

    const composite = document.createElement('canvas');
    composite.width = w;
    composite.height = h;
    const ctx = composite.getContext('2d')!;
    ctx.drawImage(src, 0, 0);

    if (posterData) {
      const pad = Math.round(w * 0.042);
      const ink = '#14161f';
      const ink2 = '#4a5060';
      const red = '#d81e2c';

      // top-left: title
      const titlePx = Math.round(w * 0.068);
      ctx.font = `900 ${titlePx}px Georgia, "Times New Roman", serif`;
      ctx.fillStyle = ink;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('BLOCKED', pad, pad);

      // subtitle under title
      const subPx = Math.round(w * 0.014);
      ctx.font = `${subPx}px monospace`;
      ctx.fillStyle = ink2;
      ctx.fillText(
        `${posterData.sizeX} × ${posterData.sizeY} × ${posterData.sizeZ} UNITS`,
        pad,
        pad + Math.round(titlePx * 1.08),
      );

      // top-right: piece count
      const cntPx = Math.round(w * 0.062);
      ctx.font = `900 ${cntPx}px Georgia, "Times New Roman", serif`;
      ctx.fillStyle = red;
      ctx.textAlign = 'right';
      ctx.textBaseline = 'top';
      ctx.fillText(posterData.pieceCount.toLocaleString(), w - pad, pad);
      ctx.font = `${subPx}px monospace`;
      ctx.fillStyle = ink2;
      ctx.fillText('PIECES', w - pad, pad + Math.round(cntPx * 1.05));

      // bottom-left: timestamp
      ctx.textAlign = 'left';
      ctx.textBaseline = 'bottom';
      ctx.font = `${subPx}px monospace`;
      ctx.fillStyle = ink2;
      ctx.fillText(posterData.stamp, pad, h - pad);

      // bottom-right: URL
      ctx.textAlign = 'right';
      ctx.fillText('blocked.victorgalvez.dev', w - pad, h - pad);
    }

    const url = composite.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'blocked-photomode.png';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [trigger, gl, posterData]);
  return null;
}

function LotteryPop({
  voxel,
  popKey,
  center,
  explode,
}: {
  voxel: Voxel | null;
  popKey: number;
  center: { x: number; y: number; z: number };
  explode: number;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const tRef = useRef(1);

  useEffect(() => {
    if (voxel) tRef.current = 0;
  }, [popKey, voxel]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;
    if (tRef.current >= 1) { meshRef.current.visible = false; return; }
    tRef.current = Math.min(1, tRef.current + delta / 0.28);
    meshRef.current.scale.setScalar(Math.max(0, Math.sin(tRef.current * Math.PI) * 2.4));
    meshRef.current.visible = true;
  });

  if (!voxel) return null;

  const def = getBrick(voxel.brickId);
  const sx = !def ? 1 : voxel.rotation === 90 ? def.dimensions.studsZ : def.dimensions.studsX;
  const sz = !def ? 1 : voxel.rotation === 90 ? def.dimensions.studsX : def.dimensions.studsZ;
  const bx = voxel.coord[0] + sx / 2 - 0.5;
  const by = voxel.coord[1] * BRICK_HEIGHT + BRICK_VISUAL_HEIGHT / 2;
  const bz = voxel.coord[2] + sz / 2 - 0.5;
  const [ox, oy, oz] = explodeOffset([bx, by, bz], center, explode);

  return (
    <mesh ref={meshRef} position={[bx + ox, by + oy, bz + oz]} visible={false}>
      <boxGeometry args={[sx, BRICK_VISUAL_HEIGHT, sz]} />
      <meshBasicMaterial color="#ffee00" transparent opacity={0.85} depthWrite={false} />
    </mesh>
  );
}

export function VoxelPreview({
  plan,
  highlight = null,
  explode = 0,
  currentVoxel = null,
  nuke = false,
  missileActive = false,
  impactKey = 0,
  gravityOffsets,
  gravityProgress = 0,
  gravityRestoring = false,
  disco = false,
  photoMode = false,
  screenshotTrigger = 0,
  posterData = null,
  blackholeProgress = 0,
  hiddenKeys,
  lotteryPopVoxel = null,
  lotteryPopKey = 0,
  recolorMap,
}: {
  plan: VoxelGridSnapshot;
  highlight?: Highlight;
  explode?: number;
  currentVoxel?: Voxel | null;
  nuke?: boolean;
  missileActive?: boolean;
  impactKey?: number;
  gravityOffsets?: Map<string, number>;
  gravityProgress?: number;
  gravityRestoring?: boolean;
  disco?: boolean;
  photoMode?: boolean;
  screenshotTrigger?: number;
  posterData?: PosterData | null;
  blackholeProgress?: number;
  hiddenKeys?: Set<string>;
  lotteryPopVoxel?: Voxel | null;
  lotteryPopKey?: number;
  recolorMap?: Map<string, string>;
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
  const maxGridDist = Math.sqrt((plan.size.x / 2) ** 2 + (plan.size.z / 2) ** 2);

  return (
    <Canvas shadows dpr={[1, 2]} className="block" gl={{ preserveDrawingBuffer: true }}>
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
        autoRotate={highlight === null && !isExploding && !photoMode}
        autoRotateSpeed={0.6}
        enabled={!photoMode}
      />
      <CameraRig photoMode={photoMode} center={center} distance={cameraDistance * 1.1} />
      <ScreenshotCapture trigger={screenshotTrigger} posterData={posterData} />
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
            nuke={nuke}
            gravityOffsets={gravityOffsets}
            gravityProgress={gravityProgress}
            maxGridY={plan.size.y - 1}
            gravityRestoring={gravityRestoring}
            disco={disco}
            blackholeProgress={blackholeProgress}
            maxGridDist={maxGridDist}
            hiddenKeys={hiddenKeys}
            recolorMap={recolorMap}
          />
        );
      })}

      {gravityProgress < 0.05 && !disco && blackholeProgress < 0.05 && studGroups.map((g) => {
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

      <LotteryPop voxel={lotteryPopVoxel} popKey={lotteryPopKey} center={center} explode={explode} />
      <Missile active={missileActive} center={center} />
      <ShockwaveRing impactKey={impactKey} center={center} />
    </Canvas>
  );
}
