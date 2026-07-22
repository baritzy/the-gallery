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
    search: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>',
    clock: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    chevron: '<svg class="chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>',
    wa: '<svg class="ico" viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm5.8 14.13c-.24.68-1.42 1.32-1.95 1.36-.5.05-.97.23-3.28-.68-2.77-1.09-4.53-3.92-4.67-4.1-.14-.18-1.12-1.49-1.12-2.85 0-1.36.71-2.02.96-2.3.25-.27.55-.34.73-.34.18 0 .37 0 .53.01.17.01.4-.06.62.48.24.55.79 1.9.86 2.04.07.14.11.3.02.48-.09.18-.14.3-.27.46-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.27.71 1.17 1.53 1.9 1.05.94 1.94 1.23 2.21 1.37.27.14.43.11.59-.07.16-.18.68-.79.86-1.07.18-.27.36-.23.61-.14.25.09 1.6.75 1.87.89.27.14.45.2.52.32.07.11.07.66-.17 1.34Z"/></svg>',
    plus: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
    check: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>',
    copy: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/></svg>',
    alert: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4m0 4h.01M10.3 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.7 3.86a2 2 0 0 0-3.4 0Z"/></svg>',
    frameEmpty: '<svg viewBox="0 0 120 120" width="120" height="120" fill="none" stroke="currentColor" stroke-width="3"><rect x="12" y="12" width="96" height="96" rx="6"/><rect x="30" y="30" width="60" height="60" rx="3"/></svg>'
  };
  Gallery.icons = I;

  /* =========================================================================
   * עזרי דומיין משותפים
   * ======================================================================= */
  var STATUS_LABEL = { 'new': 'חדשה', 'in-work': 'בעבודה', ready: 'מוכנה', delivered: 'נמסרה' };
  var STATUS_LIST = ['new', 'in-work', 'ready', 'delivered'];

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

  Gallery.util = {
    STATUS_LABEL: STATUS_LABEL, STATUS_LIST: STATUS_LIST,
    daysSince: daysSince, dayNumber: dayNumber, urgency: urgency,
    displayColor: displayColor, dayChipClass: dayChipClass, statusVar: statusVar,
    fmtDate: fmtDate, fmtMoney: fmtMoney, consumption: consumption,
    phoneIntl: phoneIntl, waLink: waLink, msgCopy: msgCopy, msgReady: msgReady, esc: esc
  };

  /* =========================================================================
   * מודל גנרי (backdrop + סגירה ב-Esc / קליק ברקע)
   * ======================================================================= */
  var modalHost = null;
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
    document.body.style.overflow = '';
  }
  function onEsc(e) { if (e.key === 'Escape') closeModal(); }
  Gallery.openModal = openModal;
  Gallery.closeModal = closeModal;

  /* =========================================================================
   * Router
   * ======================================================================= */
  var TABS = [
    { id: 'orders',    label: 'הזמנות',  icon: I.orders,    badge: 'is-red' },
    { id: 'inventory', label: 'מלאי',    icon: I.inventory, badge: 'is-orange' },
    { id: 'reminders', label: 'תזכורות', icon: I.reminders, badge: 'is-primary' }
  ];
  var current = 'orders';

  function navItemHTML(tab, forBottom) {
    return '<button class="nav__item" role="tab" data-tab="' + tab.id + '"' +
      (tab.id === current ? ' aria-current="page"' : '') + '>' +
      tab.icon +
      '<span class="lbl">' + tab.label + '</span>' +
      '<span class="nav__badge ' + tab.badge + '" data-badge="' + tab.id + '"></span>' +
      '</button>';
  }

  function buildNav() {
    var rail = document.getElementById('rail');
    rail.innerHTML =
      '<div class="brand"><div class="brand__mark"></div>' +
      '<div class="brand__name">ה<b>גלריה</b></div></div>' +
      '<nav class="nav" role="tablist" aria-label="ניווט ראשי">' +
      TABS.map(function (t) { return navItemHTML(t); }).join('') +
      '</nav>' +
      '<div class="rail__foot"><div class="rail__avatar">א</div>' +
      '<div class="rail__user"><b>' + SHOP.owner + '</b>' + SHOP.name + '</div></div>';

    var bottom = document.getElementById('bottombar');
    bottom.innerHTML = TABS.map(function (t) { return navItemHTML(t, true); }).join('');

    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.getAttribute('data-tab')); });
    });
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
    Gallery.Reminders.mount(document.querySelector('[data-view="reminders"]'));

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
    });

    switchTab('orders');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(window);
