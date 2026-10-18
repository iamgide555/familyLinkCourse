import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'fl-settings-hub',
  imports: [RouterLink],
  template: `<main id="main-content" class="member-workspace">
    <h1>ตั้งค่าระบบ</h1>
    <p class="page-intro">เฉพาะผู้ดูแลระบบเข้าหน้านี้ได้ การเปลี่ยนแปลงมีผลกับทุกคน และบันทึกไว้ในประวัติการใช้งาน</p>
    <ul class="member-results">
      <li><a routerLink="/staff/settings/intake"><span class="result-person"><strong>ประเภทบริการและประเภทเอกสาร</strong><span>รายการบริการที่สมาชิกเลือกตอนสมัคร และประเภทเอกสารที่แนบได้</span></span><span class="result-contact"></span><span class="result-open">เปิด<span aria-hidden="true"> →</span></span></a></li>
      <li><a routerLink="/staff/settings/membership"><span class="result-person"><strong>ประเภทสมาชิกและค่าสมาชิก</strong><span>ชื่อประเภท ค่าสมาชิก ระยะเวลา และตลอดชีพ</span></span><span class="result-contact"></span><span class="result-open">เปิด<span aria-hidden="true"> →</span></span></a></li>
      <li><a routerLink="/staff/settings/organization"><span class="result-person"><strong>ข้อความยินยอม ข้อความแจ้งเตือน และแบบฟอร์ม PDF</strong><span>ข้อความที่สมาชิกเห็น ระยะเวลาเก็บข้อมูล หัวและท้ายแบบฟอร์ม</span></span><span class="result-contact"></span><span class="result-open">เปิด<span aria-hidden="true"> →</span></span></a></li>
      <li><a routerLink="/staff/accounts"><span class="result-person"><strong>บัญชีเจ้าหน้าที่</strong><span>เพิ่ม ปิดการใช้งาน เปลี่ยนสิทธิ์ และรหัสผ่าน</span></span><span class="result-contact"></span><span class="result-open">เปิด<span aria-hidden="true"> →</span></span></a></li>
    </ul>
  </main>`,
})
export class SettingsHubComponent {}
