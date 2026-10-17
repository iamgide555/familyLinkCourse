import type { Routes } from '@angular/router';
import { staffGuard } from './core/staff.guard';
export const routes: Routes = [
  {
    path: 'staff/login',
    loadComponent: () => import('./staff/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: 'staff',
    canActivate: [staffGuard],
    loadComponent: () => import('./staff/staff-home.component').then((m) => m.StaffHomeComponent),
  },
  { path: '', pathMatch: 'full', redirectTo: 'staff' },
  { path: '**', redirectTo: 'staff' },
];
