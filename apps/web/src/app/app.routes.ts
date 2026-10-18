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
    canActivateChild: [staffGuard],
    loadComponent: () =>
      import('./staff/staff-layout.component').then((m) => m.StaffLayoutComponent),
    children: [
      { path: 'dashboard', loadComponent: () => import('./staff/dashboard/dashboard.component').then((m) => m.DashboardComponent) },
      { path: 'attendance', loadComponent: () => import('./staff/attendance/attendance-days.component').then((m) => m.AttendanceDaysComponent) },
      { path: 'attendance/:sessionId', loadComponent: () => import('./staff/attendance/roster.component').then((m) => m.RosterComponent) },
      { path: 'reports', loadComponent: () => import('./staff/reports/reports.component').then((m) => m.ReportsComponent) },
      { path: 'settings', pathMatch: 'full', loadComponent: () => import('./staff/settings/settings-hub.component').then((m) => m.SettingsHubComponent) },
      { path: 'settings/membership', loadComponent: () => import('./staff/memberships/tiers.component').then((m) => m.TiersComponent) },
      { path: 'settings/organization', loadComponent: () => import('./staff/settings/organization-settings.component').then((m) => m.OrganizationSettingsComponent) },
      { path: 'courses', loadComponent: () => import('./staff/courses/courses-list.component').then((m) => m.CoursesListComponent) },
      { path: 'courses/:id/runs/new', loadComponent: () => import('./staff/courses/run-form.component').then((m) => m.RunFormComponent) },
      { path: 'courses/:id', loadComponent: () => import('./staff/courses/course-detail.component').then((m) => m.CourseDetailComponent) },
      { path: 'runs/:id/walkin', loadComponent: () => import('./staff/runs/walkin.component').then((m) => m.WalkinComponent) },
      { path: 'runs/:id', loadComponent: () => import('./staff/runs/run-detail.component').then((m) => m.RunDetailComponent) },
      { path: 'accounts', loadComponent: () => import('./staff/accounts/accounts.component').then((m) => m.AccountsComponent) },
      { path: 'notifications', loadComponent: () => import('./staff/notifications/notifications.component').then((m) => m.NotificationsComponent) },
      { path: 'reviews', loadComponent: () => import('./staff/reviews/reviews.component').then((m) => m.ReviewsComponent) },
      { path: 'invites', loadComponent: () => import('./staff/invites/invites.component').then((m) => m.InvitesComponent) },
      { path: 'settings/intake', loadComponent: () => import('./staff/settings/intake-settings.component').then(m => m.IntakeSettingsComponent) },
      {
        path: '',
        pathMatch: 'full',
        loadComponent: () =>
          import('./staff/staff-home.component').then((m) => m.StaffHomeComponent),
      },
      {
        path: 'members/new',
        loadComponent: () =>
          import('./staff/members/member-form.component').then((m) => m.MemberFormComponent),
      },
      {
        path: 'members/:id/edit',
        loadComponent: () =>
          import('./staff/members/member-form.component').then((m) => m.MemberFormComponent),
      },
      {
        path: 'members/:id',
        loadComponent: () =>
          import('./staff/members/member-profile.component').then((m) => m.MemberProfileComponent),
      },
    ],
  },
  {
    path: 'member',
    loadComponent: () => import('./member/member-layout.component').then((m) => m.MemberLayoutComponent),
    children: [
      { path: 'dev', loadComponent: () => import('./member/dev-identity.component').then((m) => m.DevIdentityComponent) },
      { path: 'signup', loadComponent: () => import('./member/signup/signup.component').then((m) => m.SignupComponent) },
      { path: 'profile', loadComponent: () => import('./member/profile/profile.component').then((m) => m.MemberProfilePageComponent) },
      { path: 'courses', loadComponent: () => import('./member/courses/courses.component').then((m) => m.MemberCoursesComponent) },
      { path: 'courses/:runId', loadComponent: () => import('./member/courses/register.component').then((m) => m.MemberRegisterComponent) },
      { path: 'registrations', loadComponent: () => import('./member/registrations/registrations.component').then((m) => m.MemberRegistrationsComponent) },
      { path: 'link', loadComponent: () => import('./member/link/link.component').then((m) => m.MemberLinkComponent) },
      { path: '', pathMatch: 'full', redirectTo: 'profile' },
    ],
  },
  { path: '', pathMatch: 'full', redirectTo: 'staff' },
  { path: '**', redirectTo: 'staff' },
];
