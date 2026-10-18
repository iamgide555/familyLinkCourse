import { Injectable } from '@angular/core';
export class ApiRequestError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}
@Injectable({ providedIn: 'root' })
export class ApiClient {
  csrfToken: string | null = null;
  async request<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(this.csrfToken ? { 'X-CSRF-Token': this.csrfToken } : {}),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      });
    } catch {
      throw new ApiRequestError(
        0,
        'NETWORK_ERROR',
        'ยังเชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง',
      );
    }
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiRequestError(
        response.status,
        data?.code ?? 'REQUEST_FAILED',
        data?.message ?? 'ระบบยังไม่สามารถทำรายการได้ กรุณาลองอีกครั้ง',
        data?.fields,
      );
    return data as T;
  }
  /** Sends a file as the raw request body (used for document uploads). */
  async upload<T>(path: string, file: Blob, headers: Record<string, string> = {}): Promise<T> {
    let response: Response;
    try {
      response = await fetch(`/api${path}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/octet-stream', ...(this.csrfToken ? { 'X-CSRF-Token': this.csrfToken } : {}), ...headers },
        body: file,
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw new ApiRequestError(0, 'NETWORK_ERROR', 'ยังเชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง');
    }
    const data = await response.json().catch(() => null);
    if (!response.ok)
      throw new ApiRequestError(response.status, data?.code ?? 'REQUEST_FAILED', data?.message ?? 'ระบบยังไม่สามารถทำรายการได้ กรุณาลองอีกครั้ง', data?.fields);
    return data as T;
  }
  /** Downloads a binary response; errors are surfaced with the API's Thai message. */
  async blob(path: string, method = 'GET', body?: unknown): Promise<Blob> {
    let response: Response;
    try {
      response = await fetch(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(this.csrfToken ? { 'X-CSRF-Token': this.csrfToken } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(60000),
      });
    } catch {
      throw new ApiRequestError(0, 'NETWORK_ERROR', 'ยังเชื่อมต่อระบบไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองอีกครั้ง');
    }
    if (!response.ok) {
      const data = await response.json().catch(() => null);
      throw new ApiRequestError(response.status, data?.code ?? 'REQUEST_FAILED', data?.message ?? 'ระบบยังไม่สามารถทำรายการได้ กรุณาลองอีกครั้ง', data?.fields);
    }
    return response.blob();
  }
}
