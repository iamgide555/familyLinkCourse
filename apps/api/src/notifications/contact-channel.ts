import type { ContactChannel } from '../../../../packages/contracts/src/notifications.js';

/** Mirrors the worker's choice: LINE when the linked account is reachable, else email, else staff must phone. */
export function contactChannel(member: { email: string }, line: { reachable: boolean } | null): ContactChannel {
  if (line?.reachable) return 'line';
  return member.email.trim() ? 'email' : 'phone_only';
}
