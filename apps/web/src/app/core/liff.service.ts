import { Injectable, inject } from '@angular/core';
import { MemberSession } from './member-api';

type LiffApi = { init(options: { liffId: string }): Promise<void>; isLoggedIn(): boolean; login(): void; getIDToken(): string | null };
const SDK = 'https://static.line-scdn.net/liff/edge/2/sdk.js';

/**
 * Real LINE sign-in inside the LIFF app. The ID token it obtains is sent to the API, which verifies it with LINE;
 * the browser never supplies a user id of its own.
 */
@Injectable({ providedIn: 'root' })
export class LiffService {
  private readonly session = inject(MemberSession);
  private started: Promise<void> | null = null;
  ready(): Promise<void> { return (this.started ??= this.start()); }
  private async start(): Promise<void> {
    if (this.session.devMode && this.session.signedIn) return;
    let config: { liffId: string | null; devIdentity: boolean };
    try { config = await (await fetch('/api/member/config', { credentials: 'same-origin' })).json(); } catch { return; }
    if (!config.liffId || config.devIdentity) return;
    await this.load();
    const liff = (window as unknown as { liff?: LiffApi }).liff;
    if (!liff) return;
    await liff.init({ liffId: config.liffId });
    if (!liff.isLoggedIn()) { liff.login(); return; }
    const token = liff.getIDToken();
    if (token) this.session.setIdToken(token);
  }
  private load(): Promise<void> {
    return new Promise((resolve) => {
      if ((window as unknown as { liff?: unknown }).liff) return resolve();
      const script = document.createElement('script');
      script.src = SDK; script.async = true;
      script.onload = () => resolve(); script.onerror = () => resolve();
      document.head.appendChild(script);
    });
  }
}
