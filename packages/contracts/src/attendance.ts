import type { BookingStatus, Id } from './core.js';
export type AttendanceStatus = 'present' | 'absent';
export type AttendanceRow = { memberId: Id; memberName: string; memberNumber: string; phoneMobile: string; bookingStatus: BookingStatus; attendance: AttendanceStatus | null; markedAt: string | null; unsigned: boolean };
export type Roster = { sessionId: Id; runId: Id; courseName: string; batchName: string; date: string; startTime: string; endTime: string; location: string; sessionStatus: 'scheduled' | 'cancelled'; rows: AttendanceRow[]; present: number; absent: number; unmarked: number; registered: number };
