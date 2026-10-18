import { Inject, Injectable } from '@nestjs/common';
import { APP_CONFIG, type ApplicationConfig } from '../config/config.js';

export type IdTokenClaims = { sub: string; name?: string };
/** Thin client for the few LINE endpoints the backend calls. Tokens and secrets are never logged. */
@Injectable()
export class LineApiClient {
  constructor(@Inject(APP_CONFIG) private readonly config: ApplicationConfig) {}
  get configured(): boolean { return !!this.config.line; }
  /** Server-side LIFF ID token verification; the browser's own claim of a user id is never trusted. */
  async verifyIdToken(idToken: string, now: Date = new Date()): Promise<IdTokenClaims | null> {
    const line = this.config.line;
    if (!line || !idToken || idToken.length > 4000) return null;
    let response: Response;
    try {
      response = await fetch(`${line.apiBase}/oauth2/v2.1/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ id_token: idToken, client_id: line.loginChannelId }), signal: AbortSignal.timeout(8000),
      });
    } catch { return null; }
    if (!response.ok) return null;
    const claims = (await response.json().catch(() => null)) as { iss?: string; sub?: string; aud?: string; exp?: number; name?: string } | null;
    if (!claims || claims.iss !== 'https://access.line.me' || claims.aud !== line.loginChannelId || typeof claims.sub !== 'string' || !claims.sub || typeof claims.exp !== 'number' || claims.exp * 1000 <= now.getTime()) return null;
    return { sub: claims.sub, ...(claims.name ? { name: claims.name } : {}) };
  }
  private auth(): Record<string, string> { return { Authorization: `Bearer ${this.config.line!.channelAccessToken}` }; }
  async linkRichMenu(lineUserId: string, richMenuId: string): Promise<boolean> {
    try {
      const r = await fetch(`${this.config.line!.apiBase}/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu/${encodeURIComponent(richMenuId)}`, { method: 'POST', headers: this.auth(), signal: AbortSignal.timeout(8000) });
      return r.ok;
    } catch { return false; }
  }
  async unlinkRichMenu(lineUserId: string): Promise<boolean> {
    try {
      const r = await fetch(`${this.config.line!.apiBase}/v2/bot/user/${encodeURIComponent(lineUserId)}/richmenu`, { method: 'DELETE', headers: this.auth(), signal: AbortSignal.timeout(8000) });
      return r.ok;
    } catch { return false; }
  }
}
