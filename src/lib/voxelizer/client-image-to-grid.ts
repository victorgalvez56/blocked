export interface ClientVoxelizeOpts {
  resolution: number;
  backgroundThreshold: number;
  optimize: boolean;
  hollow: boolean;
  /** Multiview thickness scale, 0–100. Lower = fewer pieces. */
  density: number;
}

export const DEFAULT_OPTS: ClientVoxelizeOpts = {
  resolution: 48,
  backgroundThreshold: 50,
  optimize: true,
  hollow: true,
  density: 25,
};

export async function loadImageElement(file: File | Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  const img = new Image();
  img.crossOrigin = 'anonymous';
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('failed to load image'));
    img.src = url;
  });
  return img;
}
