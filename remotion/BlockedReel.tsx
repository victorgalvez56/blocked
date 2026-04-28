import {
  AbsoluteFill,
  continueRender,
  delayRender,
  Easing,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from 'remotion';
import { ThreeCanvas } from '@remotion/three';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { voxelizeMultiview } from '@/lib/voxelizer/multiview';
import { DEFAULT_OPTS } from '@/lib/voxelizer/client-image-to-grid';
import { PALETTE } from '@/lib/palette';
import { getBrick } from '@/lib/bricks';
import type { VoxelGridSnapshot, Voxel } from '@/types/voxel.types';

// ---- Constants matching the studio rendering ----
const BRICK_HEIGHT = 1.2;
const BRICK_VISUAL_HEIGHT = 1.15;
const BRICK_WALL = 0.16;
const STUD_RADIUS = 0.31;
const STUD_HEIGHT = 0.21;
const EXPLODE_REACH = 22;

const colorByIdHex = Object.fromEntries(
  PALETTE.map((c) => [c.id, `#${c.hex}`]),
);

// ---- Brick geometry: open-bottom shell, cached per (sx, sz) ----
function buildOpenBottomBrick(
  sx: number,
  sy: number,
  sz: number,
  wall: number,
): THREE.BufferGeometry {
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
function getBrickGeometry(sx: number, sz: number) {
  const key = `${sx}|${sz}`;
  let g = brickGeomCache.get(key);
  if (!g) {
    g = buildOpenBottomBrick(sx - 0.04, BRICK_VISUAL_HEIGHT, sz - 0.04, BRICK_WALL);
    brickGeomCache.set(key, g);
  }
  return g;
}

function dimsFor(brickId: string, rotation: number) {
  const def = getBrick(brickId);
  if (!def) return { sx: 1, sz: 1 };
  const { studsX, studsZ } = def.dimensions;
  return rotation === 90 ? { sx: studsZ, sz: studsX } : { sx: studsX, sz: studsZ };
}

interface BrickGroup {
  key: string;
  brickId: string;
  rotation: number;
  colorId: string;
  voxels: Voxel[];
}
interface StudInstance {
  pos: [number, number, number];
  anchor: [number, number, number];
}
interface StudGroup {
  key: string;
  colorId: string;
  studs: StudInstance[];
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
  return [dx * k, dy * k, dz * k];
}

// ---- Subcomponents ----

function BrickInstanced({
  group,
  explode,
  center,
}: {
  group: BrickGroup;
  explode: number;
  center: { x: number; y: number; z: number };
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const count = group.voxels.length;
  const color = colorByIdHex[group.colorId] ?? '#888888';
  const { sx, sz } = dimsFor(group.brickId, group.rotation);
  const geometry = useMemo(() => getBrickGeometry(sx, sz), [sx, sz]);

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

  return (
    <instancedMesh ref={meshRef} args={[geometry, undefined, count]}>
      <meshStandardMaterial
        color={color}
        roughness={0.45}
        metalness={0.04}
        side={THREE.DoubleSide}
      />
    </instancedMesh>
  );
}

function StudsInstanced({
  group,
  explode,
  center,
}: {
  group: StudGroup;
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
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]}>
      <cylinderGeometry args={[STUD_RADIUS, STUD_RADIUS, STUD_HEIGHT, 16]} />
      <meshStandardMaterial color={color} roughness={0.45} metalness={0.04} />
    </instancedMesh>
  );
}

// Centered camera rig — keeps a fixed camera, rotates the build via the parent group
function Scene({
  plan,
  visibleVoxels,
  yaw,
  explode,
}: {
  plan: VoxelGridSnapshot;
  visibleVoxels: Voxel[];
  yaw: number;
  explode: number;
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
    for (const v of visibleVoxels) {
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
  }, [visibleVoxels]);

  const occupied = useMemo(() => {
    const set = new Set<string>();
    for (const v of visibleVoxels) {
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
  }, [visibleVoxels]);

  const studGroups = useMemo<StudGroup[]>(() => {
    const m = new Map<string, StudGroup>();
    for (const v of visibleVoxels) {
      const def = getBrick(v.brickId);
      if (!def) continue;
      const sx = v.rotation === 90 ? def.dimensions.studsZ : def.dimensions.studsX;
      const sz = v.rotation === 90 ? def.dimensions.studsX : def.dimensions.studsZ;
      const key = v.colorId;
      let g = m.get(key);
      if (!g) {
        g = { key, colorId: v.colorId, studs: [] };
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
  }, [visibleVoxels, occupied]);

  return (
    <group rotation={[0, yaw, 0]} position={[-center.x, -center.y, -center.z]}>
      {groups.map((g) => (
        <BrickInstanced key={g.key} group={g} explode={explode} center={center} />
      ))}
      {studGroups.map((g) => (
        <StudsInstanced key={g.key} group={g} explode={explode} center={center} />
      ))}
    </group>
  );
}

function loadImg(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('image load failed'));
    img.src = url;
  });
}

// ---- Title overlay ----
function Title({ frame }: { frame: number }) {
  // Intro fade in 0..30, hold 30..60, fade out 60..90
  const opacity = interpolate(
    frame,
    [0, 12, 60, 90],
    [0, 1, 1, 0],
    { extrapolateRight: 'clamp', extrapolateLeft: 'clamp' },
  );
  const slide = interpolate(frame, [0, 24], [40, 0], {
    extrapolateRight: 'clamp',
    extrapolateLeft: 'clamp',
    easing: Easing.out(Easing.cubic),
  });
  if (opacity === 0 && frame > 90) return null;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-start',
        paddingTop: 80,
        opacity,
      }}
    >
      <div
        style={{
          transform: `translateY(${slide}px)`,
          fontFamily: 'Archivo Black, system-ui, sans-serif',
          fontSize: 96,
          letterSpacing: '-0.02em',
          color: '#1c1f26',
          textTransform: 'uppercase',
        }}
      >
        BLOCKED
      </div>
      <div
        style={{
          transform: `translateY(${slide * 0.6}px)`,
          marginTop: 8,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 14,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: '#e63946',
        }}
      >
        Image → 3D Voxel Build
      </div>
    </AbsoluteFill>
  );
}

// ---- Bottom caption ----
function Caption({
  text,
  frame,
  range,
}: {
  text: string;
  frame: number;
  range: [number, number, number, number]; // fadeIn start, fadeIn end, fadeOut start, fadeOut end
}) {
  const opacity = interpolate(frame, range, [0, 1, 1, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  if (opacity === 0) return null;
  return (
    <AbsoluteFill
      style={{
        pointerEvents: 'none',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
        paddingBottom: 60,
        opacity,
      }}
    >
      <div
        style={{
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          fontSize: 16,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
          color: '#1c1f26',
          background: '#f2ebdd',
          border: '2px solid #1c1f26',
          padding: '10px 18px',
          boxShadow: '4px 4px 0 #1c1f26',
        }}
      >
        {text}
      </div>
    </AbsoluteFill>
  );
}

// ---- Main composition ----
export const BlockedReel: React.FC = () => {
  const frame = useCurrentFrame();
  const { width, height, fps, durationInFrames } = useVideoConfig();
  const [plan, setPlan] = useState<VoxelGridSnapshot | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [handle] = useState(() => delayRender('voxelizing dragon'));

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const img = await loadImg(staticFile('example/dragon.png'));
        const p = voxelizeMultiview(
          { front: img },
          {
            ...DEFAULT_OPTS,
            resolution: 28,
            density: 60,
            backgroundThreshold: 50,
            optimize: true,
            hollow: true,
          },
        );
        if (!cancelled) {
          setPlan(p);
          continueRender(handle);
        }
      } catch (e) {
        if (!cancelled) {
          setErrMsg(e instanceof Error ? e.message : String(e));
          continueRender(handle);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [handle]);

  const ordered = useMemo<Voxel[]>(() => {
    if (!plan) return [];
    return [...plan.voxels].sort((a, b) => {
      if (a.coord[1] !== b.coord[1]) return a.coord[1] - b.coord[1];
      if (a.coord[2] !== b.coord[2]) return a.coord[2] - b.coord[2];
      return a.coord[0] - b.coord[0];
    });
  }, [plan]);

  // ---- Phase math ----
  // 0–30 : title intro (no bricks)
  // 30–150 : build assembles piece-by-piece (4s)
  // 150–210 : 360° turntable (2s)
  // 210–240 : explode out-and-in (1s)
  const buildStart = 30;
  const buildEnd = 150;
  const orbitEnd = 210;
  const explodeEnd = 240;

  let placed = ordered.length;
  if (frame < buildStart) placed = 0;
  else if (frame < buildEnd) {
    const t = interpolate(frame, [buildStart, buildEnd], [0, 1], {
      easing: Easing.out(Easing.cubic),
    });
    placed = Math.floor(t * ordered.length);
  }
  const visibleVoxels = ordered.slice(0, placed);

  // Yaw — gentle drift during build, full rotation during orbit phase
  let yaw = -0.4;
  if (frame >= buildStart && frame < buildEnd) {
    yaw = interpolate(frame, [buildStart, buildEnd], [-0.45, 0.55], {
      easing: Easing.inOut(Easing.cubic),
    });
  } else if (frame < orbitEnd) {
    yaw = interpolate(frame, [buildEnd, orbitEnd], [0.55, 0.55 + Math.PI * 2], {
      easing: Easing.inOut(Easing.cubic),
    });
  } else if (frame < explodeEnd) {
    yaw = 0.55 + Math.PI * 2;
  }

  // Explode magnitude during the last second: 0 → 1 → 0 (push out, pull back)
  let explode = 0;
  if (frame >= orbitEnd) {
    const t = (frame - orbitEnd) / (explodeEnd - orbitEnd);
    explode = Math.sin(t * Math.PI);
  }

  // Camera distance scales with build size
  const cameraDistance = plan
    ? Math.max(plan.size.x, plan.size.y * BRICK_HEIGHT, plan.size.z) * 1.85
    : 60;
  const cameraY = plan ? plan.size.y * BRICK_HEIGHT * 0.45 : 18;

  return (
    <AbsoluteFill style={{ backgroundColor: '#f2ebdd' }}>
      {/* dot grid texture on the background */}
      <AbsoluteFill
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, rgba(28,31,38,0.08) 1px, transparent 0)',
          backgroundSize: '14px 14px',
        }}
      />

      {plan && (
        <ThreeCanvas width={width} height={height}>
          <ambientLight intensity={0.55} />
          <directionalLight position={[20, 35, 18]} intensity={1.2} />
          <directionalLight position={[-15, 18, -10]} intensity={0.35} color="#bbd8ff" />
          <hemisphereLight args={['#ffffff', '#988366', 0.4]} />

          <perspectiveCamera
            position={[0, cameraY, cameraDistance]}
            fov={36}
            near={0.1}
            far={1000}
          />

          <Scene
            plan={plan}
            visibleVoxels={visibleVoxels}
            yaw={yaw}
            explode={explode}
          />
        </ThreeCanvas>
      )}

      <Title frame={frame} />

      {/* Phase captions */}
      <Caption frame={frame} text="Assembling 1×1 bricks" range={[buildStart + 6, buildStart + 24, buildEnd - 18, buildEnd]} />
      <Caption frame={frame} text="360° inspection" range={[buildEnd + 4, buildEnd + 18, orbitEnd - 18, orbitEnd]} />
      <Caption frame={frame} text="Exploded view" range={[orbitEnd + 2, orbitEnd + 14, explodeEnd - 14, explodeEnd]} />

      {/* Frame counter — tiny, top-right */}
      <AbsoluteFill
        style={{
          pointerEvents: 'none',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'flex-end',
          padding: 24,
        }}
      >
        <div
          style={{
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 11,
            letterSpacing: '0.2em',
            color: 'rgba(28,31,38,0.6)',
          }}
        >
          {String(frame).padStart(3, '0')} / {durationInFrames - 1} · {fps}fps
        </div>
      </AbsoluteFill>

      {errMsg && (
        <AbsoluteFill
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#e63946',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 14,
            padding: 40,
            textAlign: 'center',
          }}
        >
          {errMsg}
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
