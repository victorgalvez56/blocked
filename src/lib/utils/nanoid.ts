import { customAlphabet } from 'nanoid';

const alphabet = '0123456789abcdefghijklmnopqrstuvwxyz';

export const shortId = customAlphabet(alphabet, 12);
export const projectId = (): string => `p_${shortId()}`;
export const jobId = (): string => `g_${shortId()}`;
