import { getBrick } from '@/lib/bricks';

const COS30 = Math.cos(Math.PI / 6);
const SIN30 = Math.sin(Math.PI / 6);

const STUD = 5;
const HEIGHT = 8;

function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace('#', '');
  return [
    parseInt(c.slice(0, 2), 16),
    parseInt(c.slice(2, 4), 16),
    parseInt(c.slice(4, 6), 16),
  ];
}

function rgbToHex(r: number, g: number, b: number): string {
  const ch = (v: number) =>
    Math.round(Math.max(0, Math.min(255, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${ch(r)}${ch(g)}${ch(b)}`;
}

function shade(hex: string, factor: number): string {
  const [r, g, b] = hexToRgb(hex);
  return rgbToHex(r * factor, g * factor, b * factor);
}

function project(x: number, y: number, z: number) {
  return {
    x: (x - z) * COS30,
    y: (x + z) * SIN30 - y,
  };
}

interface BrickIconProps {
  brickId: string;
  color: string;
  size?: number;
  studStrokeWidth?: number;
}

export function BrickIcon({ brickId, color, size = 36 }: BrickIconProps) {
  const def = getBrick(brickId);
  const studsX = def?.dimensions.studsX ?? 1;
  const studsZ = def?.dimensions.studsZ ?? 1;
  const isPlate = def?.type === 'plate';
  const heightPlates = isPlate ? 1 : 3;
  const h = (HEIGHT * heightPlates) / 3;

  const w = studsX * STUD;
  const d = studsZ * STUD;

  const TFL = project(0, h, 0);
  const TFR = project(w, h, 0);
  const TBR = project(w, h, d);
  const TBL = project(0, h, d);
  const BFL = project(0, 0, 0);
  const BFR = project(w, 0, 0);
  const BBR = project(w, 0, d);

  const all = [TFL, TFR, TBR, TBL, BFL, BFR, BBR];
  const minX = Math.min(...all.map((p) => p.x)) - 1;
  const maxX = Math.max(...all.map((p) => p.x)) + 1;
  const minY = Math.min(...all.map((p) => p.y)) - 1;
  const maxY = Math.max(...all.map((p) => p.y)) + 1;
  const vbW = maxX - minX;
  const vbH = maxY - minY;

  const top = color;
  const front = shade(color, 0.78);
  const right = shade(color, 0.6);

  const ink = '#14161f';
  const studR = STUD * 0.32;

  const studs: Array<{ cx: number; cy: number }> = [];
  for (let i = 0; i < studsX; i++) {
    for (let j = 0; j < studsZ; j++) {
      const center = project((i + 0.5) * STUD, h + 1.4, (j + 0.5) * STUD);
      studs.push({ cx: center.x, cy: center.y });
    }
  }

  return (
    <svg
      width={size}
      height={(size * vbH) / vbW}
      viewBox={`${minX} ${minY} ${vbW} ${vbH}`}
      shapeRendering="geometricPrecision"
      aria-hidden
    >
      <polygon
        points={`${TFR.x},${TFR.y} ${TBR.x},${TBR.y} ${BBR.x},${BBR.y} ${BFR.x},${BFR.y}`}
        fill={right}
        stroke={ink}
        strokeWidth={0.6}
        strokeLinejoin="miter"
      />
      <polygon
        points={`${TFL.x},${TFL.y} ${TFR.x},${TFR.y} ${BFR.x},${BFR.y} ${BFL.x},${BFL.y}`}
        fill={front}
        stroke={ink}
        strokeWidth={0.6}
        strokeLinejoin="miter"
      />
      <polygon
        points={`${TFL.x},${TFL.y} ${TFR.x},${TFR.y} ${TBR.x},${TBR.y} ${TBL.x},${TBL.y}`}
        fill={top}
        stroke={ink}
        strokeWidth={0.6}
        strokeLinejoin="miter"
      />
      {studs.map((s, idx) => (
        <ellipse
          key={idx}
          cx={s.cx}
          cy={s.cy}
          rx={studR}
          ry={studR * 0.55}
          fill={top}
          stroke={ink}
          strokeWidth={0.45}
        />
      ))}
    </svg>
  );
}
