import { Config } from '@remotion/cli/config';
import path from 'path';

Config.setVideoImageFormat('jpeg');
Config.setConcurrency(1);
// Three.js needs ANGLE for headless WebGL — see https://www.remotion.dev/docs/three
Config.setChromiumOpenGlRenderer('angle');

Config.overrideWebpackConfig((current) => ({
  ...current,
  resolve: {
    ...current.resolve,
    alias: {
      ...(current.resolve?.alias ?? {}),
      '@': path.resolve(process.cwd(), 'src'),
    },
  },
}));
