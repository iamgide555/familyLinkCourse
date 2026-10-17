import { inject } from '@angular/core';
import { Router, type CanActivateFn } from '@angular/router';
import { SessionService } from './session.service';
export const staffGuard: CanActivateFn = async () => {
  const session = inject(SessionService);
  const router = inject(Router);
  try {
    return (await session.restore())
      ? true
      : router.createUrlTree(['/staff/login'], { queryParams: { reason: 'expired' } });
  } catch {
    return router.createUrlTree(['/staff/login'], { queryParams: { reason: 'unavailable' } });
  }
};
