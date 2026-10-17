import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import type { StaffSession, StaffUser } from '../../../../../packages/contracts/src/core';
import { ApiClient, ApiRequestError } from './api-client';
@Injectable({ providedIn: 'root' })
export class SessionService {
  private readonly api = inject(ApiClient);
  private readonly router = inject(Router);
  readonly user = signal<StaffUser | null>(null);
  async login(email: string, password: string): Promise<void> {
    this.accept(await this.api.request<StaffSession>('/auth/login', 'POST', { email, password }));
  }
  async restore(): Promise<boolean> {
    try {
      this.accept(await this.api.request<StaffSession>('/auth/session'));
      return true;
    } catch (error) {
      this.user.set(null);
      this.api.csrfToken = null;
      if (error instanceof ApiRequestError && error.status === 401) return false;
      throw error;
    }
  }
  async logout(): Promise<void> {
    await this.api.request('/auth/logout', 'POST');
    this.user.set(null);
    this.api.csrfToken = null;
    await this.router.navigate(['/staff/login']);
  }
  private accept(session: StaffSession): void {
    this.user.set(session.user);
    this.api.csrfToken = session.csrfToken;
  }
}
