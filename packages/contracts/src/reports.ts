import type { Id } from './core.js';
export type DashboardSession = { sessionId: Id; runId: Id; courseName: string; batchName: string; date: string; startTime: string; endTime: string; status: 'scheduled' | 'cancelled'; registered: number; present: number; absent: number; unmarked: number };
export type DashboardRun = { runId: Id; courseName: string; batchName: string; perSession: boolean; firstDate: string | null; lastDate: string | null; confirmed: number; submitted: number; waitlisted: number; capacity: number | null };
export type DashboardSummary = {
  today: string; from: string; to: string;
  reviews: { signupRequests: number; profileChanges: number };
  followUp: { failedNotices: number };
  unsignedForms: number;
  totals: { confirmed: number; submitted: number; waitlisted: number; registeredForRange: number; attendedForRange: number };
  runs: DashboardRun[];
  sessions: DashboardSession[];
};
