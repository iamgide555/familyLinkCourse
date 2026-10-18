/**
 * Scrubbing for anything that leaves the server as telemetry (Sentry `beforeSend`, log shippers).
 * Member data, credentials and request bodies must never be transmitted: keys that can hold them are dropped
 * outright, and free text is masked for citizen IDs, emails, phone numbers and token-like strings.
 */
const SENSITIVE_KEY = /pass|secret|token|authorization|cookie|csrf|session|citizen|national|income|disab|answer|body|note|reason|address|phone|email|birth|(first|last|full|display|member|user)name|consent|key|signature|text|snapshot|submitted/i;
const MASKS: Array<[RegExp, string]> = [
  [/\b(pass(?:word|wd)?|pwd|secret|token|api[-_]?key|authorization)\s*[=:]\s*\S+/gi, '$1=[removed]'],
  [/\b\d{13}\b/g, '[id-number]'],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[email]'],
  [/\b0[689]\d{8}\b/g, '[phone]'],
  [/\b(?:Bearer\s+)?[A-Za-z0-9_-]{32,}\b/g, '[token]'],
];
export function scrub<T>(value: T, depth = 0): T {
  if (depth > 8) return '[depth]' as unknown as T;
  if (typeof value === 'string') return MASKS.reduce((text: string, [pattern, mask]) => text.replace(pattern, mask), value as string) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1)) as unknown as T;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, v]) => [key, SENSITIVE_KEY.test(key) ? '[removed]' : scrub(v, depth + 1)])) as T;
  }
  return value;
}
/** Shape of a Sentry-style event: only the error type, a masked message and a code-only stack survive. */
export function scrubEvent(event: { message?: string; exception?: unknown; request?: unknown; user?: unknown; extra?: unknown; breadcrumbs?: unknown; contexts?: unknown }): { message?: string; exception?: unknown } {
  return { ...(event.message ? { message: scrub(event.message) } : {}), ...(event.exception ? { exception: scrub(event.exception) } : {}) };
}
