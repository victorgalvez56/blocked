'use client';

import { Canvas } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, useGLTF, Center } from '@react-three/drei';
import { Suspense } from 'react';

function Model({ url }: { url: string }) {
  const gltf = useGLTF(url);
  return (
    <Center>
      <primitive object={gltf.scene} />
    </Center>
  );
}

export function MeshViewer({ url }: { url: string }) {
  return (
    <Canvas shadows dpr={[1, 2]} className="block">
      <color attach="background" args={['#f2ebdd']} />
      <PerspectiveCamera makeDefault position={[3, 2, 4]} fov={42} />
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.08}
        autoRotate
        autoRotateSpeed={0.7}
      />
      <ambientLight intensity={0.55} />
      <directionalLight
        position={[5, 8, 5]}
        intensity={1.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />
      <directionalLight position={[-3, 4, -2]} intensity={0.35} color="#bbd8ff" />
      <hemisphereLight args={['#ffffff', '#988366', 0.4]} />

      <Suspense fallback={null}>
        <Model url={url} />
      </Suspense>
    </Canvas>
  );
}
