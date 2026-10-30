import type { BookingStatus, Id } from './core.js';
import type { Answers, QuestionDefinition } from './questions.js';
import type { Availability } from './courses.js';
import type { ContactChannel } from './notifications.js';
export type BookingInput = { runId: Id; memberId: Id; sessionIds: Id[]; answers: Answers; operationKey: string };
export type PoolOutcome = { sessionId: Id | null; status: BookingStatus | 'refused'; queuePosition: number | null };
export type BookingResult = { registrationId: Id | null; outcomes: PoolOutcome[] };
export type CancelInput = { registrationId: Id; sessionIds: Id[]; reason: string; operationKey: string };
export type EntryView = { sessionId: Id | null; date: string | null; startTime: string | null; endTime: string | null; dayNo: number | null; status: BookingStatus; queuePosition: number | null; sessionStatus: 'scheduled' | 'cancelled' | null; attendance: 'present' | 'absent' | null };
export type RegistrationView = {
  id: Id; runId: Id; memberId: Id; memberName: string; memberNumber: string; perSession: boolean;
  courseName: string; batchName: string; source: string; registeredBy: string; createdAt: string;
  entries: EntryView[]; summary: string; unsigned: boolean; contact: ContactChannel; canSelfCancel: boolean; cancelDeadline: string | null;
};
export type SnapshotView = { version: number; createdAt: string; createdBy: string; member: Record<string, unknown>; questions: QuestionDefinition[]; answers: Answers };
export type MemberRunSession = { id: Id; dayNo: number; date: string; startTime: string; endTime: string; location: string; onlineUrl: string; availability: Availability; status: 'scheduled' | 'cancelled' };
export type MemberRunView = {
  runId: Id; courseId: Id; courseName: string; description: string; batchName: string; location: string;
  perSession: boolean; requireApproval: boolean; waitlistEnabled: boolean; availability: Availability;
  sessions: MemberRunSession[]; questions: QuestionDefinition[]; cancelDeadline: string | null;
  registrationClosesAt: string | null;
};
export type WalkinInput = {
  runId: Id; memberId?: Id; member?: Record<string, unknown>; currentSessionId: Id; sessionIds: Id[];
  answers: Answers; capacityIncrease?: Array<{ sessionId: Id | null; newCapacity: number; reason: string }>;
  closedReason?: string; queueBypassReason?: string; operationKey: string;
};
export type WalkinResult = BookingResult & { memberId: Id; linkUrl: string | null; created: boolean };
