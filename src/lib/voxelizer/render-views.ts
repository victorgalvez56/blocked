'use client';

import * as THREE from 'three';

export type ViewKey = 'front' | 'side' | 'back' | 'top';

export interface RenderedView {
  key: ViewKey;
  dataUrl: string;
  image: HTMLImageElement;
}

const VIEW_DIRECTIONS: Record<ViewKey, { dir: [number, number, number]; up: [number, number, number] }> = {
  // Each entry: camera position relative to center (normalized) + camera up vector.
  // Conventions match the multi-view voxelizer in src/lib/voxelizer/multiview.ts:
  //   - Front: subject faces camera (camera at +Z, up=+Y)
  //   - Side: right profile, subject's front faces image-left (camera at +X, up=+Y)
  //   - Back: subject from behind, mirrored x (camera at -Z, up=+Y)
  //   - Top: bird's-eye, subject's front at image bottom (camera at +Y, up=-Z)
  front: { dir: [0, 0, 1], up: [0, 1, 0] },
  side: { dir: [1, 0, 0], up: [0, 1, 0] },
  back: { dir: [0, 0, -1], up: [0, 1, 0] },
  top: { dir: [0, 1, 0], up: [0, 0, -1] },
};

export async function renderMeshTo4Views(
  scene: THREE.Object3D,
  resolution = 512,
): Promise<Record<ViewKey, RenderedView>> {
  const canvas = document.createElement('canvas');
  canvas.width = resolution;
  canvas.height = resolution;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    preserveDrawingBuffer: true,
    alpha: false,
  });
  renderer.setSize(resolution, resolution);
  renderer.setPixelRatio(1);
  renderer.setClearColor(0xffffff, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const renderScene = new THREE.Scene();
  renderScene.background = new THREE.Color(0xffffff);

  // Clone so we don't mutate the original scene
  const sceneClone = scene.clone(true);
  sceneClone.updateMatrixWorld(true);
  renderScene.add(sceneClone);

  // Bright even lighting → minimal baked shadows in the silhouette/color
  renderScene.add(new THREE.AmbientLight(0xffffff, 1.0));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
  dirLight.position.set(1, 1, 1);
  renderScene.add(dirLight);
  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
  dirLight2.position.set(-1, -0.5, -1);
  renderScene.add(dirLight2);

  // Compute world-space bbox of subject
  const bbox = new THREE.Box3().setFromObject(sceneClone);
  const size = new THREE.Vector3();
  bbox.getSize(size);
  const center = new THREE.Vector3();
  bbox.getCenter(center);
  const maxDim = Math.max(size.x, size.y, size.z);
  if (maxDim === 0) {
    renderer.dispose();
    throw new Error('mesh has zero bounding volume');
  }

  // Orthographic camera — clean silhouettes, no perspective foreshortening
  const halfSize = maxDim * 0.58;
  const camera = new THREE.OrthographicCamera(
    -halfSize,
    halfSize,
    halfSize,
    -halfSize,
    0.01,
    maxDim * 20,
  );
  const distance = maxDim * 4;

  const out: Partial<Record<ViewKey, RenderedView>> = {};

  for (const key of Object.keys(VIEW_DIRECTIONS) as ViewKey[]) {
    const v = VIEW_DIRECTIONS[key];
    const dir = new THREE.Vector3(v.dir[0], v.dir[1], v.dir[2]).normalize();
    camera.position.copy(center).addScaledVector(dir, distance);
    camera.up.set(v.up[0], v.up[1], v.up[2]);
    camera.lookAt(center);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();

    renderer.render(renderScene, camera);

    const dataUrl = canvas.toDataURL('image/png');
    const image = new Image();
    image.crossOrigin = 'anonymous';
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error(`failed to load rendered ${key} view`));
      image.src = dataUrl;
    });

    out[key] = { key, dataUrl, image };
  }

  renderer.dispose();
  return out as Record<ViewKey, RenderedView>;
}
