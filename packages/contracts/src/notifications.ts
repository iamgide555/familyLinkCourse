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
