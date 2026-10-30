import type { Id } from './core.js';

export type NotificationKind =
  | 'signup.linked' | 'signup.created' | 'signup.rejected'
  | 'profile.approved' | 'profile.rejected'
  | 'registration.submitted' | 'registration.confirmed' | 'registration.waitlisted'
  | 'registration.approved' | 'registration.rejected' | 'waitlist.promoted'
  | 'session.reminder' | 'session.cancelled' | 'run.cancelled' | 'session.rescheduled';
export type RecipientRef =
  | { kind: 'member'; memberId: Id }
  | { kind: 'signup_request'; requestId: Id };
export type NotificationEvent = {
  eventId: Id;
  kind: NotificationKind;
  recipient: RecipientRef;
  entityRefs: Record<string, Id[]>;
};

/** How staff can reach a member: by LINE, else email, else only by phone. */
export type ContactChannel = 'line' | 'email' | 'phone_only';
export type CallItem = {
  id: Id; kind: NotificationKind; kindWord: string; reason: string; memberId: Id; memberName: string;
  phone: string; text: string; createdAt: string;
};
/** Notices staff must deliver by phone, grouped by course run (`runId` null for notices about no run). */
export type CallGroup = {
  runId: Id | null; courseName: string; batchName: string; nextSessionDate: string | null; items: CallItem[];
};
