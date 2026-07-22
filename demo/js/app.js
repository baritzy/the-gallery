/* =============================================================================
 * app.js  -  Router, init, ועזרי דומיין משותפים ל"הגלריה"
 * מרכיב את ה-rail / bottom bar, מנווט בין 3 המודולים, ומחזיק את פונקציות
 * העזר (כלל 10 הימים, צבעים, וואטסאפ) שכל המודולים חולקים.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery = global.Gallery || {};
  var DB = Gallery.DB;
  var SHOP = Gallery.SHOP;

  /* =========================================================================
   * אייקונים (inline SVG, ללא תלות חיצונית)
   * ======================================================================= */
  var I = {
    orders: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><rect x="7" y="7" width="10" height="10" rx="1"/></svg>',
    inventory: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/><path d="M3 8v5"/><path d="M21 8v5"/></svg>',
    reminders: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>',
    customers: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>',
    insights: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="M7 15l3-4 3 2 4-6"/></svg>',
    contact: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.9.36 1.78.7 2.6a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.48-1.27a2 2 0 0 1 2.11-.45c.82.34 1.7.57 2.6.7A2 2 0 0 1 22 16.92z"/></svg>',
    lightbulb: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5.76.76 1.23 1.52 1.41 2.5"/></svg>',
    trendUp: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 6l-9.5 9.5-5-5L1 18"/><path d="M17 6h6v6"/></svg>',
    trendDown: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 18l-9.5-9.5-5 5L1 6"/><path d="M17 18h6v-6"/></svg>',
    coins: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="6" rx="8" ry="3"/><path d="M4 6v6c0 1.66 3.58 3 8 3s8-1.34 8-3V6"/><path d="M4 12v6c0 1.66 3.58 3 8 3s8-1.34 8-3v-6"/></svg>',
    search: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    clock: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    chevron: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    wa: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.24.68-1.42 1.32-1.95 1.36-.5.05-.97.23-3.28-.68-2.77-1.09-4.53-3.92-4.67-4.1-.14-.18-1.12-1.49-1.12-2.85 0-1.36.71-2.02.96-2.3.25-.27.55-.34.73-.34.18 0 .37 0 .53.01.17.01.4-.06.62.48.24.55.79 1.9.86 2.04.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.21 1.37.27.14.43.11.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.23.61-.14.25.09 1.6.75 1.87.89.27.14.45.2.52.32.07.11.07.66-.17 1.34Z"/></svg>',
    plus: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    copy: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    alert: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"/></svg>',
    frameEmpty: '<svg viewBox="0 0 120 120" width="120" height="120" fill="none" stroke="currentColor" stroke-width="3"><rect x="12" y="12" width="96" height="96" rx="6"/><rect x="30" y="30" width="60" height="60" rx="3"/></svg>',
    receipt: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><path d="M8 7h8"/><path d="M8 11h8"/><path d="M8 15h5"/></svg>',
    wallet: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 12V8H6a2 2 0 0 1-2-2c0-1.1.9-2 2-2h12v4"/><path d="M4 6v12a2 2 0 0 0 2 2h14v-4"/><path d="M18 12a2 2 0 0 0 0 4h4v-4z"/></svg>',
    sun: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>',
    moon: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>',
    printer: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8" rx="1"/></svg>',
    finance: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 12h.01M18 12h.01"/></svg>'
  };
  Gallery.icons = I;

  /* =========================================================================
   * Theme (dark / light) - נטען מיד כדי למנוע הבזק, נשמר ב-localStorage
   * ======================================================================= */
  var THEME_KEY = 'gallery:theme';
  function storedTheme() {
    try { return global.localStorage.getItem(THEME_KEY); } catch (e) { return null; }
  }
  function systemDark() {
    return !!(global.matchMedia && global.matchMedia('(prefers-color-scheme: dark)').matches);
  }
  function resolvedTheme() {
    var s = storedTheme();
    if (s === 'dark' || s === 'light') return s;
    return systemDark() ? 'dark' : 'light';
  }
  function applyTheme(t) {
    if (document.documentElement) document.documentElement.setAttribute('data-theme', t);
  }
  function currentTheme() {
    return (document.documentElement && document.documentElement.getAttribute('data-theme')) || 'light';
  }
  function toggleTheme() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    try { global.localStorage.setItem(THEME_KEY, next); } catch (e) {}
    applyTheme(next);
    refreshThemeToggle();
  }
  applyTheme(resolvedTheme()); // ריצה מיידית בזמן טעינת הסקריפט
  function refreshThemeToggle() {
    var dark = currentTheme() === 'dark';
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (btn) {
      btn.setAttribute('aria-checked', String(dark));
      var lbl = btn.querySelector('[data-theme-label]');
      if (lbl) lbl.textContent = dark ? 'מצב כהה' : 'מצב בהיר';
      var ic = btn.querySelector('[data-theme-ico]');
      if (ic) ic.innerHTML = dark ? I.moon : I.sun;
    });
  }
  Gallery.toggleTheme = toggleTheme;

  /* =========================================================================
   * עזרי דומיין משותפים
   * ======================================================================= */
  var STATUS_LABEL = { 'new': 'חדשה', 'in-work': 'בעבודה', ready: 'מוכנה', delivered: 'נמסרה' };
  var STATUS_LIST = ['new', 'in-work', 'ready', 'delivered'];

  // אמצעי תשלום וסוגי תשלום (למערכת התשלומים)
  var PAY_METHODS = ['מזומן', 'אשראי', 'ביט', 'העברה בנקאית', "צ'ק"];
  var PAY_TYPES = ['מקדמה', 'תשלום ביניים', 'תשלום סופי'];

  /* ---- חישובי תשלום נגזרים: יתרה = מחיר פחות סכום התשלומים ---- */
  function paymentsForOrder(order, payments) {
    if (!order || !payments) return [];
    return payments.filter(function (p) { return p.orderId === order.id; });
  }
  function paidFor(order, payments) {
    return paymentsForOrder(order, payments).reduce(function (s, p) { return s + Number(p.amount || 0); }, 0);
  }
  function balanceOf(order, payments) {
    return Number(order && order.price || 0) - paidFor(order, payments);
  }
  // סטטוס תשלום נגזר: לא שולם / שולם חלקית / שולם
  function paymentStatus(order, payments) {
    var price = Number(order && order.price || 0);
    var paid = paidFor(order, payments);
    if (paid <= 0) return { key: 'unpaid', label: 'לא שולם', color: 'red' };
    if (paid < price) return { key: 'partial', label: 'שולם חלקית', color: 'orange' };
    return { key: 'paid', label: 'שולם', color: 'green' };
  }

  function daysSince(iso) {
    if (!iso) return 0;
    var then = new Date(iso).getTime();
    var now = Date.now();
    return Math.floor((now - then) / 86400000);
  }
  function dayNumber(order) {
    return Math.max(1, daysSince(order.openedAt));
  }

  // הצבע/הדחיפות של הזמנה: נגזר מכלל 10 הימים + סטטוס
  function urgency(order) {
    if (order.status === 'delivered') return { color: 'grey', level: 'delivered' };
    if (order.status === 'ready') return { color: 'green', level: 'ready' };
    var d = dayNumber(order);
    if (d >= SHOP.slaDays) return { color: 'red', level: 'late' };     // 10+
    if (d >= SHOP.slaDays - 2) return { color: 'orange', level: 'warn' }; // 8-9
    return { color: order.status === 'new' ? 'blue' : 'blue', level: 'ok' };
  }
  function displayColor(order) { return urgency(order).color; }

  // מחלקת ה-chip של מונה הימים
  function dayChipClass(order) {
    var d = dayNumber(order);
    if (d >= SHOP.slaDays) return 'late';
    if (d >= SHOP.slaDays - 2) return 'warn';
    return 'neutral';
  }

  function statusVar(color) { return 'var(--st-' + color + ')'; }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return p(d.getDate()) + '.' + p(d.getMonth() + 1) + '.' + d.getFullYear();
  }
  function fmtMoney(n) { return '₪' + Number(n || 0).toLocaleString('he-IL'); }

  function consumption(w, h) { return (Number(w || 0) + Number(h || 0)) * 2; }

  // עזר יחיד/רבים בעברית. one = הביטוי המלא ליחיד ("הזמנה אחת" / "פרופיל אחד"),
  // many = שם העצם ברבים ("הזמנות"). דוגמה: plural(1,'הזמנה אחת','הזמנות') => "הזמנה אחת".
  function plural(n, one, many) {
    n = Number(n) || 0;
    if (n === 1) return one;
    return n + ' ' + many;
  }

  // נורמליזציית טלפון ישראלי לפורמט בינלאומי עבור wa.me
  function phoneIntl(phone) {
    var digits = String(phone || '').replace(/\D/g, '');
    if (digits.indexOf('972') === 0) return digits;
    if (digits.charAt(0) === '0') return '972' + digits.slice(1);
    return digits;
  }
  function waLink(phone, text) {
    return 'https://wa.me/' + phoneIntl(phone) + '?text=' + encodeURIComponent(text);
  }

  // תבניות הודעה חתומות בשם אסף + שעות פתיחה
  function msgCopy(order) {
    return 'שלום ' + order.customerName + ', כאן ' + SHOP.owner + ' מ' + SHOP.name + '.\n' +
      'סיכום ההזמנה (מס\' ' + order.orderNo + '):\n' +
      '• תיאור: ' + (order.imageDesc || '') + '\n' +
      '• מסגרת: ' + (order.frameDesc || '') + '\n' +
      '• מידות: ' + order.width + 'x' + order.height + '\n' +
      '• מחיר: ' + fmtMoney(order.price) + ' | מקדמה: ' + fmtMoney(order.deposit) + ' | יתרה: ' + fmtMoney(order.balance) + '\n' +
      'תודה שבחרת בנו.';
  }
  function msgReady(order) {
    return 'היי ' + order.customerName + ', כאן ' + SHOP.owner + ' מ' + SHOP.name + '. ' +
      'ההזמנה שלך (מס\' ' + order.orderNo + ') מוכנה ואפשר לבוא לקחת. ' +
      'שעות הפתיחה שלנו: ' + SHOP.hours + '. ' +
      (order.balance > 0 ? 'נותרה יתרה לתשלום: ' + fmtMoney(order.balance) + '. ' : '') +
      'נשמח לראותך.';
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // צבע דו-שכבתי (placeholder) לגוון עץ הפרופיל: highlight עליון + מעבר גוון-עץ לצל.
  // משמש כדוגמית מלאי במצב דמו עד שאסף מעלה תמונות אמיתיות.
  var WOOD_BASE = {
    'אלון': '#C79A5E', 'אשור': '#D9BE93', 'ליבנה': '#E5D6B4',
    'אורן': '#E6C583', 'אגוז': '#7A4A2B', 'מייפל': '#E4C7A1'
  };
  function woodSwatch(p) {
    var color = (p && p.color) || '';
    var hex = WOOD_BASE[(p && p.woodType)] || '#C9A97E';
    if (/שחור/.test(color)) hex = '#39332D';
    else if (/לבן|קרם|שנהב|שמנת/.test(color)) hex = '#EDE5D9';
    else if (/אפור|פחם|סקנדינבי/.test(color)) hex = '#B7B8BE';
    else if (/מוזהב|זהב|שמפניה/.test(color)) hex = '#E4C476';
    else if (/כסף|פלטינה/.test(color)) hex = '#D6D9DF';
    else if (/ברונזה|מוקה|ונגה|כהה/.test(color)) hex = '#6E4A2E';
    return 'linear-gradient(140deg, rgba(255,255,255,.30), rgba(255,255,255,0) 38%),' +
           'linear-gradient(140deg, ' + hex + ' 0%, ' + hex + ' 42%, rgba(20,16,12,.42) 100%)';
  }

  Gallery.util = {
    STATUS_LABEL: STATUS_LABEL, STATUS_LIST: STATUS_LIST,
    daysSince: daysSince, dayNumber: dayNumber, urgency: urgency,
    displayColor: displayColor, dayChipClass: dayChipClass, statusVar: statusVar,
    fmtDate: fmtDate, fmtMoney: fmtMoney, consumption: consumption,
    phoneIntl: phoneIntl, waLink: waLink, msgCopy: msgCopy, msgReady: msgReady,
    esc: esc, woodSwatch: woodSwatch, plural: plural,
    PAY_METHODS: PAY_METHODS, PAY_TYPES: PAY_TYPES,
    paymentsForOrder: paymentsForOrder, paidFor: paidFor,
    balanceOf: balanceOf, paymentStatus: paymentStatus
  };

  /* =========================================================================
   * מטמון נתונים משותף (payments + orders) - למסך "סוף יום" ולפירוט הזמנה חי
   * ======================================================================= */
  var paymentsCache = [];
  var ordersCache = [];
  DB.subscribePayments(function (p) {
    paymentsCache = p;
    if (odRefresh) odRefresh(); // רענון פירוט הזמנה פתוח כשנקלט תשלום
  });
  DB.subscribeOrders(function (o) { ordersCache = o; });
  Gallery.getPaymentsCache = function () { return paymentsCache.slice(); };

  /* =========================================================================
   * מעבר ללקוח: פותח את טאב הלקוחות, מדגיש וגולל לכרטיס הלקוח
   * מקבל customerId או שם לקוח.
   * ======================================================================= */
  Gallery.openCustomer = function (idOrName) {
    if (!idOrName) return;
    switchTab('customers');
    if (Gallery.Customers && Gallery.Customers.focusCustomer) {
      Gallery.Customers.focusCustomer(idOrName);
    }
  };

  /* =========================================================================
   * מודל גנרי (backdrop + סגירה ב-Esc / קליק ברקע)
   * ======================================================================= */
  var modalHost = null;
  var odRefresh = null; // callback לרענון פירוט הזמנה פתוח (מוגדר ב-OrderDetail)
  function openModal(node) {
    closeModal();
    modalHost = document.createElement('div');
    modalHost.className = 'modal-backdrop';
    modalHost.appendChild(node);
    modalHost.addEventListener('mousedown', function (e) { if (e.target === modalHost) closeModal(); });
    document.body.appendChild(modalHost);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onEsc);
    var first = node.querySelector('input, select, textarea, button');
    if (first) first.focus();
  }
  function closeModal() {
    if (!modalHost) return;
    document.removeEventListener('keydown', onEsc);
    modalHost.remove();
    modalHost = null;
    odRefresh = null; // אין יותר פירוט הזמנה פתוח לרענן
    document.body.style.overflow = '';
  }
  function onEsc(e) { if (e.key === 'Escape') closeModal(); }
  Gallery.openModal = openModal;
  Gallery.closeModal = closeModal;

  /* =========================================================================
   * פירוט הזמנה משותף (OrderDetail) - מודל אחד שמציג את כל פרטי ההזמנה,
   * ניתן לפתיחה מכל טאב: Gallery.OrderDetail.open(orderId | orderObject)
   * ======================================================================= */
  function orderDetailNode(o) {
    var node = document.createElement('div');
    node.className = 'modal';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');

    var color = displayColor(o);
    var d = dayNumber(o);
    var chipCls = dayChipClass(o);
    var showChip = o.status !== 'delivered';

    function f(k, v, strong) {
      return '<div class="field"><div class="k">' + k + '</div><div class="v' +
        (strong ? ' strong' : '') + '">' + v + '</div></div>';
    }
    function fmono(k, v) {
      return '<div class="field"><div class="k">' + k + '</div><div class="v mono">' + v + '</div></div>';
    }
    function chk(label, on, extra) {
      return '<span class="check-tag' + (on ? ' on' : '') + '"><span class="dot"></span>' +
        label + (on && extra ? ' · ' + esc(extra) : (on ? '' : ': לא')) + '</span>';
    }

    // שם הלקוח לחיץ: מעביר לטאב לקוחות
    var custId = o.customerId || o.customerName;
    var nameLink = '<span class="link-cust" data-open-customer="' + esc(custId) + '">' + esc(o.customerName) + '</span>';

    var checks = '<div class="checks">' +
      chk('זכוכית', o.glass, o.glassType) +
      chk('גב', o.backing) +
      chk('פספרטו', o.passepartout, o.passeColor) +
      '</div>';

    var notes = (o.notes && String(o.notes).trim()) ?
      '<div class="od-notes"><div class="k">הערות</div><div class="v">' + esc(o.notes) + '</div></div>' : '';

    node.innerHTML =
      '<div class="modal__head">' +
        '<div class="od-head">' +
          '<h2 class="modal__title">הזמנה #' + esc(o.orderNo) + ' · ' + nameLink + '</h2>' +
          '<div class="od-head__tags" data-od-tags></div>' +
        '</div>' +
        '<button class="modal__close" data-close aria-label="סגירה">×</button>' +
      '</div>' +
      '<div class="modal__body">' +
        '<div class="od-mat">' +
          '<div class="dgrid" data-od-grid></div>' +
          checks + notes +
        '</div>' +
        '<div class="od-pay" data-od-pay></div>' +
      '</div>' +
      '<div class="modal__foot">' +
        '<button class="btn btn--primary" data-od-addpay>' + I.wallet + 'רשום תשלום</button>' +
        '<button class="btn btn--wa" data-od-wa>' + I.wa + 'שלח עותק ללקוח</button>' +
        '<button class="btn btn--secondary" data-od-print>' + I.printer + 'הדפס כרטיס עבודה</button>' +
        '<button class="btn btn--ghost" data-close>סגירה</button>' +
      '</div>';

    var tagsEl = node.querySelector('[data-od-tags]');
    var gridEl = node.querySelector('[data-od-grid]');
    var payEl = node.querySelector('[data-od-pay]');

    // מרנדר מחדש את התלוי-תשלומים (תגיות, גריד, בלוק תשלומים) מהמטמון החי
    function renderPayParts() {
      var pays = paymentsForOrder(o, paymentsCache).slice()
        .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });
      var paid = paidFor(o, paymentsCache);
      var bal = balanceOf(o, paymentsCache);
      var ps = paymentStatus(o, paymentsCache);

      tagsEl.innerHTML =
        '<span class="pill is-' + color + '"><span class="dot"></span>' + esc(STATUS_LABEL[o.status]) + '</span>' +
        '<span class="pill is-' + ps.color + '"><span class="dot"></span>' + ps.label + '</span>' +
        (showChip ? '<span class="chip ' + chipCls + '">' + I.clock + 'יום ' + d + ' / 10</span>' : '');

      gridEl.innerHTML =
        f('טלפון', '<span class="mono">' + esc(o.phone) + '</span>') +
        f('תיאור התמונה', esc(o.imageDesc || '-')) +
        f('מסגרת', esc(o.frameDesc || '-')) +
        fmono('מק"ט מסגרת', esc(o.profileSku || '-')) +
        fmono('מידות', (o.width || 0) + '×' + (o.height || 0)) +
        f('תאריך פתיחה', fmtDate(o.openedAt)) +
        f('יעד אספקה', fmtDate(o.deliveryTarget)) +
        (o.deliveredAt ? f('תאריך מסירה', fmtDate(o.deliveredAt)) : '') +
        f('מחיר כולל', fmtMoney(o.price)) +
        f('שולם עד כה', fmtMoney(paid)) +
        f('יתרה לתשלום', fmtMoney(bal), true);

      var list = pays.length ?
        pays.map(function (p) {
          return '<div class="pay-row">' +
            '<span class="pay-row__type">' + esc(p.type) + '</span>' +
            '<span class="pay-row__method">' + esc(p.method) + '</span>' +
            '<span class="pay-row__date">' + fmtDate(p.date) + '</span>' +
            '<span class="pay-row__amt">' + fmtMoney(p.amount) + '</span>' +
            '<button class="pay-row__x" data-del-pay="' + esc(p.id) + '" aria-label="מחק תשלום" title="מחק תשלום">×</button>' +
          '</div>';
        }).join('') :
        '<div class="pay-empty">עדיין לא נרשמו תשלומים להזמנה זו.</div>';

      payEl.innerHTML =
        '<div class="pay-head"><span class="pay-head__title">תשלומים</span>' +
          '<span class="pay-head__sum">שולם ' + fmtMoney(paid) + ' מתוך ' + fmtMoney(o.price) + '</span></div>' +
        '<div class="pay-list">' + list + '</div>' +
        '<div class="pay-form-host" data-pay-form-host></div>';

      Array.prototype.forEach.call(payEl.querySelectorAll('[data-del-pay]'), function (b) {
        b.addEventListener('click', function () {
          DB.deletePayment(b.getAttribute('data-del-pay'));
        });
      });
    }

    // טופס רישום תשלום קטן (סכום + אמצעי + סוג)
    function togglePayForm() {
      var host = payEl.querySelector('[data-pay-form-host]');
      if (!host) return;
      if (host.querySelector('.pay-form')) { host.innerHTML = ''; return; }
      var bal = balanceOf(o, paymentsCache);
      var suggested = bal > 0 ? bal : '';
      var methodOpts = PAY_METHODS.map(function (m) { return '<option value="' + esc(m) + '">' + esc(m) + '</option>'; }).join('');
      var defType = paidFor(o, paymentsCache) <= 0 ? 'מקדמה' : (bal > 0 ? 'תשלום ביניים' : 'תשלום סופי');
      var typeOpts = PAY_TYPES.map(function (t) {
        return '<option value="' + esc(t) + '"' + (t === defType ? ' selected' : '') + '>' + esc(t) + '</option>';
      }).join('');

      host.innerHTML =
        '<form class="pay-form" data-pay-form>' +
          '<div class="pay-form__grid">' +
            '<div class="form-field"><label for="pay-amount">סכום (₪)</label>' +
              '<input id="pay-amount" name="amount" type="number" min="0" step="1" value="' + suggested + '" required></div>' +
            '<div class="form-field"><label for="pay-method">אמצעי</label>' +
              '<select id="pay-method" name="method">' + methodOpts + '</select></div>' +
            '<div class="form-field"><label for="pay-type">סוג</label>' +
              '<select id="pay-type" name="type">' + typeOpts + '</select></div>' +
          '</div>' +
          '<div class="pay-form__foot">' +
            '<button type="submit" class="btn btn--primary btn--sm">' + I.check + 'שמור תשלום</button>' +
            '<button type="button" class="btn btn--ghost btn--sm" data-pay-cancel>ביטול</button>' +
          '</div>' +
        '</form>';

      var form = host.querySelector('[data-pay-form]');
      form.querySelector('[data-pay-cancel]').addEventListener('click', function () { host.innerHTML = ''; });
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var amount = parseFloat(form.querySelector('[name="amount"]').value) || 0;
        if (amount <= 0) { global.alert('הזן סכום גדול מאפס.'); return; }
        DB.savePayment({
          orderId: o.id,
          customerId: o.customerId || null,
          amount: Math.round(amount),
          method: form.querySelector('[name="method"]').value,
          type: form.querySelector('[name="type"]').value,
          date: new Date().toISOString()
        }); // subscribePayments -> odRefresh ירנדר מחדש את הבלוק
      });
      var amt = form.querySelector('[name="amount"]');
      if (amt) amt.focus();
    }

    renderPayParts();

    Array.prototype.forEach.call(node.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', closeModal);
    });
    node.addEventListener('click', function (e) {
      var custBtn = e.target.closest('[data-open-customer]');
      if (custBtn) { closeModal(); Gallery.openCustomer(custBtn.getAttribute('data-open-customer')); }
    });
    var wa = node.querySelector('[data-od-wa]');
    if (wa) wa.addEventListener('click', function () { global.open(waLink(o.phone, msgCopy(o)), '_blank'); });
    var addPay = node.querySelector('[data-od-addpay]');
    if (addPay) addPay.addEventListener('click', togglePayForm);
    var printBtn = node.querySelector('[data-od-print]');
    if (printBtn) printBtn.addEventListener('click', function () { printWorkCard(o); });

    // refresh חי: כשנקלט/נמחק תשלום, נרנדר מחדש את חלקי התשלום בלבד.
    // מוצמד לצומת (ולא מוקצה ישירות ל-odRefresh) כי openModal קורא ל-closeModal
    // שמאפס את odRefresh. ההקצאה ל-odRefresh נעשית ב-open אחרי openModal.
    node.__odRefresh = function () {
      if (!document.body.contains(node)) return;
      var openForm = !!payEl.querySelector('.pay-form');
      renderPayParts();
      if (openForm) togglePayForm(); // אם הטופס היה פתוח, השאר אותו פתוח עם ערכים מעודכנים
    };

    return node;
  }

  // כרטיס עבודה להדפסה (לסדנה): חלון נקי עם פרטי ההזמנה
  function printWorkCard(o) {
    var w = global.open('', '_blank', 'width=520,height=680');
    if (!w) { global.alert('הדפדפן חסם את חלון ההדפסה. אפשר לאפשר חלונות קופצים ולנסות שוב.'); return; }
    var paid = paidFor(o, paymentsCache);
    var bal = balanceOf(o, paymentsCache);
    function line(k, v) { return '<tr><td class="k">' + k + '</td><td class="v">' + v + '</td></tr>'; }
    var html =
      '<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="UTF-8">' +
      '<title>כרטיס עבודה #' + esc(o.orderNo) + '</title>' +
      '<style>' +
      'body{font-family:Arial,system-ui,sans-serif;direction:rtl;color:#1E1F33;padding:28px;}' +
      'h1{font-size:20px;margin:0 0 4px;} .sub{color:#676879;font-size:13px;margin-bottom:18px;}' +
      'table{width:100%;border-collapse:collapse;} td{padding:8px 6px;border-bottom:1px solid #E6E9F0;font-size:14px;vertical-align:top;}' +
      'td.k{color:#676879;width:38%;} td.v{font-weight:600;}' +
      '.checks{margin-top:14px;font-size:14px;} .foot{margin-top:22px;font-size:12px;color:#676879;}' +
      '</style></head><body>' +
      '<h1>כרטיס עבודה · הזמנה #' + esc(o.orderNo) + '</h1>' +
      '<div class="sub">' + esc(SHOP.name) + ' · ' + esc(o.customerName) + ' · ' + esc(o.phone) + '</div>' +
      '<table>' +
        line('תיאור התמונה', esc(o.imageDesc || '-')) +
        line('מסגרת', esc(o.frameDesc || '-')) +
        line('מק"ט מסגרת', esc(o.profileSku || '-')) +
        line('מידות', (o.width || 0) + ' × ' + (o.height || 0) + ' ס"מ') +
        line('זכוכית', o.glass ? ('כן' + (o.glassType ? ' · ' + esc(o.glassType) : '')) : 'לא') +
        line('גב', o.backing ? 'כן' : 'לא') +
        line('פספרטו', o.passepartout ? ('כן' + (o.passeColor ? ' · ' + esc(o.passeColor) : '')) : 'לא') +
        line('תאריך פתיחה', fmtDate(o.openedAt)) +
        line('יעד אספקה', fmtDate(o.deliveryTarget)) +
        line('מחיר כולל', fmtMoney(o.price)) +
        line('שולם', fmtMoney(paid)) +
        line('יתרה', fmtMoney(bal)) +
      '</table>' +
      (o.notes && String(o.notes).trim() ? '<div class="checks"><b>הערות:</b> ' + esc(o.notes) + '</div>' : '') +
      '<div class="foot">' + esc(SHOP.name) + ' · ' + esc(SHOP.phone) + ' · ' + esc(SHOP.address) + '</div>' +
      '</body></html>';
    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(function () { try { w.print(); } catch (e) {} }, 300);
  }

  function showOrderDetail(o) {
    var node = orderDetailNode(o);
    openModal(node);              // openModal קורא ל-closeModal שמאפס odRefresh
    odRefresh = node.__odRefresh; // ולכן מקצים כאן, אחרי הפתיחה
  }
  Gallery.OrderDetail = {
    open: function (order) {
      if (!order) return;
      if (typeof order === 'string') {
        DB.getOrder(order).then(function (o) { if (o) showOrderDetail(o); });
      } else {
        showOrderDetail(order);
      }
    }
  };

  /* =========================================================================
   * "סוף יום" - סיכום תשלומי היום: לפי אמצעי + סה"כ + סיכום לרו"ח (mock)
   * ======================================================================= */
  function isToday(iso) {
    if (!iso) return false;
    var d = new Date(iso), n = new Date();
    return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate();
  }
  function orderById(id) { return ordersCache.filter(function (o) { return o.id === id; })[0] || null; }

  function endOfDayNode() {
    var node = document.createElement('div');
    node.className = 'modal';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');

    var today = paymentsCache.filter(function (p) { return isToday(p.date); })
      .sort(function (a, b) { return new Date(a.date) - new Date(b.date); });

    var byMethod = {};
    PAY_METHODS.forEach(function (m) { byMethod[m] = 0; });
    var total = 0;
    today.forEach(function (p) {
      var m = p.method || 'אחר';
      if (!(m in byMethod)) byMethod[m] = 0;
      byMethod[m] += Number(p.amount || 0);
      total += Number(p.amount || 0);
    });

    var dateStr = fmtDate(new Date().toISOString());

    var rows = today.length ?
      today.map(function (p) {
        var o = orderById(p.orderId);
        var who = o ? o.customerName : 'לקוח';
        var num = o ? '#' + o.orderNo : '';
        return '<div class="eod-row">' +
          '<span class="eod-row__who">' + esc(who) + ' <span class="eod-row__num mono">' + esc(num) + '</span></span>' +
          '<span class="eod-row__type">' + esc(p.type || '') + '</span>' +
          '<span class="eod-row__method">' + esc(p.method || '') + '</span>' +
          '<span class="eod-row__amt">' + fmtMoney(p.amount) + '</span>' +
        '</div>';
      }).join('') :
      '<div class="pay-empty">לא נקלטו תשלומים היום עדיין.</div>';

    var methodTiles = Object.keys(byMethod).filter(function (m) { return byMethod[m] > 0; })
      .map(function (m) {
        return '<div class="eod-tile"><div class="eod-tile__k">' + esc(m) + '</div>' +
          '<div class="eod-tile__v">' + fmtMoney(byMethod[m]) + '</div></div>';
      }).join('');
    if (!methodTiles) methodTiles = '<div class="eod-tile is-empty"><div class="eod-tile__k">אין תשלומים</div><div class="eod-tile__v">' + fmtMoney(0) + '</div></div>';

    node.innerHTML =
      '<div class="modal__head">' +
        '<h2 class="modal__title">' + I.receipt + ' סוף יום · ' + dateStr + '</h2>' +
        '<button class="modal__close" data-close aria-label="סגירה">×</button>' +
      '</div>' +
      '<div class="modal__body">' +
        '<div class="eod-summary">' +
          '<div class="eod-total"><span class="eod-total__k">סה"כ נקלט היום</span>' +
            '<span class="eod-total__v">' + fmtMoney(total) + '</span>' +
            '<span class="eod-total__c">' + plural(today.length, 'תשלום אחד', 'תשלומים') + '</span></div>' +
          '<div class="eod-tiles">' + methodTiles + '</div>' +
        '</div>' +
        '<div class="eod-list-head">פירוט תשלומי היום</div>' +
        '<div class="eod-list">' + rows + '</div>' +
      '</div>' +
      '<div class="modal__foot">' +
        '<button class="btn btn--primary" data-eod-accountant>' + I.copy + 'סיכום לרו"ח</button>' +
        '<button class="btn btn--ghost" data-close>סגירה</button>' +
      '</div>';

    Array.prototype.forEach.call(node.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', closeModal);
    });
    node.querySelector('[data-eod-accountant]').addEventListener('click', function () {
      openModal(accountantNode(today, byMethod, total, dateStr));
    });

    return node;
  }

  // סיכום לרו"ח (mock): טקסט מוכן להעתקה + הבהרה שאין כאן קבלה חוקית
  function accountantNode(today, byMethod, total, dateStr) {
    var node = document.createElement('div');
    node.className = 'modal';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');

    var lines = [];
    lines.push('סיכום תשלומים פנימי · ' + SHOP.name);
    lines.push('תאריך: ' + dateStr);
    lines.push('');
    lines.push('פירוט:');
    if (today.length) {
      today.forEach(function (p) {
        var o = orderById(p.orderId);
        var who = o ? o.customerName + ' (#' + o.orderNo + ')' : 'לקוח';
        lines.push('- ' + who + ' · ' + (p.type || '') + ' · ' + (p.method || '') + ' · ' + fmtMoney(p.amount));
      });
    } else {
      lines.push('- לא נקלטו תשלומים היום.');
    }
    lines.push('');
    lines.push('סיכום לפי אמצעי:');
    Object.keys(byMethod).forEach(function (m) {
      if (byMethod[m] > 0) lines.push('- ' + m + ': ' + fmtMoney(byMethod[m]));
    });
    lines.push('');
    lines.push('סה"כ: ' + fmtMoney(total));
    lines.push('');
    lines.push('הערה: זהו סיכום פנימי בלבד ואינו מהווה קבלה או חשבונית מס.');
    var text = lines.join('\n');

    node.innerHTML =
      '<div class="modal__head">' +
        '<h2 class="modal__title">סיכום לרו"ח</h2>' +
        '<button class="modal__close" data-close aria-label="סגירה">×</button>' +
      '</div>' +
      '<div class="modal__body">' +
        '<div class="eod-note">' + I.alert +
          '<span>הנפקת קבלה חוקית תתחבר לתוכנת חשבוניות מאושרת בהמשך. זהו סיכום פנימי בלבד.</span></div>' +
        '<textarea class="eod-text" data-eod-text readonly>' + esc(text) + '</textarea>' +
      '</div>' +
      '<div class="modal__foot">' +
        '<button class="btn btn--primary" data-eod-copy>' + I.copy + 'העתק את הסיכום</button>' +
        '<button class="btn btn--ghost" data-close>סגירה</button>' +
      '</div>';

    Array.prototype.forEach.call(node.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', closeModal);
    });
    var copyBtn = node.querySelector('[data-eod-copy]');
    copyBtn.addEventListener('click', function () {
      var ta = node.querySelector('[data-eod-text]');
      function done() {
        copyBtn.classList.add('is-ok');
        copyBtn.innerHTML = I.check + 'הועתק';
        setTimeout(function () { copyBtn.classList.remove('is-ok'); copyBtn.innerHTML = I.copy + 'העתק את הסיכום'; }, 1800);
      }
      try {
        if (global.navigator && global.navigator.clipboard && global.navigator.clipboard.writeText) {
          global.navigator.clipboard.writeText(text).then(done, function () { ta.select(); try { document.execCommand('copy'); } catch (e) {} done(); });
        } else {
          ta.select(); try { document.execCommand('copy'); } catch (e) {} done();
        }
      } catch (e) { ta.select(); }
    });

    return node;
  }

  Gallery.EndOfDay = { open: function () { openModal(endOfDayNode()); } };

  /* =========================================================================
   * Router
   * ======================================================================= */
  // tip = הסבר על מונה הסרגל: מה הוא סופר ושהוא יורד לבד כשמטפלים
  var TABS = [
    { id: 'orders',    label: 'הזמנות',  icon: I.orders,    badge: 'is-red',
      tip: 'המונה סופר הזמנות שדורשות תשומת לב: באיחור (חצו את יעד 10 הימים). הוא יורד לבד כשמסמנים את ההזמנה כמוכנה או נמסרה.' },
    { id: 'inventory', label: 'מלאי',    icon: I.inventory, badge: 'is-orange',
      tip: 'המונה סופר פרופילים שירדו מתחת לסף המלאי. הוא יורד לבד כשמעדכנים את המלאי מעל הסף.' },
    { id: 'customers', label: 'לקוחות',  icon: I.customers, badge: 'is-primary',
      tip: 'כל הלקוחות וההיסטוריה שלהם. לחיצה על שם לקוח בכל מקום באפליקציה מקפיצה לכאן.' },
    { id: 'reminders', label: 'תזכורות', icon: I.reminders, badge: 'is-primary',
      tip: 'המונה סופר עבודות שדורשות מעקב: באיחור, מתקרבות ליעד או מוכנות לאיסוף. הוא יורד לבד כשמטפלים בהן.' },
    { id: 'finance',   label: 'כספים',   icon: I.finance,   badge: 'is-primary',
      tip: 'ארכיון ומעקב פיננסי: הכנסות שנגבו בפועל, הוצאות ורווח לכל תקופה. אפשר לנווט אחורה בזמן.' },
    { id: 'insights',  label: 'תובנות',  icon: I.insights,  badge: 'is-orange',
      tip: 'המונה סופר פרופילים מתחת לסף שכדאי להזמין. הוא יורד לבד כשמחדשים מלאי.' }
  ];
  var current = 'orders';

  function navItemHTML(tab, forBottom) {
    return '<button class="nav__item" role="tab" data-tab="' + tab.id + '"' +
      (tab.tip ? ' title="' + esc(tab.tip) + '"' : '') +
      (tab.id === current ? ' aria-current="page"' : '') + '>' +
      tab.icon +
      '<span class="lbl">' + tab.label + '</span>' +
      '<span class="nav__badge ' + tab.badge + '" data-badge="' + tab.id + '"' +
        (tab.tip ? ' title="' + esc(tab.tip) + '"' : '') + '></span>' +
      '</button>';
  }

  function buildNav() {
    var rail = document.getElementById('rail');
    rail.innerHTML =
      '<div class="brand"><img class="brand__logo" src="assets/logo.png" alt="הגלריה" />' +
      '<div class="brand__name">ה<b>גלריה</b></div></div>' +
      '<nav class="nav" role="tablist" aria-label="ניווט ראשי">' +
      TABS.map(function (t) { return navItemHTML(t); }).join('') +
      '</nav>' +
      '<div class="rail__foot">' +
        '<div class="rail__tools">' +
          '<button class="rail__tool" data-endday title="סיכום תשלומי היום">' + I.receipt + '<span>סוף יום</span></button>' +
          '<button class="rail__tool" data-theme-toggle role="switch" aria-checked="false" title="החלפת מצב כהה / בהיר">' +
            '<span class="rail__tool-ico" data-theme-ico>' + I.sun + '</span><span data-theme-label>מצב בהיר</span></button>' +
        '</div>' +
        '<div class="rail__user-row"><div class="rail__avatar">א</div>' +
        '<div class="rail__user"><b>' + SHOP.owner + '</b>' + SHOP.name + '</div></div>' +
      '</div>';

    var bottom = document.getElementById('bottombar');
    bottom.innerHTML = TABS.map(function (t) { return navItemHTML(t, true); }).join('');

    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.getAttribute('data-tab')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-endday]'), function (btn) {
      btn.addEventListener('click', function () { Gallery.EndOfDay.open(); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-theme-toggle]'), function (btn) {
      btn.addEventListener('click', toggleTheme);
    });
    refreshThemeToggle();
  }

  function switchTab(id) {
    current = id;
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (btn) {
      if (btn.getAttribute('data-tab') === id) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
      v.classList.toggle('is-active', v.getAttribute('data-view') === id);
    });
  }
  Gallery.switchTab = switchTab;

  function updateBadge(tabId, count, cls) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-badge="' + tabId + '"]'), function (b) {
      b.textContent = count > 0 ? String(count) : '';
    });
  }
  Gallery.updateBadge = updateBadge;

  /* =========================================================================
   * Init
   * ======================================================================= */
  function init() {
    buildNav();
    // מרכיב את שלושת המודולים על מיכלי התצוגה שלהם
    Gallery.Orders.mount(document.querySelector('[data-view="orders"]'));
    Gallery.Inventory.mount(document.querySelector('[data-view="inventory"]'));
    Gallery.Customers.mount(document.querySelector('[data-view="customers"]'));
    Gallery.Reminders.mount(document.querySelector('[data-view="reminders"]'));
    Gallery.Finance.mount(document.querySelector('[data-view="finance"]'));
    Gallery.Insights.mount(document.querySelector('[data-view="insights"]'));

    // badges: הזמנות באיחור + פרופילים מתחת לסף
    DB.subscribeOrders(function (orders) {
      var late = orders.filter(function (o) { return urgency(o).level === 'late'; }).length;
      updateBadge('orders', late);
      var openReminders = orders.filter(function (o) {
        var lv = urgency(o).level; return lv === 'late' || lv === 'warn' || lv === 'ready';
      }).length;
      updateBadge('reminders', openReminders);
    });
    DB.subscribeProfiles(function (profiles) {
      var low = profiles.filter(function (p) { return p.stockUnits < p.minThreshold; }).length;
      updateBadge('inventory', low);
      updateBadge('insights', low); // מונה "צריך להזמין" גם על טאב התובנות
    });

    switchTab('orders');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
