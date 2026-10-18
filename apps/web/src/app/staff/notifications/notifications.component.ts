import { Component, OnInit, inject, signal } from '@angular/core';
import { ApiClient } from '../../core/api-client';
import { SessionService } from '../../core/session.service';
import { errorText, thaiDateTime } from '../../member/shared/thai';

type Item = { id: string; kind: string; kindWord: string; status: string; channel: string; attempts: number; lastErrorCode: string | null; createdAt: string; sentAt: string | null; nextAttemptAt: string | null; recipient: string; phone: string; targetDate: string | null };
type Summary = { followUp: number; queued: number; sentThisMonth: number; delivery: 'live' | 'simulated'; linePushThisMonth?: number; lineMonthlyQuota?: number | null };
type Simulated = { notificationId: string; channel: 'line' | 'email'; recipient: string; subject: string; text: string; at: string };
const REASON: Record<string, string> = { no_channel: 'ไม่มี LINE หรืออีเมลที่ใช้ได้', line_unavailable: 'LINE ใช้ไม่ได้', no_email: 'ไม่มีอีเมล', quota: 'โควตาข้อความ LINE เต็ม', auth: 'ตั้งค่าบริการส่งข้อความไม่ถูกต้อง', network: 'เครือข่ายขัดข้อง', rate_limited: 'ส่งถี่เกินกำหนด' };

@Component({
  selector: 'fl-notifications',
  template: `<main id="main-content" class="member-workspace">
    <h1>ข้อความแจ้งเตือน</h1>
    @if (summary(); as s) {
      <p class="page-intro">
        @if (s.delivery === 'simulated') { <strong>โหมดทดสอบ:</strong> ระบบยังไม่ได้ส่งข้อความจริงไปยัง LINE หรืออีเมล ข้อความด้านล่างคือสิ่งที่จะถูกส่ง }
        @else { ระบบส่งทาง LINE ก่อน ถ้า LINE ใช้ไม่ได้หรือส่งไม่สำเร็จจึงส่งทางอีเมล และถ้าไม่มีช่องทางใดสำเร็จจะแสดงด้านล่างให้เจ้าหน้าที่ติดต่อเอง }
      </p>
      <div class="roster-counts" role="status"><span>รอส่ง <strong>{{ s.queued }}</strong></span><span>ส่งแล้ว <strong>{{ s.sentThisMonth }}</strong></span><span>ต้องติดตามเอง <strong>{{ s.followUp }}</strong></span>
        @if (s.linePushThisMonth !== undefined) { <span>LINE เดือนนี้ <strong>{{ s.linePushThisMonth }}</strong>{{ s.lineMonthlyQuota ? ' จาก ' + s.lineMonthlyQuota : ' (ยังไม่ได้ตั้งโควตา)' }}</span> }</div>
    }
    @if (message()) { <p class="notice notice-success" role="status">{{ message() }}</p> }
    @if (error()) { <p class="notice notice-error" role="alert">{{ error() }}</p> }
    <section class="intake-section" aria-labelledby="fu-h">
      <h2 id="fu-h">ข้อความที่ต้องติดตามเอง ({{ items().length }})</h2>
      <p class="section-intro">ข้อความเหล่านี้ส่งไม่สำเร็จทุกช่องทาง โทรแจ้งสมาชิกหรือผู้ปกครองเอง แล้วกด “ติดต่อแล้ว” หรือแก้ข้อมูลติดต่อแล้วกด “ส่งอีกครั้ง” ระบบไม่บอกว่าผู้รับอ่านแล้วหรือไม่</p>
      @if (loading()) { <p role="status">กำลังโหลด…</p> }
      @else if (!items().length) { <p class="empty-state">ไม่มีข้อความที่ต้องติดตาม</p> }
      <ul class="doc-list">
        @for (n of items(); track n.id) {
          <li><span><strong>{{ n.recipient }}</strong> · {{ n.kindWord }}{{ n.targetDate ? ' (' + n.targetDate + ')' : '' }}<br />
            <span class="record-state">{{ n.phone ? 'โทร ' + n.phone + ' · ' : '' }}{{ reason(n.lastErrorCode) }} · {{ time(n.createdAt) }}</span></span>
            <span class="doc-actions"><button type="button" class="button-primary" [disabled]="busy()" (click)="act(n, 'resolve')">ติดต่อแล้ว</button><button type="button" class="button-secondary" [disabled]="busy()" (click)="act(n, 'retry')">ส่งอีกครั้ง</button></span></li>
        }
      </ul>
    </section>
    @if (simulated().length || summary()?.delivery === 'simulated') {
      <section class="intake-section" aria-labelledby="sim-h">
        <h2 id="sim-h">ข้อความจำลอง (โหมดทดสอบ)</h2>
        <p class="section-intro">ระบบรอบส่งทุก 15 วินาที ข้อความจะแสดงที่นี่หลังจากนั้น</p>
        <div class="form-actions"><button type="button" class="button-secondary" (click)="loadSimulated()">โหลดใหม่</button><button type="button" class="button-secondary" (click)="clearSimulated()">ล้างรายการ</button></div>
        @if (!simulated().length) { <p class="empty-state">ยังไม่มีข้อความจำลอง</p> }
        <ul class="doc-list">@for (m of simulated(); track $index) { <li><span><strong>{{ m.channel === 'line' ? 'LINE' : 'อีเมล' }} → {{ m.recipient }}</strong> · {{ time(m.at) }}<br />{{ m.text }}</span></li> }</ul>
      </section>
    }
  </main>`,
})
export class NotificationsComponent implements OnInit {
  private readonly api = inject(ApiClient);
  readonly session = inject(SessionService);
  readonly items = signal<Item[]>([]);
  readonly summary = signal<Summary | null>(null);
  readonly simulated = signal<Simulated[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly time = thaiDateTime;
  reason(code: string | null) { return (code && REASON[code]) || (code ? `รหัส ${code}` : 'ไม่ทราบสาเหตุ'); }
  async ngOnInit() { await this.load(); }
  async load() {
    this.loading.set(true); this.error.set('');
    try {
      const [summary, list] = await Promise.all([this.api.request<Summary>('/notifications/summary'), this.api.request<{ items: Item[] }>('/notifications')]);
      this.summary.set(summary); this.items.set(list.items);
      if (summary.delivery === 'simulated') await this.loadSimulated();
    } catch (e) { this.error.set(errorText(e)); } finally { this.loading.set(false); }
  }
  async loadSimulated() { try { this.simulated.set((await this.api.request<{ items: Simulated[] }>('/notifications/simulated')).items); } catch { this.simulated.set([]); } }
  async clearSimulated() { try { await this.api.request('/notifications/simulated/clear', 'POST', {}); this.simulated.set([]); } catch (e) { this.error.set(errorText(e)); } }
  async act(n: Item, kind: 'resolve' | 'retry') {
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await this.api.request(`/notifications/${n.id}/${kind}`, 'POST', {}); this.message.set(kind === 'resolve' ? 'บันทึกว่าติดต่อแล้ว' : 'จัดคิวส่งอีกครั้งแล้ว'); await this.load(); }
    catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
}
