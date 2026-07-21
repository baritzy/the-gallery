/* ===== הגלריה: ניהול הזמנות, לוגיקת פרוטוטייפ =====
   שמירה מקומית ב-localStorage (עובד גם ב-file://).
   בלי תלות חיצונית, בלי CDN.
====================================================== */

'use strict';

const STORE_KEY = 'gallery_orders_v1';
const COUNTER_KEY = 'gallery_counter_v1';
const SHOP_HOURS = 'ראשון עד חמישי 09:00 עד 19:00, שישי 09:00 עד 13:00';

/* ---------- עזרי תאריך ---------- */
// מפיק תאריך ISO לפי אזור הזמן המקומי (לא UTC), כדי שלא יזוז יום אחורה בישראל.
function localISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayISO() {
  return localISO(new Date());
}
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localISO(d);
}
function daysSince(iso) {
  if (!iso) return 0;
  const then = new Date(iso + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now - then) / 86400000);
}
function formatDate(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
}

/* ---------- כלל 10 הימים ---------- */
// מחזיר מצב דגל להזמנה: none / yellow / red. נמסר או מוכן = ללא דגל.
function flagFor(order) {
  if (order.status === 'נמסר' || order.status === 'מוכן') return 'none';
  const days = daysSince(order.date);
  if (days >= 10) return 'red';
  if (days >= 8) return 'yellow';
  return 'none';
}
function timeFlagText(order) {
  const days = daysSince(order.date);
  const flag = flagFor(order);
  const dayWord = days === 1 ? 'יום' : 'ימים';
  if (flag === 'red') return { cls: 'red', text: `${days} ${dayWord} · דורש פולואפ` };
  if (flag === 'yellow') return { cls: 'yellow', text: `${days} ${dayWord} · מתקרב לזמן` };
  if (days === 0) return { cls: '', text: 'נפתחה היום' };
  return { cls: '', text: `${days} ${dayWord} מאז הפתיחה` };
}

/* ---------- טלפון לפורמט wa.me ---------- */
function waPhone(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');
  if (digits.startsWith('972')) return digits;
  if (digits.startsWith('0')) return '972' + digits.slice(1);
  return digits;
}

/* ---------- אחסון ---------- */
function loadOrders() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* ignore */ }
  return null;
}
function saveOrders(list) {
  localStorage.setItem(STORE_KEY, JSON.stringify(list));
}
function nextOrderNumber() {
  let n = parseInt(localStorage.getItem(COUNTER_KEY) || '0', 10);
  n += 1;
  localStorage.setItem(COUNTER_KEY, String(n));
  return n;
}

/* ---------- זרעי דמו ---------- */
function seedData() {
  const seeds = [
    { num: 1041, customer: 'רונית לוי', phone: '052-4471290', date: isoDaysAgo(1),
      desc: 'צילום משפחתי בשחור לבן', frame: 'פרופיל עץ אלון טבעי', width: 40, height: 50,
      glass: true, backing: true, passepartout: false, price: 380, deposit: 100,
      notes: 'ביקשה מסגרת דקה.', status: 'חדש' },
    { num: 1039, customer: 'משפחת כהן', phone: '054-8123340', date: isoDaysAgo(4),
      desc: 'תעודת הוקרה של סבא', frame: 'זהב עתיק, פרופיל רחב', width: 30, height: 42,
      glass: true, backing: true, passepartout: true, price: 520, deposit: 250,
      notes: 'פספרטו בצבע שמנת.', status: 'בעבודה' },
    { num: 1034, customer: 'דוד אברהם', phone: '050-7729183', date: isoDaysAgo(11),
      desc: 'הדפס אבסטרקט גדול', frame: 'פרופיל שחור מט', width: 70, height: 100,
      glass: false, backing: true, passepartout: false, price: 890, deposit: 300,
      notes: 'לקוח ביקש להזדרז לפני חג.', status: 'בעבודה' },
    { num: 1037, customer: 'יעל שטרן', phone: '053-3390021', date: isoDaysAgo(6),
      desc: 'רקמה יד עתיקה', frame: 'עץ אגוז כהה', width: 25, height: 25,
      glass: true, backing: true, passepartout: true, price: 340, deposit: 340,
      notes: 'שולם במלואו מראש.', status: 'מוכן' },
    { num: 1030, customer: 'אורי בן חיים', phone: '052-9981174', date: isoDaysAgo(15),
      desc: 'פוסטר קונצרט', frame: 'אלומיניום כסוף', width: 50, height: 70,
      glass: true, backing: true, passepartout: false, price: 410, deposit: 200,
      notes: 'נמסר ושולם ב-12.07.', status: 'נמסר' },
    { num: 1040, customer: 'סטודיו נגה', phone: '077-4102255', date: isoDaysAgo(2),
      desc: 'שלוש תמונות טבע לסדרה', frame: 'פרופיל לבן נקי', width: 30, height: 40,
      glass: false, backing: true, passepartout: false, price: 690, deposit: 0,
      notes: 'לקוח עסקי, חשבונית לרו"ח.', status: 'חדש' }
  ];
  // מגדיר את המונה כך שהזמנה חדשה תמשיך מהמספר הגבוה ביותר
  localStorage.setItem(COUNTER_KEY, '1041');
  saveOrders(seeds);
  return seeds;
}

/* ---------- מצב אפליקציה ---------- */
let orders = loadOrders();
if (!orders) orders = seedData();

let currentFilter = 'all';
let currentSearch = '';
let formStatus = 'חדש';

/* ---------- אלמנטים ---------- */
const views = {
  list: document.getElementById('view-list'),
  form: document.getElementById('view-form'),
  detail: document.getElementById('view-detail')
};
const ordersContainer = document.getElementById('orders-container');
const emptyState = document.getElementById('empty-state');
const searchInput = document.getElementById('search-input');
const statusFilter = document.getElementById('status-filter');

/* ---------- ניווט בין מסכים ---------- */
function showView(name) {
  Object.keys(views).forEach((k) => { views[k].hidden = (k !== name); });
  window.scrollTo(0, 0);
}

/* ---------- רשימת הזמנות ---------- */
function statusOrderRank(s) {
  return { 'חדש': 0, 'בעבודה': 1, 'מוכן': 2, 'נמסר': 3 }[s] ?? 9;
}
function filteredOrders() {
  const q = currentSearch.trim().toLowerCase();
  return orders
    .filter((o) => currentFilter === 'all' || o.status === currentFilter)
    .filter((o) => {
      if (!q) return true;
      return (o.customer || '').toLowerCase().includes(q) ||
             (o.desc || '').toLowerCase().includes(q) ||
             String(o.num).includes(q);
    })
    .sort((a, b) => {
      // דחופים (אדום) קודם, אחר כך לפי סטטוס, אחר כך ותק
      const fa = flagFor(a) === 'red' ? 0 : 1;
      const fb = flagFor(b) === 'red' ? 0 : 1;
      if (fa !== fb) return fa - fb;
      const sr = statusOrderRank(a.status) - statusOrderRank(b.status);
      if (sr !== 0) return sr;
      return daysSince(b.date) - daysSince(a.date);
    });
}

function renderList() {
  const list = filteredOrders();
  ordersContainer.innerHTML = '';
  emptyState.hidden = list.length > 0;

  list.forEach((o) => {
    const flag = flagFor(o);
    const tf = timeFlagText(o);
    const card = document.createElement('article');
    card.className = 'order-card' + (flag === 'red' ? ' flag-red' : flag === 'yellow' ? ' flag-yellow' : '');
    card.dataset.id = o.id || o.num;
    card.innerHTML = `
      <div class="oc-top">
        <span class="status-tag status-${o.status}">${o.status}</span>
        <span class="oc-num">#${o.num}</span>
      </div>
      <h3 class="oc-name">${escapeHtml(o.customer)}</h3>
      <p class="oc-desc">${escapeHtml(o.desc || 'ללא תיאור')}</p>
      <div class="oc-bottom">
        <span class="time-flag ${tf.cls}">${tf.cls ? '<span class="dot"></span>' : ''}${tf.text}</span>
      </div>`;
    card.addEventListener('click', () => openDetail(o));
    ordersContainer.appendChild(card);
  });
}

/* ---------- טופס הזמנה ---------- */
function setFormStatus(s) {
  formStatus = s;
  document.querySelectorAll('#f-status-picker .status-opt').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.status === s);
  });
}
function calcBalance() {
  const price = parseFloat(document.getElementById('f-price').value) || 0;
  const deposit = parseFloat(document.getElementById('f-deposit').value) || 0;
  const balance = Math.max(0, price - deposit);
  document.getElementById('f-balance').textContent = balance.toLocaleString('he-IL') + ' ₪';
}
function openNewForm() {
  document.getElementById('order-form').reset();
  document.getElementById('form-title').textContent = 'הזמנה חדשה';
  document.getElementById('f-id').value = '';
  document.getElementById('f-date').value = todayISO();
  document.getElementById('f-price').value = 0;
  document.getElementById('f-deposit').value = 0;
  setFormStatus('חדש');
  calcBalance();
  showView('form');
}
function openEditForm(o) {
  document.getElementById('form-title').textContent = 'עריכת הזמנה #' + o.num;
  document.getElementById('f-id').value = o.id || o.num;
  document.getElementById('f-customer').value = o.customer || '';
  document.getElementById('f-phone').value = o.phone || '';
  document.getElementById('f-date').value = o.date || todayISO();
  document.getElementById('f-desc').value = o.desc || '';
  document.getElementById('f-frame').value = o.frame || '';
  document.getElementById('f-width').value = o.width || '';
  document.getElementById('f-height').value = o.height || '';
  document.getElementById('f-glass').checked = !!o.glass;
  document.getElementById('f-backing').checked = !!o.backing;
  document.getElementById('f-passepartout').checked = !!o.passepartout;
  document.getElementById('f-price').value = o.price || 0;
  document.getElementById('f-deposit').value = o.deposit || 0;
  document.getElementById('f-notes').value = o.notes || '';
  setFormStatus(o.status || 'חדש');
  calcBalance();
  showView('form');
}
function findById(id) {
  return orders.find((o) => String(o.id || o.num) === String(id));
}
function handleSave(e) {
  e.preventDefault();
  const customer = document.getElementById('f-customer').value.trim();
  if (!customer) {
    document.getElementById('f-customer').focus();
    showToast('נא למלא שם לקוח');
    return;
  }
  const price = parseFloat(document.getElementById('f-price').value) || 0;
  const deposit = parseFloat(document.getElementById('f-deposit').value) || 0;
  const data = {
    customer,
    phone: document.getElementById('f-phone').value.trim(),
    date: document.getElementById('f-date').value || todayISO(),
    desc: document.getElementById('f-desc').value.trim(),
    frame: document.getElementById('f-frame').value.trim(),
    width: parseFloat(document.getElementById('f-width').value) || 0,
    height: parseFloat(document.getElementById('f-height').value) || 0,
    glass: document.getElementById('f-glass').checked,
    backing: document.getElementById('f-backing').checked,
    passepartout: document.getElementById('f-passepartout').checked,
    price,
    deposit,
    balance: Math.max(0, price - deposit),
    notes: document.getElementById('f-notes').value.trim(),
    status: formStatus
  };
  const editId = document.getElementById('f-id').value;
  if (editId) {
    const existing = findById(editId);
    Object.assign(existing, data);
    saveOrders(orders);
    showToast('ההזמנה עודכנה');
    openDetail(existing);
  } else {
    const num = nextOrderNumber();
    const newOrder = Object.assign({ id: 'o' + Date.now(), num }, data);
    orders.push(newOrder);
    saveOrders(orders);
    showToast('הזמנה #' + num + ' נשמרה');
    openDetail(newOrder);
  }
}

/* ---------- תצוגת הזמנה בודדת ---------- */
function extrasText(o) {
  const parts = [];
  if (o.glass) parts.push('זכוכית');
  if (o.backing) parts.push('גב');
  if (o.passepartout) parts.push('פספרטו');
  return parts.length ? parts.join(', ') : 'ללא';
}
function sizeText(o) {
  if (!o.width && !o.height) return 'לא הוזן';
  return `${o.width || '?'} × ${o.height || '?'} ס"מ`;
}
function num(n) { return (Number(n) || 0).toLocaleString('he-IL'); }

function openDetail(o) {
  const flag = flagFor(o);
  const tf = timeFlagText(o);
  const headClass = 'detail-card head-card' + (flag === 'red' ? ' flag-red' : flag === 'yellow' ? ' flag-yellow' : '');
  document.getElementById('detail-title').textContent = 'הזמנה #' + o.num;

  const body = document.getElementById('detail-body');
  body.innerHTML = `
    <div class="${headClass}">
      <div class="dc-title">
        <h2>${escapeHtml(o.customer)}</h2>
        <span class="dc-num">#${o.num}</span>
      </div>
      <div class="dc-meta">
        <span class="status-tag status-${o.status}">${o.status}</span>
        <span class="time-flag ${tf.cls}">${tf.cls ? '<span class="dot"></span>' : ''}${tf.text}</span>
        <span>נפתחה ${formatDate(o.date)}</span>
      </div>
    </div>

    <div class="detail-card">
      <p class="card-label">שינוי סטטוס</p>
      <div class="status-picker-detail" id="detail-status-picker">
        ${['חדש', 'בעבודה', 'מוכן', 'נמסר'].map((s) =>
          `<button type="button" class="status-opt ${s === o.status ? 'is-active' : ''}" data-status="${s}">${s}</button>`
        ).join('')}
      </div>
    </div>

    <div class="detail-card">
      <p class="card-label">פרטי ההזמנה</p>
      <div class="detail-rows">
        <div class="drow"><span class="k">טלפון</span><span class="v" style="direction:ltr;text-align:right">${escapeHtml(o.phone || 'לא הוזן')}</span></div>
        <div class="drow"><span class="k">מידות</span><span class="v">${sizeText(o)}</span></div>
        <div class="drow wide"><span class="k">תיאור התמונה</span><span class="v">${escapeHtml(o.desc || 'ללא')}</span></div>
        <div class="drow wide"><span class="k">מסגרת</span><span class="v">${escapeHtml(o.frame || 'ללא')}</span></div>
        <div class="drow wide"><span class="k">תוספות</span><span class="v">${extrasText(o)}</span></div>
        ${o.notes ? `<div class="drow wide"><span class="k">הערות</span><span class="v">${escapeHtml(o.notes)}</span></div>` : ''}
      </div>
    </div>

    <div class="detail-card">
      <p class="card-label">תשלום</p>
      <div class="money-row">
        <div class="money-box"><span class="k">מחיר כולל</span><span class="v">${num(o.price)} ₪</span></div>
        <div class="money-box"><span class="k">מקדמה</span><span class="v">${num(o.deposit)} ₪</span></div>
        <div class="money-box balance"><span class="k">יתרה לתשלום</span><span class="v">${num(Math.max(0, (o.price || 0) - (o.deposit || 0)))} ₪</span></div>
      </div>
    </div>

    <div class="detail-card">
      <p class="card-label">פעולות</p>
      <div class="detail-actions">
        <button class="btn btn-wa btn-block" id="wa-copy"><span class="ico">✎</span> שלח עותק ללקוח בוואטסאפ</button>
        <button class="btn btn-ready btn-block" id="wa-ready"><span class="ico">✓</span> הודעת "ההזמנה מוכנה"</button>
        <button class="btn btn-ghost btn-block" id="edit-order">עריכת ההזמנה</button>
      </div>
    </div>`;

  // שינוי סטטוס מהמסך
  body.querySelectorAll('#detail-status-picker .status-opt').forEach((btn) => {
    btn.addEventListener('click', () => {
      o.status = btn.dataset.status;
      saveOrders(orders);
      showToast('הסטטוס עודכן ל: ' + o.status);
      openDetail(o);
    });
  });

  document.getElementById('wa-copy').addEventListener('click', () => sendWaCopy(o));
  document.getElementById('wa-ready').addEventListener('click', () => sendWaReady(o));
  document.getElementById('edit-order').addEventListener('click', () => openEditForm(o));

  showView('detail');
}

/* ---------- הודעות וואטסאפ ---------- */
function openWa(phone, message) {
  const p = waPhone(phone);
  if (!p) {
    showToast('אין מספר טלפון להזמנה זו');
    return;
  }
  const url = 'https://wa.me/' + p + '?text=' + encodeURIComponent(message);
  window.open(url, '_blank');
}
function sendWaCopy(o) {
  const lines = [
    'היי ' + o.customer + ', זה אסף מהגלריה. הנה עותק ההזמנה שלך:',
    '',
    'מספר הזמנה: ' + o.num,
    'תיאור: ' + (o.desc || 'ללא'),
    'מסגרת: ' + (o.frame || 'ללא'),
    'מידות: ' + sizeText(o),
    'תוספות: ' + extrasText(o),
    'מחיר כולל: ' + num(o.price) + ' ש"ח',
    'מקדמה ששולמה: ' + num(o.deposit) + ' ש"ח',
    'יתרה לתשלום: ' + num(Math.max(0, (o.price || 0) - (o.deposit || 0))) + ' ש"ח',
    '',
    'תודה שבחרת בהגלריה, רוטשילד 64 כפר סבא.'
  ];
  openWa(o.phone, lines.join('\n'));
}
function sendWaReady(o) {
  const msg = 'היי, זה אסף מהגלריה. ההזמנה שלך מוכנה, אפשר לבוא לקחת. שעות פתיחה: ' + SHOP_HOURS + '. נשמח לראותך.';
  openWa(o.phone, msg);
}

/* ---------- כלים כלליים ---------- */
function escapeHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
let toastTimer = null;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.hidden = true; }, 2600);
}

/* ---------- אירועים גלובליים ---------- */
document.addEventListener('click', (e) => {
  const trigger = e.target.closest('[data-action]');
  if (!trigger) return;
  const action = trigger.dataset.action;
  if (action === 'new-order') openNewForm();
  else if (action === 'back-to-list') { renderList(); showView('list'); }
});

// סינון סטטוס
statusFilter.addEventListener('click', (e) => {
  const chip = e.target.closest('.chip');
  if (!chip) return;
  currentFilter = chip.dataset.status;
  statusFilter.querySelectorAll('.chip').forEach((c) => c.classList.toggle('is-active', c === chip));
  renderList();
});

// חיפוש
searchInput.addEventListener('input', () => {
  currentSearch = searchInput.value;
  renderList();
});

// בורר סטטוס בטופס
document.getElementById('f-status-picker').addEventListener('click', (e) => {
  const opt = e.target.closest('.status-opt');
  if (opt) setFormStatus(opt.dataset.status);
});

// חישוב יתרה בזמן אמת
document.getElementById('f-price').addEventListener('input', calcBalance);
document.getElementById('f-deposit').addEventListener('input', calcBalance);

// שמירה
document.getElementById('order-form').addEventListener('submit', handleSave);

/* ---------- הפעלה ראשונית ---------- */
renderList();
showView('list');
