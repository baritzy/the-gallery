/* =============================================================================
 * customers.js  -  טאב "לקוחות" v2 (C37). OWNER: agent B (wave 3). admin בלבד.
 * -----------------------------------------------------------------------------
 * כל הלקוחות בשורות נפתחות. שם הלקוח צבוע לפי ביקורים (2 = צהוב, 3+ = ירוק),
 * ביקור = הזמנה או קניית מוצר (Gallery.data.customers.visitCount).
 * שורה פתוחה: הערות + היסטוריה משולבת של הזמנות וקניות. וואטסאפ דרך Gallery.whatsapp.
 * Hook: Gallery.openCustomer(idOrName) עובר לטאב ומדגיש את הלקוח.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var D = Gallery.data;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;

  var container = null, listEl = null, chipsEl = null;
  var data = { customers: [], orders: [], sales: [], products: [], receipts: [] };
  var openIds = {};
  var state = { term: '', filter: 'all' };
  var pendingFocus = null;
  var FILTERS = { all: 'כולם', returning: 'לקוחות חוזרים', owed: 'עם יתרה' };

  function mount(el) {
    container = el;
    container.innerHTML =
      '<div class="view__head">' +
        '<div><h1 class="view__title">לקוחות</h1>' +
        '<p class="view__subtitle">כל הלקוחות וההיסטוריה שלהם. צבע השם: ביקור שני צהוב, שלישי ומעלה ירוק.</p></div>' +
      '</div>' +
      '<div class="toolbar">' +
        '<div class="search">' + I.search +
          '<input type="search" data-search placeholder="חיפוש לפי שם, טלפון או מספר הזמנה..." aria-label="חיפוש לקוחות">' +
        '</div>' +
        '<div class="chips" data-chips></div>' +
      '</div>' +
      '<div class="cus-list" data-list></div>';

    listEl = container.querySelector('[data-list]');
    chipsEl = container.querySelector('[data-chips]');
    container.querySelector('[data-search]').addEventListener('input', function (e) {
      state.term = e.target.value.trim(); render();
    });
    chipsEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-f]');
      if (!b) return;
      state.filter = b.getAttribute('data-f');
      render();
    });
    listEl.addEventListener('click', onClick);
    listEl.addEventListener('keydown', onKeydown);

    D.orders.subscribe(function (o) { data.orders = o; render(); });
    D.customers.subscribe(function (c) { data.customers = c; render(); });
    D.sales.subscribe(function (s) { data.sales = s; render(); });
    D.products.subscribe(function (p) { data.products = p; render(); });
    D.receipts.subscribe(function (r) { data.receipts = r; render(); });
  }

  /* ---------------------------------------------------------- נגזרות */
  function ordersOf(id) {
    return data.orders.filter(function (o) { return o.customerId === id; })
      .sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
  }
  function salesOf(id) {
    return data.sales.filter(function (s) { return s.customerId === id; })
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  function productOf(id) { return data.products.filter(function (p) { return p.id === id; })[0] || null; }
  function receiptOf(id) { return id ? data.receipts.filter(function (r) { return r.id === id; })[0] || null : null; }

  function summary(c) {
    var os = ordersOf(c.id), ss = salesOf(c.id);
    var spent = os.reduce(function (s, o) { return s + Number(o.price || 0); }, 0) +
      ss.reduce(function (s, x) { return s + Number(x.price || 0); }, 0);
    var owed = os.reduce(function (s, o) { return s + Math.max(0, D.orders.balance(o)); }, 0);
    var dates = os.map(function (o) { return o.createdAt; }).concat(ss.map(function (x) { return x.at; }))
      .filter(Boolean).sort(function (a, b) { return new Date(b) - new Date(a); });
    return { orders: os, sales: ss, visits: os.length + ss.length, spent: spent, owed: owed, last: dates[0] || null };
  }

  function matchTerm(c, sm) {
    if (!state.term) return true;
    var t = state.term.toLowerCase();
    var digits = t.replace(/\D/g, '');
    if ((c.name || '').toLowerCase().indexOf(t) !== -1) return true;
    if (digits && String(c.phone || '').replace(/\D/g, '').indexOf(digits) !== -1) return true;
    return sm.orders.some(function (o) { return String(o.number) === t; });
  }

  /* ------------------------------------------------------------- render */
  function render() {
    if (!listEl) return;
    var all = data.customers.map(function (c) { return { c: c, sm: summary(c) }; });
    var cnt = {
      all: all.length,
      returning: all.filter(function (x) { return x.sm.visits >= 2; }).length,
      owed: all.filter(function (x) { return x.sm.owed > 0; }).length
    };
    chipsEl.innerHTML = Object.keys(FILTERS).map(function (k) {
      return '<button class="fchip" data-f="' + k + '" aria-pressed="' + (state.filter === k) + '">' +
        FILTERS[k] + ' <span class="cnt">' + cnt[k] + '</span></button>';
    }).join('');

    var rows = all.filter(function (x) {
      if (state.filter === 'returning' && x.sm.visits < 2) return false;
      if (state.filter === 'owed' && x.sm.owed <= 0) return false;
      return matchTerm(x.c, x.sm);
    }).sort(function (a, b) { return new Date(b.sm.last || 0) - new Date(a.sm.last || 0); });

    if (!rows.length) {
      listEl.innerHTML = emptyState();
      return;
    }
    listEl.innerHTML = '<div class="cus-headrow" aria-hidden="true"><span></span><span>לקוח</span><span>טלפון</span>' +
      '<span>ביקור אחרון</span><span>סה"כ</span><span>יתרה</span><span></span></div>' +
      rows.map(function (x) { return rowHTML(x.c, x.sm); }).join('');
    applyPendingFocus();
  }

  function emptyState() {
    if (state.term || state.filter !== 'all') {
      return '<div class="empty">' + I.frameEmpty + '<h3>לא נמצא לקוח מתאים</h3><p>נסו שם, טלפון או סינון אחר.</p>' +
        '<button class="btn btn--secondary" data-clear>ניקוי חיפוש וסינון</button></div>';
    }
    return '<div class="empty">' + I.frameEmpty + '<h3>עדיין אין לקוחות</h3>' +
      '<p>ברגע שתיפתח הזמנה או תימכר תמונה, הלקוח יופיע כאן עם כל ההיסטוריה שלו.</p></div>';
  }

  function nameChip(c, visits) {
    var tone = U.visitTone(visits);
    return '<span class="cus-name' + (tone ? ' tone-' + tone : '') + '">' + esc(c.name || 'ללא שם') + '</span>';
  }

  function rowHTML(c, sm) {
    var open = !!openIds[c.id];
    var parts = [];
    if (sm.orders.length) parts.push(U.plural(sm.orders.length, 'הזמנה אחת', 'הזמנות'));
    if (sm.sales.length) parts.push(U.plural(sm.sales.length, 'קנייה אחת', 'קניות'));
    var visitTxt = sm.visits ? (sm.visits === 1 ? 'ביקור ראשון' : sm.visits + ' ביקורים') : 'אין ביקורים';
    var hasNote = c.notes && String(c.notes).trim() !== '';
    return '<article class="cus-row' + (open ? ' is-open' : '') + '" data-id="' + esc(c.id) + '">' +
      '<div class="cus-row__head" role="button" tabindex="0" aria-expanded="' + open + '" data-toggle>' +
        '<span class="cus-visits cus-visits--' + (U.visitTone(sm.visits) || 'none') + '" title="מספר ביקורים">' + sm.visits + '</span>' +
        '<span class="cus-row__main">' + nameChip(c, sm.visits) +
          '<span class="cus-row__meta">' + esc(visitTxt) + (parts.length ? ' · ' + esc(parts.join(', ')) : '') +
          (hasNote ? ' · <span class="cus-noteflag">' + I.lightbulb + 'הערה</span>' : '') + '</span></span>' +
        '<span class="cus-phone mono">' + esc(c.phone || '') + '</span>' +
        '<span class="cus-last">' + (sm.last ? U.fmtDate(sm.last) : '') + '</span>' +
        '<span class="cus-total money">' + U.fmtMoney(sm.spent) + '</span>' +
        '<span class="cus-bal money' + (sm.owed > 0 ? ' is-owed' : '') + '">' + (sm.owed > 0 ? U.fmtMoney(sm.owed) : 'שולם') + '</span>' +
        '<span class="cus-row__acts">' +
          (c.phone ? '<button type="button" class="btn btn--wa cus-wa" data-contact aria-label="וואטסאפ ל' + esc(c.name) + '">' + I.wa + '<span>וואטסאפ</span></button>' : '') +
          I.chevron + '</span>' +
      '</div>' +
      (open ? '<div class="cus-row__panel">' + panelHTML(c, sm) + '</div>' : '') +
    '</article>';
  }

  function panelHTML(c, sm) {
    var hist = sm.orders.map(function (o) { return { at: o.createdAt, html: orderLine(o) }; })
      .concat(sm.sales.map(function (s) { return { at: s.at, html: saleLine(s) }; }))
      .sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    return '<div class="cus-panel">' +
      '<div class="cus-notes">' +
        '<label class="cus-notes__label" for="cus-note-' + esc(c.id) + '">הערות על הלקוח</label>' +
        '<textarea id="cus-note-' + esc(c.id) + '" class="cus-notes__input" data-note-input rows="2" ' +
          'placeholder="העדפות מסגור, שיחות, כל דבר שחשוב לזכור.">' + esc(c.notes || '') + '</textarea>' +
        '<button type="button" class="btn btn--primary" data-save-note>' + I.check + 'שמור הערה</button>' +
      '</div>' +
      (Gallery.SalesUI ? '<div class="cus-sell"><button type="button" class="btn btn--secondary btn--lg" data-sell-to>' + I.tag + 'מכירת מוצר ללקוח</button></div>' : '') +
      '<h3 class="cus-hist__head">היסטוריה (' + hist.length + ')' +
        '<span> · הזמנות: ' + sm.orders.length + ' · קניות: ' + sm.sales.length + '</span></h3>' +
      (hist.length ? '<div class="cus-hist">' + hist.map(function (h) { return h.html; }).join('') + '</div>' :
        '<p class="cus-hist__empty">אין עדיין הזמנות או קניות.</p>') +
    '</div>';
  }

  function orderLine(o) {
    var look = U.orderLook(o);
    var bal = D.orders.balance(o);
    var items = o.items || [];
    var desc = items.map(function (it) { return it.desc; }).filter(Boolean).slice(0, 2).join(', ');
    return '<button type="button" class="cus-h cus-h--order" data-open-order="' + esc(o.id) + '" title="פתח את ההזמנה">' +
      '<span class="cus-h__num mono">' + esc(o.number) + '</span>' +
      '<span class="pill is-' + look.color + '"><span class="dot"></span>' + esc(look.label) + '</span>' +
      '<span class="cus-h__desc">' + esc(U.plural(items.length, 'תמונה אחת', 'תמונות')) + (desc ? ': ' + esc(desc) : '') + '</span>' +
      '<span class="cus-h__date">' + U.fmtDate(o.createdAt) + '</span>' +
      '<span class="cus-h__price money">' + U.fmtMoney(o.price) + '</span>' +
      '<span class="cus-h__bal money' + (bal > 0 ? ' is-owed' : '') + '">' + (bal > 0 ? 'יתרה ' + U.fmtMoney(bal) : bal < 0 ? 'שולם ביתר ' + U.fmtMoney(-bal) : 'שולם') + '</span>' +
    '</button>';
  }

  function saleLine(s) {
    var p = productOf(s.productId);
    var r = receiptOf(s.receiptId);
    var kind = p ? (D.PRODUCT_KINDS[p.kind] || '') : '';
    return '<div class="cus-h cus-h--sale">' +
      '<span class="cus-h__num mono">' + (p && p.sticker ? esc(p.sticker) : '-') + '</span>' +
      '<span class="pill is-blue cus-h__buy">' + I.tag + 'קנייה</span>' +
      '<span class="cus-h__desc">' + esc(p ? p.name : 'מוצר שנמחק') + (kind ? ' · ' + esc(kind) : '') + '</span>' +
      '<span class="cus-h__date">' + U.fmtDate(s.at) + '</span>' +
      '<span class="cus-h__price money">' + U.fmtMoney(s.price) + '</span>' +
      '<span class="cus-h__bal">' + (r ? 'קבלה ' + esc(r.number) : '<span class="cus-h__noreceipt">בלי קבלה</span>') + '</span>' +
    '</div>';
  }

  /* --------------------------------------------------------- פוקוס מבחוץ */
  function applyPendingFocus() {
    if (!pendingFocus) return;
    var id = pendingFocus; pendingFocus = null;
    var el = listEl.querySelector('.cus-row[data-id="' + (global.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
    if (!el) return;
    (global.requestAnimationFrame || function (f) { setTimeout(f, 16); })(function () {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); }
      el.classList.add('is-focus');
      setTimeout(function () { el.classList.remove('is-focus'); }, 2200);
    });
  }
  function focusCustomer(idOrName) {
    var c = data.customers.filter(function (x) { return x.id === idOrName; })[0] ||
            data.customers.filter(function (x) { return x.name === idOrName; })[0] ||
            D.customers.peekOne(idOrName);
    if (!c) return;
    state.term = ''; state.filter = 'all';
    var s = container && container.querySelector('[data-search]');
    if (s) s.value = '';
    openIds[c.id] = true;
    pendingFocus = c.id;
    render();
  }

  /* --------------------------------------------------------------- events */
  function contact(id) {
    var c = D.customers.peekOne(id);
    if (!c) return;
    var last = ordersOf(id)[0];
    var shop = D.settings.peek().shop || {};
    var text = last ? U.msgOrderCopy(last) :
      'שלום ' + c.name + ', כאן ' + (shop.owner || '') + ' מ' + (shop.name || 'הגלריה') + '. נשמח לעמוד לרשותך.';
    Gallery.whatsapp(c.phone, text);
  }
  function saveNote(row) {
    var id = row.getAttribute('data-id');
    var c = D.customers.peekOne(id);
    if (!c) return;
    c.notes = row.querySelector('[data-note-input]').value.trim();
    openIds[id] = true;
    D.customers.save(c).then(function () { Gallery.toast('ההערה נשמרה'); });
  }
  function toggle(row) {
    var id = row.getAttribute('data-id');
    if (openIds[id]) delete openIds[id]; else openIds[id] = true;
    render();
  }

  function onClick(e) {
    var t = e.target;
    if (t.closest('[data-clear]')) {
      state.term = ''; state.filter = 'all';
      container.querySelector('[data-search]').value = '';
      render(); return;
    }
    var row = t.closest('.cus-row');
    if (!row) return;
    var b;
    if ((b = t.closest('[data-open-order]'))) { Gallery.openOrder(b.getAttribute('data-open-order')); return; }
    if (t.closest('[data-save-note]')) { saveNote(row); return; }
    if (t.closest('[data-sell-to]')) { Gallery.SalesUI.pickProduct({ customerId: row.getAttribute('data-id') }); return; }
    if (t.closest('[data-contact]')) { e.stopPropagation(); contact(row.getAttribute('data-id')); return; }
    if (t.closest('[data-toggle]')) toggle(row);
  }
  function onKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (!e.target.matches('[data-toggle]')) return;
    e.preventDefault();
    toggle(e.target.closest('.cus-row'));
  }

  Gallery.Customers = { mount: mount, focusCustomer: focusCustomer };
  Gallery.registerView('customers', Gallery.Customers);
  /* hook (חוזה v2, 4.1): מעבר ללקוח מכל מקום */
  Gallery.openCustomer = function (idOrName) {
    if (!idOrName) return;
    Gallery.switchTab('customers');
    focusCustomer(idOrName);
  };

})(window);
