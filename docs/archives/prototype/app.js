/* FamilyLink prototype: shared data, storage, helpers. All data is synthetic. */
(function () {
  'use strict';

  /* ---------- storage (localStorage with in-memory fallback) ---------- */
  const mem = {};
  const store = {
    get(k, fallback) {
      try {
        const v = window.localStorage.getItem(k);
        if (v !== null) return JSON.parse(v);
      } catch (e) { /* storage blocked */ }
      return k in mem ? mem[k] : fallback;
    },
    set(k, v) {
      mem[k] = v;
      try { window.localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignore */ }
    },
    del(k) {
      delete mem[k];
      try { window.localStorage.removeItem(k); } catch (e) { /* ignore */ }
    }
  };

  /* ---------- icons (drawn, one stroke weight) ---------- */
  const svg = (body, extra) =>
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"' + (extra || '') + '>' + body + '</svg>';
  const icons = {
    check: svg('<circle cx="12" cy="12" r="9"/><path d="M8 12.5l3 3 5-6"/>'),
    clock: svg('<circle cx="12" cy="12" r="9" stroke-dasharray="3 3"/><path d="M12 7v5l3 2"/>'),
    list: svg('<path d="M8 6h12M8 12h12M8 18h12"/><path d="M4 6h.01M4 12h.01M4 18h.01"/>'),
    x: svg('<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>'),
    plus: svg('<path d="M12 5v14M5 12h14"/>'),
    minus: svg('<path d="M5 12h14"/>'),
    trash: svg('<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/>'),
    up: svg('<path d="M6 14l6-6 6 6"/>'),
    down: svg('<path d="M6 10l6 6 6-6"/>'),
    lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>'),
    copy: svg('<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 012-2h9"/>'),
    download: svg('<path d="M12 4v11M7 11l5 5 5-5M5 20h14"/>'),
    search: svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>'),
    chat: svg('<path d="M4 5h16v11H9l-5 4z"/>'),
    cal: svg('<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
    pin: svg('<path d="M12 21s7-6 7-11a7 7 0 10-14 0c0 5 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'),
    alert: svg('<path d="M12 4l9 16H3z"/><path d="M12 10v4M12 17h.01"/>'),
    chevron: svg('<path d="M9 6l6 6-6 6"/>'),
    plus2: svg('<path d="M12 5v14M5 12h14"/>'),
    book: svg('<path d="M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3z"/><path d="M5 17a3 3 0 013-3h11"/>'),
    users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M3 20a6 6 0 0112 0M16 4.5a3.5 3.5 0 010 7M21 20a6 6 0 00-4-5.6"/>'),
    chart: svg('<path d="M4 20V4M4 20h16M8 16v-5M13 16V8M18 16v-3"/>'),
    link: svg('<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>'),
    print: svg('<path d="M7 9V4h10v5M7 17H5a1 1 0 01-1-1v-5a2 2 0 012-2h12a2 2 0 012 2v5a1 1 0 01-1 1h-2"/><rect x="7" y="14" width="10" height="6"/>'),
    open: svg('<path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 01-1 1H5a1 1 0 01-1-1V7a1 1 0 011-1h5"/>')
  };
  const logo =
    '<svg viewBox="0 0 40 40" fill="none" stroke="#0a6b5a" stroke-width="4" stroke-linecap="round" aria-hidden="true" focusable="false">' +
    '<rect x="3" y="11" width="22" height="18" rx="9"/><rect x="15" y="11" width="22" height="18" rx="9" stroke="#14201d"/></svg>';

  /* ---------- reference data ---------- */
  const provinces = ['กรุงเทพมหานคร','กระบี่','กาญจนบุรี','กาฬสินธุ์','กำแพงเพชร','ขอนแก่น','จันทบุรี','ฉะเชิงเทรา','ชลบุรี','ชัยนาท','ชัยภูมิ','ชุมพร','เชียงราย','เชียงใหม่','ตรัง','ตราด','ตาก','นครนายก','นครปฐม','นครพนม','นครราชสีมา','นครศรีธรรมราช','นครสวรรค์','นนทบุรี','นราธิวาส','น่าน','บึงกาฬ','บุรีรัมย์','ปทุมธานี','ประจวบคีรีขันธ์','ปราจีนบุรี','ปัตตานี','พระนครศรีอยุธยา','พังงา','พัทลุง','พิจิตร','พิษณุโลก','เพชรบุรี','เพชรบูรณ์','แพร่','พะเยา','ภูเก็ต','มหาสารคาม','มุกดาหาร','แม่ฮ่องสอน','ยโสธร','ยะลา','ร้อยเอ็ด','ระนอง','ระยอง','ราชบุรี','ลพบุรี','ลำปาง','ลำพูน','เลย','ศรีสะเกษ','สกลนคร','สงขลา','สตูล','สมุทรปราการ','สมุทรสงคราม','สมุทรสาคร','สระแก้ว','สระบุรี','สิงห์บุรี','สุโขทัย','สุพรรณบุรี','สุราษฎร์ธานี','สุรินทร์','หนองคาย','หนองบัวลำภู','อ่างทอง','อำนาจเจริญ','อุดรธานี','อุตรดิตถ์','อุทัยธานี','อุบลราชธานี'];

  const relations = [
    { v: 'child', t: 'ดูแลบุตรหลาน' },
    { v: 'elder', t: 'ดูแลพ่อแม่หรือผู้สูงอายุ' },
    { v: 'spouse', t: 'ดูแลคู่สมรส' },
    { v: 'relative', t: 'ดูแลญาติคนอื่น' },
    { v: 'none', t: 'ยังไม่ได้เป็นผู้ดูแล แต่สนใจเข้าร่วม' }
  ];
  const relationText = Object.fromEntries(relations.map(r => [r.v, r.t]));

  const courses = ['อบรมผู้ดูแลครอบครัวเบื้องต้น', 'เทคนิคการดูแลที่บ้านสำหรับผู้ดูแล', 'กลุ่มพูดคุยแลกเปลี่ยนผู้ดูแล'];

  const questionTypes = [
    { v: 'short', t: 'ข้อความสั้น' },
    { v: 'long', t: 'ข้อความยาว' },
    { v: 'radio', t: 'เลือกได้ข้อเดียว' },
    { v: 'checkbox', t: 'เลือกได้หลายข้อ' },
    { v: 'dropdown', t: 'รายการแบบเลื่อนลง' },
    { v: 'date', t: 'วันที่' }
  ];

  /* ---------- default run ---------- */
  function isoDay(offset) {
    const d = new Date(2026, 10, 7 + offset); // 7 Nov 2026
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  const defaultRun = () => ({
    id: 'run-12',
    slug: 'r12-k7m2',
    course: courses[0],
    batch: 'รุ่นที่ 12',
    location: 'ห้องประชุมใหญ่ (สถานที่ตัวอย่าง) กรุงเทพฯ',
    capacity: 40,
    opens: '2026-10-01',
    closes: '2026-10-30',
    requireApproval: true,
    waitlist: true,
    emailField: true,
    status: 'open',
    published: true,
    sessions: [
      { date: isoDay(0), start: '09:00', end: '16:00', place: '' },
      { date: isoDay(1), start: '09:00', end: '16:00', place: '' },
      { date: isoDay(2), start: '09:00', end: '12:00', place: '' }
    ],
    questions: [
      { id: 'q1', label: 'ท่านเคยเข้าร่วมอบรมกับ FamilyLink มาก่อนหรือไม่', type: 'radio', options: ['เคย', 'ยังไม่เคย'], required: true },
      { id: 'q2', label: 'มีเรื่องที่อยากให้ทีมงานเตรียมให้ท่านไหม เช่น รถเข็น หรือที่นั่งใกล้ทางเข้า', type: 'long', options: [], required: false, hint: 'โปรดไม่ระบุข้อมูลสุขภาพโดยละเอียด' }
    ]
  });

  /* ---------- synthetic registrations ---------- */
  const seedPeople = [
    ['นภัสสร ศรีสุข', '081-000-0101', 'นนทบุรี', 2515, 'child', 'line', 'approved', 3, 2],
    ['วิชัย ทองดี', '082-000-0102', 'กรุงเทพมหานคร', 2508, 'elder', 'link', 'approved', 1, 1],
    ['ปิยะนุช แก้วใส', '083-000-0103', 'ปทุมธานี', 2520, 'child', 'line', 'approved', 3, 0],
    ['สมศักดิ์ รักษา', '084-000-0104', 'สมุทรปราการ', 2501, 'spouse', 'link', 'approved', 1, 3],
    ['อรุณี พงษ์ไทย', '085-000-0105', 'ชลบุรี', 2512, 'elder', 'line', 'approved', 4, 1],
    ['ธนากร สุวรรณ', '086-000-0106', 'นครปฐม', 2525, 'child', 'link', 'approved', 5, 0],
    ['ศิริพร บุญมา', '087-000-0107', 'เชียงใหม่', 2504, 'spouse', 'line', 'approved', 5, 2],
    ['กิตติ ใจเย็น', '088-000-0108', 'ขอนแก่น', 2510, 'relative', 'link', 'approved', 6, 0],
    ['มาลี ดวงจันทร์', '089-000-0109', 'กรุงเทพมหานคร', 2518, 'child', 'line', 'approved', 6, 1],
    ['สุรชัย เพชรรัตน์', '081-000-0110', 'ราชบุรี', 2499, 'elder', 'walkin', 'approved', 7, 0],
    ['จันทร์เพ็ญ สายทอง', '082-000-0111', 'พระนครศรีอยุธยา', 2522, 'child', 'line', 'approved', 7, 0],
    ['ประสิทธิ์ วงศ์สกุล', '083-000-0112', 'กรุงเทพมหานคร', 2507, 'spouse', 'link', 'approved', 8, 1],
    ['รัตนา มีสุข', '084-000-0113', 'สระบุรี', 2516, 'child', 'line', 'approved', 8, 0],
    ['อนุชา พรหมมา', '085-000-0114', 'นครราชสีมา', 2511, 'relative', 'link', 'approved', 9, 0],
    ['พรทิพย์ ใจกว้าง', '086-000-0115', 'อุบลราชธานี', 2503, 'elder', 'line', 'approved', 9, 2],
    ['เกษม สว่างวงศ์', '087-000-0116', 'สงขลา', 2509, 'spouse', 'link', 'approved', 10, 0],
    ['ลลิตา นิลวรรณ', '088-000-0117', 'ภูเก็ต', 2523, 'child', 'line', 'approved', 11, 0],
    ['บุญเลิศ คงเจริญ', '089-000-0118', 'กรุงเทพมหานคร', 2506, 'elder', 'link', 'approved', 12, 1],
    ['ชนิดา วัฒนา', '081-000-0119', 'นนทบุรี', 2519, 'child', 'line', 'submitted', 13, 0],
    ['ทวีศักดิ์ อินทร์แก้ว', '082-000-0120', 'ปทุมธานี', 2514, 'relative', 'link', 'submitted', 13, 0],
    ['สุภาพร ขวัญใจ', '083-000-0121', 'เพชรบุรี', 2505, 'spouse', 'line', 'submitted', 14, 0],
    ['ณัฐวุฒิ ปราณี', '084-000-0122', 'กรุงเทพมหานคร', 2521, 'child', 'link', 'submitted', 14, 0],
    ['วันเพ็ญ จันทรา', '085-000-0123', 'ลพบุรี', 2500, 'elder', 'line', 'submitted', 15, 0],
    ['ไพโรจน์ สุขสวัสดิ์', '086-000-0124', 'ตรัง', 2513, 'none', 'link', 'cancelled', 15, 0]
  ];
  function seedRegistrations() {
    const base = Date.now() - 17 * 43200000;
    return seedPeople.map((p, i) => ({
      id: 'reg-' + (i + 1),
      no: i + 1,
      name: p[0], phone: p[1], province: p[2], birthYear: p[3], relation: p[4], source: p[5], status: p[6],
      email: '',
      at: new Date(base + p[7] * 43200000 + i * 1700000).toISOString(),
      priorRuns: p[8],
      answers: { q1: p[8] > 0 ? 'เคย' : 'ยังไม่เคย', q2: i === 3 ? 'ต้องการที่นั่งใกล้ทางเข้า' : '' },
      consentAt: new Date(base + p[7] * 43200000 + i * 1700000).toISOString(),
      newsConsent: i % 3 === 0
    }));
  }

  /* ---------- state accessors ---------- */
  const KEYS = { run: 'fl_run_v1', regs: 'fl_regs_v1', agenda: 'fl_agenda_v1' };
  function getRun() { return store.get(KEYS.run, null) || defaultRun(); }
  function setRun(r) { store.set(KEYS.run, r); }
  function getRegs() {
    let r = store.get(KEYS.regs, null);
    if (!r) { r = seedRegistrations(); store.set(KEYS.regs, r); }
    return r;
  }
  function setRegs(r) { store.set(KEYS.regs, r); }
  function resetAll() { store.del(KEYS.run); store.del(KEYS.regs); store.del(KEYS.agenda); }

  /* seats: approved + submitted count against capacity */
  function seatCounts(regs, run) {
    const c = { approved: 0, submitted: 0, waitlist: 0, cancelled: 0 };
    regs.forEach(r => { c[r.status] = (c[r.status] || 0) + 1; });
    c.taken = c.approved + c.submitted;
    c.free = Math.max(0, run.capacity - c.taken);
    return c;
  }

  /* ---------- formatting ---------- */
  const dFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', year: 'numeric' });
  const dLong = new Intl.DateTimeFormat('th-TH', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const dtFmt = new Intl.DateTimeFormat('th-TH', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
  const fmtDate = s => (s ? dFmt.format(parseDay(s)) : '—');
  const fmtDateLong = s => (s ? dLong.format(parseDay(s)) : '—');
  const fmtDateTime = iso => dtFmt.format(new Date(iso)) + ' น.';
  const pad3 = n => String(n).padStart(3, '0');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const normPhone = s => String(s).replace(/[^0-9]/g, '');
  const prettyPhone = s => { const d = normPhone(s); return d.length === 10 ? d.slice(0, 3) + '-' + d.slice(3, 6) + '-' + d.slice(6) : s; };
  const sourceText = { line: 'LINE', link: 'ลิงก์', walkin: 'Walk-in' };
  const statusMeta = {
    approved: { t: 'ยืนยันแล้ว', icon: icons.check, cls: 'pill-approved' },
    submitted: { t: 'รอยืนยัน', icon: icons.clock, cls: 'pill-submitted' },
    waitlist: { t: 'สำรอง', icon: icons.list, cls: 'pill-waitlist' },
    cancelled: { t: 'ยกเลิก', icon: icons.x, cls: 'pill-cancelled' }
  };
  const pill = st => '<span class="pill ' + statusMeta[st].cls + '">' + statusMeta[st].icon + statusMeta[st].t + '</span>';
  const runLink = run => 'familylink.example/r/' + run.slug;

  /* ---------- sample QR (decorative, clearly a sample) ---------- */
  function qrSvg(seedStr, size) {
    const n = 25; let h = 2166136261;
    for (let i = 0; i < seedStr.length; i++) { h ^= seedStr.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    const rnd = () => { h ^= h << 13; h >>>= 0; h ^= h >> 17; h ^= h << 5; h >>>= 0; return h / 4294967296; };
    const inFinder = (x, y) => (x < 8 && y < 8) || (x >= n - 8 && y < 8) || (x < 8 && y >= n - 8);
    let cells = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      if (inFinder(x, y)) continue;
      if (rnd() > 0.52) cells += '<rect x="' + x + '" y="' + y + '" width="1" height="1"/>';
    }
    const finder = (fx, fy) => '<rect x="' + (fx + 0.5) + '" y="' + (fy + 0.5) + '" width="6" height="6" fill="none" stroke="#14201d" stroke-width="1"/><rect x="' + (fx + 2) + '" y="' + (fy + 2) + '" width="3" height="3"/>';
    return '<svg viewBox="-1 -1 ' + (n + 2) + ' ' + (n + 2) + '" width="' + size + '" height="' + size + '" fill="#14201d" shape-rendering="crispEdges" role="img" aria-label="คิวอาร์โค้ดตัวอย่าง ใช้สแกนไม่ได้"><rect x="-1" y="-1" width="' + (n + 2) + '" height="' + (n + 2) + '" fill="#fff"/>' + cells + finder(0, 0) + finder(n - 7.99, 0) + finder(0, n - 7.99) + '</svg>';
  }

  /* ---------- toast ---------- */
  function toast(msg) {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      wrap.setAttribute('role', 'status');
      wrap.setAttribute('aria-live', 'polite');
      document.body.appendChild(wrap);
    }
    const t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = icons.check + '<span>' + esc(msg) + '</span>';
    wrap.innerHTML = '';
    wrap.appendChild(t);
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { t.classList.add('out'); setTimeout(() => t.remove(), 260); }, 2600);
  }

  function copyText(text, okMsg) {
    const done = () => toast(okMsg || 'คัดลอกแล้ว');
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, () => { fallbackCopy(text); done(); });
    } else { fallbackCopy(text); done(); }
  }
  function fallbackCopy(text) {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) { /* ignore */ }
    ta.remove();
  }

  /* ---------- shell: prototype strip + admin rail ---------- */
  function mountStrip(where) {
    const el = document.createElement('div');
    el.className = 'proto-strip on-dark no-print';
    el.innerHTML =
      '<span>ต้นแบบสำหรับหารือ · ข้อมูลทั้งหมดเป็นข้อมูลจำลอง</span>' +
      '<a href="index.html">กลับหน้าหลักต้นแบบ</a><span class="spacer"></span>' +
      '<button type="button" id="resetData">รีเซ็ตข้อมูลตัวอย่าง</button>';
    document.body.insertBefore(el, document.body.firstChild);
    el.querySelector('#resetData').addEventListener('click', () => {
      resetAll();
      toast('รีเซ็ตแล้ว กำลังโหลดใหม่');
      setTimeout(() => location.reload(), 500);
    });
  }
  function railHtml(active) {
    const item = (href, key, icon, text) =>
      '<a href="' + href + '"' + (active === key ? ' aria-current="page"' : '') + '>' + icon + text + '</a>';
    return '<a class="brand" href="index.html">' + logo + 'FamilyLink</a>' +
      '<p class="org">Thai FamilyLink Association<br>พื้นที่ทำงานของทีมงาน</p>' +
      '<nav class="nav" aria-label="เมนูหลัก">' +
      item('create-run.html', 'create', icons.plus2, 'เปิดรอบอบรม') +
      item('registrations.html', 'list', icons.users, 'รายชื่อผู้สมัคร') +
      '<span class="nav-item" aria-disabled="true">' + icons.book + 'ผู้เข้าร่วม<span class="soon">ถัดไป</span></span>' +
      '<span class="nav-item" aria-disabled="true">' + icons.chart + 'รายงาน<span class="soon">ถัดไป</span></span>' +
      '</nav>' +
      '<div class="who"><strong>ผู้ใช้ตัวอย่าง</strong><br>บทบาท: ผู้ดูแลองค์กร</div>';
  }
  function mountRail(active) {
    const rail = document.getElementById('rail');
    if (rail) rail.innerHTML = railHtml(active);
  }

  window.FL = {
    store, icons, logo, provinces, relations, relationText, courses, questionTypes,
    defaultRun, getRun, setRun, getRegs, setRegs, resetAll, seatCounts,
    fmtDate, fmtDateLong, fmtDateTime, parseDay, pad3, esc, normPhone, prettyPhone, sourceText, statusMeta, pill, runLink,
    qrSvg, toast, copyText, mountStrip, mountRail, KEYS
  };
})();
