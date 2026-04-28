import { Composition } from 'remotion';
import { BlockedReel } from './BlockedReel';

const FPS = 30;
const WIDTH = 1280;
const HEIGHT = 720;
const DURATION = 240; // 8 seconds at 30fps

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="BlockedReel"
        component={BlockedReel}
        durationInFrames={DURATION}
        fps={FPS}
        width={WIDTH}
        height={HEIGHT}
      />
    </>
  );
};
