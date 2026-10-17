import { bootstrapApplication } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { provideRouter, RouterOutlet, RouterLink } from '@angular/router';
import { routes } from './app/app.routes';
@Component({
  selector: 'fl-app',
  imports: [RouterOutlet, RouterLink],
  template: ` <a class="skip-link" href="#main-content">ข้ามไปเนื้อหา</a>
    <header class="site-header">
      <a class="wordmark" routerLink="/staff" aria-label="FamilyLink หน้าหลัก"
        ><svg
          width="40"
          height="32"
          viewBox="0 0 40 32"
          aria-hidden="true"
          fill="none"
          stroke-width="3"
        >
          <rect x="2" y="7" width="23" height="18" rx="9" stroke="currentColor" />
          <rect x="15" y="7" width="23" height="18" rx="9" stroke="var(--ink)" /></svg
        ><span>FamilyLink</span></a
      ><span class="site-purpose">ระบบสำหรับเจ้าหน้าที่สมาคม</span>
    </header>
    <router-outlet />`,
})
class AppComponent {}
bootstrapApplication(AppComponent, { providers: [provideRouter(routes)] }).catch(() =>
  console.error('Unable to start FamilyLink interface'),
);
