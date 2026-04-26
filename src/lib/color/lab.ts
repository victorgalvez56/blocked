export type RGB = readonly [number, number, number];
export type LAB = readonly [L: number, a: number, b: number];

const D65 = { x: 95.047, y: 100, z: 108.883 };

export function rgbToLab([r, g, b]: RGB): LAB {
  const srgb = [r, g, b].map((v) => v / 255);
  const linear = srgb.map((v) =>
    v > 0.04045 ? Math.pow((v + 0.055) / 1.055, 2.4) : v / 12.92,
  );
  const [lr, lg, lb] = linear;
  const x = (lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375) * 100;
  const y = (lr * 0.2126729 + lg * 0.7151522 + lb * 0.072175) * 100;
  const z = (lr * 0.0193339 + lg * 0.119192 + lb * 0.9503041) * 100;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x / D65.x);
  const fy = f(y / D65.y);
  const fz = f(z / D65.z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

export function ciede2000([L1, a1, b1]: LAB, [L2, a2, b2]: LAB): number {
  const avgL = (L1 + L2) / 2;
  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const avgC = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(avgC ** 7 / (avgC ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);
  const avgCp = (C1p + C2p) / 2;
  const h1p = (Math.atan2(b1, a1p) * 180) / Math.PI;
  const h2p = (Math.atan2(b2, a2p) * 180) / Math.PI;
  const h1pn = h1p < 0 ? h1p + 360 : h1p;
  const h2pn = h2p < 0 ? h2p + 360 : h2p;
  const dhp =
    Math.abs(h1pn - h2pn) <= 180
      ? h2pn - h1pn
      : h2pn <= h1pn
        ? h2pn - h1pn + 360
        : h2pn - h1pn - 360;
  const dLp = L2 - L1;
  const dCp = C2p - C1p;
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp / 2) * (Math.PI / 180));
  const avgHp =
    Math.abs(h1pn - h2pn) > 180 ? (h1pn + h2pn + 360) / 2 : (h1pn + h2pn) / 2;
  const T =
    1 -
    0.17 * Math.cos(((avgHp - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * avgHp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * avgHp + 6) * Math.PI) / 180) -
    0.2 * Math.cos(((4 * avgHp - 63) * Math.PI) / 180);
  const SL = 1 + (0.015 * (avgL - 50) ** 2) / Math.sqrt(20 + (avgL - 50) ** 2);
  const SC = 1 + 0.045 * avgCp;
  const SH = 1 + 0.015 * avgCp * T;
  const dTheta = 30 * Math.exp(-(((avgHp - 275) / 25) ** 2));
  const RC = 2 * Math.sqrt(avgCp ** 7 / (avgCp ** 7 + 25 ** 7));
  const RT = -RC * Math.sin((2 * dTheta * Math.PI) / 180);
  return Math.sqrt(
    (dLp / SL) ** 2 + (dCp / SC) ** 2 + (dHp / SH) ** 2 + RT * (dCp / SC) * (dHp / SH),
  );
}

export function weightedRgbDistance(a: RGB, b: RGB): number {
  const rmean = (a[0] + b[0]) / 2;
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(
    (((512 + rmean) * dr * dr) >> 8) + 4 * dg * dg + (((767 - rmean) * db * db) >> 8),
  );
}
