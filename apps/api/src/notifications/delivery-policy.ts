/** Delays before retry 1..5: 1 minute, 5 minutes, 15 minutes, 1 hour, 6 hours. */
export const RETRY_DELAYS_MS = [60_000, 5 * 60_000, 15 * 60_000, 60 * 60_000, 6 * 60 * 60_000];
export const MAX_RETRIES = RETRY_DELAYS_MS.length;
export const LEASE_MS = 60_000;

/** After a retryable failure, attempt number `attempts` (1-based) either waits or is out of retries. */
export function nextRetry(attempts: number, now: Date): Date | null {
  if (attempts > MAX_RETRIES) return null;
  return new Date(now.getTime() + RETRY_DELAYS_MS[attempts - 1]!);
}
