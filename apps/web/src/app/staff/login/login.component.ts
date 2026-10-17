import { Component, ElementRef, ViewChild, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { SessionService } from '../../core/session.service';
@Component({
  selector: 'fl-login',
  templateUrl: './login.component.html',
  styleUrl: './login.component.css',
})
export class LoginComponent {
  private readonly session = inject(SessionService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  @ViewChild('emailInput') emailInput!: ElementRef<HTMLInputElement>;
  @ViewChild('passwordInput') passwordInput!: ElementRef<HTMLInputElement>;
  readonly email = signal('');
  readonly password = signal('');
  readonly showPassword = signal(false);
  readonly busy = signal(false);
  readonly emailError = signal('');
  readonly passwordError = signal('');
  readonly error = signal(
    this.route.snapshot.queryParamMap.get('reason') === 'expired'
      ? 'หมดเวลาใช้งาน กรุณาเข้าสู่ระบบอีกครั้ง'
      : this.route.snapshot.queryParamMap.get('reason') === 'unavailable'
        ? 'ยังเชื่อมต่อระบบไม่ได้ กรุณาลองเข้าสู่ระบบอีกครั้ง'
        : '',
  );
  async submit(event: Event): Promise<void> {
    event.preventDefault();
    if (this.busy()) return;
    const email = this.email().trim();
    this.emailError.set(
      !email
        ? 'กรุณากรอกอีเมล'
        : !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
          ? 'กรุณาตรวจสอบรูปแบบอีเมล เช่น name@example.com'
          : '',
    );
    this.passwordError.set(this.password() ? '' : 'กรุณากรอกรหัสผ่าน');
    this.error.set('');
    if (this.emailError()) {
      this.emailInput.nativeElement.focus();
      return;
    }
    if (this.passwordError()) {
      this.passwordInput.nativeElement.focus();
      return;
    }
    this.busy.set(true);
    try {
      await this.session.login(email, this.password());
      this.password.set('');
      await this.router.navigate(['/staff']);
    } catch (error) {
      this.error.set(
        error instanceof Error ? error.message : 'เข้าสู่ระบบไม่สำเร็จ กรุณาลองอีกครั้ง',
      );
    } finally {
      this.busy.set(false);
    }
  }
}
