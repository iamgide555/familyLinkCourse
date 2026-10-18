import type { Id } from './core.js';

export type CaseNote = {
  id: Id;
  memberId: Id;
  body: string;
  authorId: Id;
  authorName: string;
  currentVersion: number;
  createdAt: string;
  editedAt: string | null;
};

export type CaseNoteRevision = {
  id: Id;
  caseNoteId: Id;
  version: number;
  body: string;
  createdBy: Id;
  createdByName: string;
  createdAt: string;
};

export type CaseNoteInput = { body: string };
