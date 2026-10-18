import { Injectable, isDevMode, signal } from '@angular/core';
import { ApiRequestError } from './api-client';

const STORAGE_KEY = 'fl-dev-line-id';
const read = (): string => {
  try { return localStorage.getItem(STORAGE_KEY) ?? ''; } catch { return ''; }
};

/**
 * Identity for member pages. In development a synthetic LINE ID stands in for LIFF; the API refuses it in
 * production, where the real LIFF ID token (M5) replaces this class's header.
 */
@Injectable({ providedIn: 'root' })
export class MemberSession {
  readonly devMode = isDevMode();
  readonly lineUserId = signal(read());
  readonly idToken = signal('');
  setIdToken(token: string): void { this.idToken.set(token); }
  set(id: string): void {
    this.lineUserId.set(id);
    try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage may be blocked */ }
  }
  clear(): void {
    this.lineUserId.set('');
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* storage may be blocked */ }
  }
  headers(): Record<string, string> {
    if (this.idToken()) return { Authorization: `Bearer ${this.idToken()}` };
    const id = this.lineUserId();
    return this.devMode && id ? { 'x-dev-line-user-id': id } : {};
  }
  get signedIn(): boolean { return !!this.idToken() || (this.devMode && !!this.lineUserId()); }
}

@Injectable({ providedIn: 'root' })
export class MemberApi {
  constructor(private readonly session: MemberSession) {}
  async request<T>(path: string, method = 'GET', body?: unknown, extra: Record<string, string> = {}, raw?: Blob): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`/api/member${path}`, {
        method,
        credentials: 'same-origin',
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(raw ? { 'Content-Type': 'application/octet-stream' } : {}),
          ...this.session.headers(),
          ...extra,
        },
        ...(raw ? { body: raw } : body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(raw ? 60000 : 15000),
      });
    } catch {
      throw new ApiRequestError(0, 'NETWORK_ERROR', 'ยังเชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiRequestError(response.status, data?.code ?? 'REQUEST_FAILED', data?.message ?? 'ระบบยังไม่สามารถทำรายการได้ กรุณาลองอีกครั้ง', data?.fields);
    return data as T;
  }
}
