import type { Id } from './core.js';
import type { QuestionDefinition } from './questions.js';
export type SessionInput = { date: string; startTime: string; endTime: string; location?: string; onlineUrl?: string; capacity?: number | null };
export type CreateCourseInput = { name: string; description?: string; serviceTypeIds?: Id[] };
export type CreateRunInput = {
  batchName: string;
  location?: string;
  capacity?: number | null;
  requireApproval: boolean;
  waitlistEnabled: boolean;
  perSessionRegistration: boolean;
  registrationOpensAt?: string | null;
  registrationClosesAt?: string | null;
  cancelDeadlineDays: number;
  sessions: SessionInput[];
};
export type RunPatch = Partial<Pick<CreateRunInput, 'batchName' | 'location' | 'capacity' | 'requireApproval' | 'waitlistEnabled' | 'perSessionRegistration' | 'registrationOpensAt' | 'registrationClosesAt' | 'cancelDeadlineDays'>>;
export type SessionPatch = Partial<Pick<SessionInput, 'location' | 'onlineUrl' | 'capacity'>>;
export type RunStatus = 'active' | 'cancelled';
export type SessionRecord = {
  id: Id; dayNo: number; date: string; startTime: string; endTime: string; startsAt: string; endsAt: string;
  location: string; onlineUrl: string; capacity: number | null; status: 'scheduled' | 'cancelled';
  cancelDeadline: string | null;
  reserved: number; waiting: number; free: number | null;
};
export type RunRecord = {
  id: Id; courseId: Id; batchName: string; location: string; capacity: number | null;
  requireApproval: boolean; waitlistEnabled: boolean; perSessionRegistration: boolean;
  registrationOpensAt: string | null; registrationClosesAt: string | null; cancelDeadlineDays: number;
  status: RunStatus; structureLocked: boolean; cancelDeadline: string | null;
  reserved: number; waiting: number; free: number | null; promotionCutoff: string | null;
  sessions: SessionRecord[]; questions: QuestionDefinition[];
};
export type CourseRecord = { id: Id; name: string; description: string; serviceTypeIds: Id[]; runCount: number };
export type CourseDetail = CourseRecord & { questions: QuestionDefinition[]; runs: Array<Pick<RunRecord, 'id' | 'batchName' | 'status' | 'perSessionRegistration' | 'structureLocked'> & { firstDate: string | null; sessionCount: number }> };
export type Availability = 'available' | 'full_waitlist' | 'full_closed' | 'closed' | 'not_open' | 'cancelled';
