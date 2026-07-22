/* =============================================================================
 * customers.js  -  מודול "לקוחות" (טאב 3)
 * ארכיון והיסטוריה: כל הלקוחות בשורות נפתחות. שורה פתוחה חושפת את כל ההזמנות
 * של הלקוח, כולל שנמסרו, כך שהזמנה שנמסרה לא נעלמת אלא נשמרת כאן.
 * חיפוש לפי שם/טלפון, וכפתור "צור קשר" שפותח wa.me.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var DB = Gallery.DB;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;

  var container = null, listEl = null;
  var customers = [], orders = [];
  var openIds = {};
  var state = { term: '' };

  function mount(el) {
    container = el;
    container.innerHTML =
      '<div class="view__head">' +
        '<div><h1 class="view__title">לקוחות</h1>' +
        '<p class="view__subtitle">כל הלקוחות וההיסטוריה שלהם. הזמנה שנמסרה נשמרת כאן, לא נעלמת.</p></div>' +
      '</div>' +
      '<div class="toolbar">' +
        '<div class="search">' + I.search +
          '<input type="search" data-search placeholder="חיפוש לפי שם או טלפון..." aria-label="חיפוש לקוחות">' +
        '</div>' +
      '</div>' +
      '<div class="list" data-list></div>';

    listEl = container.querySelector('[data-list]');
    container.querySelector('[data-search]').addEventListener('input', function (e) {
      state.term = e.target.value.trim(); render();
    });

    listEl.addEventListener('click', onClick);
    listEl.addEventListener('keydown', onKeydown);

    DB.subscribeOrders(function (o) { orders = o; render(); });
    DB.subscribeCustomers(function (c) { customers = c; render(); });
  }

  /* ---------------------------------------------------------- helpers */
  function ordersOf(custId) {
    return orders.filter(function (o) { return o.customerId === custId; })
      .sort(function (a, b) { return new Date(b.openedAt) - new Date(a.openedAt); });
  }
  function totalSpent(list) {
    return list.reduce(function (s, o) { return s + Number(o.price || 0); }, 0);
  }
  function openBalance(list) {
    return list.reduce(function (s, o) {
      return s + (o.status !== 'delivered' ? Number(o.balance || 0) : 0);
    }, 0);
  }
  function statusColor(s) {
    if (s === 'ready') return 'green';
    if (s === 'delivered') return 'grey';
    if (s === 'new') return 'blue';
    return 'orange'; // in-work
  }
  function matchTerm(c) {
    if (!state.term) return true;
    var t = state.term.toLowerCase();
    return (c.name || '').toLowerCase().indexOf(t) !== -1 ||
      (c.phone || '').indexOf(t) !== -1;
  }
  function findCustomer(id) { return customers.filter(function (c) { return c.id === id; })[0]; }

  /* ------------------------------------------------------------- render */
  function render() {
    if (!listEl) return;

    // מציגים רק לקוחות שיש להם לפחות הזמנה אחת, ממוינים לפי סך ההוצאה
    var rows = customers.filter(function (c) {
      return matchTerm(c) && ordersOf(c.id).length > 0;
    }).sort(function (a, b) {
      return totalSpent(ordersOf(b.id)) - totalSpent(ordersOf(a.id));
    });

    if (rows.length === 0) {
      listEl.innerHTML = emptyState();
      var clr = listEl.querySelector('[data-clear]');
      if (clr) clr.addEventListener('click', function () {
        state.term = '';
        container.querySelector('[data-search]').value = '';
        render();
      });
      return;
    }

    listEl.innerHTML = rows.map(rowHTML).join('');
    Array.prototype.forEach.call(listEl.querySelectorAll('.row'), function (r) {
      if (openIds[r.getAttribute('data-id')]) r.classList.add('open');
    });
  }

  function emptyState() {
    if (state.term) {
      return '<div class="empty">' + I.frameEmpty +
        '<h3>לא נמצא לקוח שמתאים לחיפוש</h3>' +
        '<p>נסה שם או טלפון אחר.</p>' +
        '<button class="btn btn--secondary" data-clear>ניקוי חיפוש</button></div>';
    }
    return '<div class="empty">' + I.frameEmpty +
      '<h3>עדיין אין לקוחות פה</h3>' +
      '<p>ברגע שתפתח הזמנה, הלקוח יופיע כאן עם כל ההיסטוריה שלו.</p></div>';
  }

  /* -------------------------------------------------------------- row HTML */
  function rowHTML(c) {
    var list = ordersOf(c.id);
    var count = list.length;
    var spent = totalSpent(list);
    var owed = openBalance(list);
    var spine = owed > 0 ? 'orange' : 'grey';
    var initial = (c.name || '?').charAt(0);

    var head =
      '<div class="row__head" role="button" tabindex="0" aria-expanded="' + !!openIds[c.id] + '" data-toggle>' +
        '<span class="cust-avatar">' + esc(initial) + '</span>' +
        '<span class="row__main">' +
          '<span class="row__name">' + esc(c.name) + '</span>' +
          '<span class="row__meta"><span class="mono">' + esc(c.phone) + '</span> · ' +
            count + ' ' + (count === 1 ? 'הזמנה' : 'הזמנות') +
            (owed > 0 ? ' · <span class="cust-owed">יתרה ' + U.fmtMoney(owed) + '</span>' : '') +
          '</span>' +
        '</span>' +
        '<span class="row__spacer"></span>' +
        '<span class="cust-total"><span class="k">סה"כ הוציא</span><b>' + U.fmtMoney(spent) + '</b></span>' +
        '<button class="btn btn--wa btn--sm cust-contact" data-action="contact" data-id="' + c.id + '">' +
          I.wa + 'צור קשר</button>' +
        I.chevron +
      '</div>';

    return '<div class="row" data-id="' + esc(c.id) + '" style="--spine:var(--st-' + spine + ')">' +
      head +
      '<div class="row__panel"><div class="inner">' + panelHTML(c, list) + '</div></div>' +
      '</div>';
  }

  function panelHTML(c, list) {
    var lines = list.map(function (o) {
      var color = statusColor(o.status);
      var bal = (o.status !== 'delivered' && o.balance > 0) ?
        '<span class="cust-order__bal">יתרה ' + U.fmtMoney(o.balance) + '</span>' :
        '<span class="cust-order__bal paid">שולם</span>';
      return '<div class="cust-order">' +
        '<span class="pill is-' + color + '"><span class="dot"></span>' + esc(U.STATUS_LABEL[o.status]) + '</span>' +
        '<span class="cust-order__id mono">#' + esc(o.orderNo) + '</span>' +
        '<span class="cust-order__desc">' + esc(o.frameDesc || 'מסגרת') +
          ' · <span class="mono">' + o.width + '×' + o.height + '</span></span>' +
        '<span class="cust-order__date">' + U.fmtDate(o.openedAt) + '</span>' +
        '<span class="cust-order__price">' + U.fmtMoney(o.price) + '</span>' +
        bal +
      '</div>';
    }).join('');

    return '<div class="mat">' +
      '<div class="cust-orders__head">היסטוריית הזמנות (' + list.length + ')</div>' +
      '<div class="cust-orders">' + lines + '</div>' +
      '<div class="actions">' +
        '<button class="btn btn--wa btn--sm" data-action="contact" data-id="' + esc(c.id) + '">' +
          I.wa + 'שלח הודעה ללקוח</button>' +
      '</div>' +
    '</div>';
  }

  /* --------------------------------------------------------------- events */
  function contact(custId) {
    var c = findCustomer(custId);
    if (!c) return;
    var list = ordersOf(custId);
    // הודעה: עותק ההזמנה האחרונה אם יש, אחרת ברכה כללית חתומה בשם החנות
    var text = list.length ? U.msgCopy(list[0]) :
      'שלום ' + c.name + ', כאן ' + Gallery.SHOP.owner + ' מ' + Gallery.SHOP.name + '. נשמח לעמוד לרשותך.';
    global.open(U.waLink(c.phone, text), '_blank');
  }

  function onClick(e) {
    var actionBtn = e.target.closest('[data-action]');
    if (actionBtn) {
      e.stopPropagation();
      if (actionBtn.getAttribute('data-action') === 'contact') {
        contact(actionBtn.getAttribute('data-id'));
      }
      return;
    }
    var toggle = e.target.closest('[data-toggle]');
    var rowEl = e.target.closest('.row');
    if (toggle && rowEl) toggleRow(rowEl, toggle);
  }

  function onKeydown(e) {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    if (e.target.closest('[data-action]')) return; // מקש על כפתור "צור קשר" לא מקפל את השורה
    var toggle = e.target.closest('[data-toggle]');
    var rowEl = e.target.closest('.row');
    if (toggle && rowEl) { e.preventDefault(); toggleRow(rowEl, toggle); }
  }

  function toggleRow(rowEl, toggle) {
    var id = rowEl.getAttribute('data-id');
    var willOpen = !rowEl.classList.contains('open');
    rowEl.classList.toggle('open', willOpen);
    toggle.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) openIds[id] = true; else delete openIds[id];
  }

  Gallery.Customers = { mount: mount };

})(window);
