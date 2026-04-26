import type { VoxelGridSnapshot } from './voxel.types';

export type BuildType = 'figure' | 'basrelief' | 'diorama';

export type GenerationStatus =
  | 'idle'
  | 'generating-image'
  | 'analyzing-image'
  | 'voxelizing'
  | 'done'
  | 'error';

export type GenerationMode = 'ai' | 'fallback';

export interface GenerationRequest {
  prompt: string;
  buildType: BuildType;
  maxBricks?: number;
  seed?: number;
  multiView?: boolean;
}

export interface GenerationResult {
  jobId: string;
  imageUrl: string;
  voxelPlan: VoxelGridSnapshot;
  promptUsed: string;
  buildType: BuildType;
  generationMode: GenerationMode;
  paletteVersion: string;
  costUsd: number;
  createdAt: number;
}

export interface GenerationJobState {
  status: GenerationStatus;
  progress: number;
  message?: string;
  result?: GenerationResult;
  error?: string;
}
