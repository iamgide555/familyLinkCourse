import type { Id } from './core.js';
export type DocumentReceipt = { id: Id; kind: string; documentTypeId: Id | null; mime: string; size: number; status: 'received' | 'verified'; createdAt: string };
