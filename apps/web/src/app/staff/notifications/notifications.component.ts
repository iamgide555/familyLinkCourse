import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ApiClient } from '../../core/api-client';
import { SessionService } from '../../core/session.service';
import type { CallGroup } from '../../../../../../packages/contracts/src/notifications';
import { errorText, shortDate, thaiDateTime } from '../../member/shared/thai';

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
    <section class="intake-section call-list" aria-labelledby="call-h">
      <h2 id="call-h">รายชื่อที่ต้องโทรแจ้ง ({{ callCount() }})</h2>
      <p class="section-intro">สมาชิกที่ไม่มี LINE และอีเมลที่ใช้ได้ โทรแจ้งตามข้อความด้านล่าง แล้วกด “โทรแล้ว” แยกตามคอร์ส เรียงตามวันเรียนที่ใกล้ที่สุด
        <button type="button" class="button-secondary no-print" (click)="print()" [disabled]="!callCount()">พิมพ์รายชื่อ</button></p>
      @if (!loading() && !groups().length) { <p class="empty-state">ไม่มีสมาชิกที่ต้องโทรแจ้ง</p> }
      @for (g of groups(); track g.runId ?? 'none') {
        <article class="review-item" [attr.aria-label]="g.courseName">
          <h3>{{ g.courseName }}{{ g.batchName ? ' · ' + g.batchName : '' }}</h3>
          @if (g.nextSessionDate) { <p class="record-state">เรียนครั้งถัดไป {{ date(g.nextSessionDate) }}</p> }
          <ul class="doc-list">
            @for (n of g.items; track n.id) {
              <li><span><strong>{{ n.memberName }}</strong> · @if (n.phone) { <a [attr.href]="'tel:' + n.phone">{{ n.phone }}</a> } @else { <em>ไม่มีเบอร์โทร</em> } · {{ n.kindWord }}<br />
                <span class="call-text">{{ n.text }}</span><br /><span class="record-state">{{ reason(n.reason) }} · {{ time(n.createdAt) }}</span></span>
                <span class="doc-actions no-print"><button type="button" class="button-primary" [disabled]="busy()" (click)="act(n, 'resolve')">โทรแล้ว</button><button type="button" class="button-secondary" [disabled]="busy()" (click)="act(n, 'retry')">ส่งอีกครั้ง</button></span></li>
            }
          </ul>
        </article>
      }
    </section>
    <section class="intake-section no-print" aria-labelledby="fu-h">
      <h2 id="fu-h">ข้อความอื่นที่ต้องติดตามเอง ({{ others().length }})</h2>
      <p class="section-intro">ข้อความเหล่านี้ส่งไม่สำเร็จทุกช่องทาง โทรแจ้งสมาชิกหรือผู้ปกครองเอง แล้วกด “ติดต่อแล้ว” หรือแก้ข้อมูลติดต่อแล้วกด “ส่งอีกครั้ง” ระบบไม่บอกว่าผู้รับอ่านแล้วหรือไม่</p>
      @if (loading()) { <p role="status">กำลังโหลด…</p> }
      @else if (!others().length) { <p class="empty-state">ไม่มีข้อความที่ต้องติดตาม</p> }
      <ul class="doc-list">
        @for (n of others(); track n.id) {
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
  readonly groups = signal<CallGroup[]>([]);
  readonly callCount = computed(() => this.groups().reduce((total, g) => total + g.items.length, 0));
  /** Follow-ups already on the call list are not repeated below it. */
  readonly others = computed(() => { const listed = new Set(this.groups().flatMap((g) => g.items.map((i) => i.id))); return this.items().filter((n) => !listed.has(n.id)); });
  readonly summary = signal<Summary | null>(null);
  readonly simulated = signal<Simulated[]>([]);
  readonly loading = signal(true);
  readonly busy = signal(false);
  readonly error = signal('');
  readonly message = signal('');
  readonly time = thaiDateTime;
  readonly date = shortDate;
  print() { window.print(); }
  reason(code: string | null) { return (code && REASON[code]) || (code ? `รหัส ${code}` : 'ไม่ทราบสาเหตุ'); }
  async ngOnInit() { await this.load(); }
  async load() {
    this.loading.set(true); this.error.set('');
    try {
      const [summary, list, calls] = await Promise.all([this.api.request<Summary>('/notifications/summary'), this.api.request<{ items: Item[] }>('/notifications'), this.api.request<{ groups: CallGroup[] }>('/notifications/call-list')]);
      this.summary.set(summary); this.items.set(list.items); this.groups.set(calls.groups);
      if (summary.delivery === 'simulated') await this.loadSimulated();
    } catch (e) { this.error.set(errorText(e)); } finally { this.loading.set(false); }
  }
  async loadSimulated() { try { this.simulated.set((await this.api.request<{ items: Simulated[] }>('/notifications/simulated')).items); } catch { this.simulated.set([]); } }
  async clearSimulated() { try { await this.api.request('/notifications/simulated/clear', 'POST', {}); this.simulated.set([]); } catch (e) { this.error.set(errorText(e)); } }
  async act(n: { id: string }, kind: 'resolve' | 'retry') {
    this.busy.set(true); this.error.set(''); this.message.set('');
    try { await this.api.request(`/notifications/${n.id}/${kind}`, 'POST', {}); this.message.set(kind === 'resolve' ? 'บันทึกว่าโทรแล้ว' : 'จัดคิวส่งอีกครั้งแล้ว'); await this.load(); }
    catch (e) { this.error.set(errorText(e)); } finally { this.busy.set(false); }
  }
}
