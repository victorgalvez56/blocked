import type { BrickId } from './brick.types';

export type ToolId = 'add' | 'remove' | 'paint' | 'eyedrop' | 'select';

export interface ToolState {
  tool: ToolId;
  colorId: string;
  brickId: BrickId;
  rotation: 0 | 90 | 180 | 270;
}
