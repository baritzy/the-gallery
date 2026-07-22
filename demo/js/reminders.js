/* =============================================================================
 * reminders.js  -  מודול "תזכורות ותיעדוף" (טאב 3)
 * דשבורד שלוש עמודות לפי דחיפות: באיחור (אדום), מתקרב (כתום), בזמן (ירוק).
 * כלל 10 הימים במרכז. שולף מאותו מקור נתונים של ההזמנות.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var DB = Gallery.DB;
  var U = Gallery.util;
  var I = Gallery.icons;
  var SHOP = Gallery.SHOP;
  var esc = U.esc;

  var container = null, colsEl = null;
  var orders = [];

  function mount(el) {
    container = el;
    container.innerHTML =
      '<div class="view__head">' +
        '<div><h1 class="view__title">תזכורות ותיעדוף</h1>' +
        '<p class="view__subtitle">כלל 10 הימים במרכז. מה דורש טיפול קודם, לפי צבע.</p></div>' +
      '</div>' +
      '<div class="rem-cols" data-cols></div>';
    colsEl = container.querySelector('[data-cols]');
    colsEl.addEventListener('click', onClick);
    DB.subscribeOrders(function (o) { orders = o; render(); });
  }

  function bucket(o) {
    if (o.status === 'delivered') return null;
    var lv = U.urgency(o).level;
    if (lv === 'late') return 'late';
    if (lv === 'warn') return 'warn';
    return 'ontime'; // ok + ready
  }

  function render() {
    if (!colsEl) return;
    var groups = { late: [], warn: [], ontime: [] };
    orders.forEach(function (o) { var b = bucket(o); if (b) groups[b].push(o); });
    Object.keys(groups).forEach(function (k) {
      groups[k].sort(function (a, b) { return U.dayNumber(b) - U.dayNumber(a); });
    });

    colsEl.innerHTML =
      colHTML('late', 'באיחור · דורש פולואפ', groups.late) +
      colHTML('warn', 'מתקרב ליעד', groups.warn) +
      colHTML('ontime', 'בזמן', groups.ontime);
  }

  function colHTML(kind, title, items) {
    var body = items.length ?
      items.map(function (o) { return cardHTML(o, kind); }).join('') :
      '<div class="empty" style="padding:24px 8px"><p>אין פריטים כאן כרגע.</p></div>';
    return '<div class="rem-col ' + kind + '">' +
      '<div class="rem-col__head"><span class="rem-col__dot"></span>' +
        '<span class="rem-col__title">' + esc(title) + '</span>' +
        '<span class="rem-col__count">' + items.length + '</span></div>' +
      '<div class="rem-items">' + body + '</div>' +
    '</div>';
  }

  function cardHTML(o, kind) {
    var color = U.displayColor(o);
    var d = U.dayNumber(o);

    var actions = '';
    if (o.status === 'ready') {
      actions =
        '<button class="btn btn--wa btn--sm" data-id="' + o.id + '" data-action="wa-ready">' + I.wa + 'ההזמנה מוכנה</button>' +
        '<button class="btn btn--secondary btn--sm" data-id="' + o.id + '" data-action="delivered">סמן כנמסרה</button>';
    } else if (kind === 'late') {
      actions =
        '<button class="btn btn--wa btn--sm" data-id="' + o.id + '" data-action="wa-followup">' + I.wa + 'פולואפ ללקוח</button>' +
        '<button class="btn btn--primary btn--sm" data-id="' + o.id + '" data-action="ready">' + I.check + 'סמן כמוכנה</button>';
    } else {
      actions =
        '<button class="btn btn--primary btn--sm" data-id="' + o.id + '" data-action="ready">' + I.check + 'סמן כמוכנה</button>' +
        '<button class="btn btn--wa btn--sm" data-id="' + o.id + '" data-action="wa-ready">' + I.wa + 'ההזמנה מוכנה</button>';
    }

    var custId = o.customerId || o.customerName;

    return '<div class="rem-card" style="--spine:var(--st-' + color + ')">' +
      '<div class="rem-card__top">' +
        '<button type="button" class="rem-card__name" data-open-customer="' + esc(custId) + '" ' +
          'title="מעבר לכרטיס הלקוח">' + esc(o.customerName) + '</button>' +
        '<span class="pill pill--sm is-' + color + '" style="margin-inline-start:auto">' +
          esc(U.STATUS_LABEL[o.status]) + '</span>' +
      '</div>' +
      '<div class="rem-card__meta">' +
        '<button type="button" class="rem-card__order" data-open-order="' + o.id + '" ' +
          'title="פתח את פירוט ההזמנה">הזמנה #' + esc(o.orderNo) + '</button>' +
        ' · ' + esc(o.frameDesc || 'מסגרת') + ' · יום ' + d + ' / 10 · יעד ' + U.fmtDate(o.deliveryTarget) + '</div>' +
      '<div class="rem-card__actions">' + actions + '</div>' +
    '</div>';
  }

  function msgFollowup(o) {
    return 'היי ' + o.customerName + ', כאן ' + SHOP.owner + ' מ' + SHOP.name + '. ' +
      'רק עדכון קטן על ההזמנה שלך (מס\' ' + o.orderNo + '): היא בעבודה ומתעכבת מעט מהצפוי, סליחה על ההמתנה. ' +
      'נעדכן אותך ברגע שתהיה מוכנה לאיסוף. תודה על הסבלנות.';
  }

  function onClick(e) {
    var custBtn = e.target.closest('[data-open-customer]');
    if (custBtn) { e.stopPropagation(); Gallery.openCustomer(custBtn.getAttribute('data-open-customer')); return; }

    var openBtn = e.target.closest('[data-open-order]');
    if (openBtn) { e.stopPropagation(); Gallery.OrderDetail.open(openBtn.getAttribute('data-open-order')); return; }

    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var id = btn.getAttribute('data-id');
    var action = btn.getAttribute('data-action');
    var o = orders.filter(function (x) { return x.id === id; })[0];
    if (!o) return;

    if (action === 'wa-ready') { global.open(U.waLink(o.phone, U.msgReady(o)), '_blank'); return; }
    if (action === 'wa-followup') { global.open(U.waLink(o.phone, msgFollowup(o)), '_blank'); return; }
    if (action === 'ready') { DB.saveOrder(Object.assign({}, o, { status: 'ready' })); return; }
    if (action === 'delivered') { DB.saveOrder(Object.assign({}, o, { status: 'delivered' })); return; }
  }

  Gallery.Reminders = { mount: mount };

})(window);
