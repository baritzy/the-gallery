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
  var customers = [], orders = [], payments = [];
  var openIds = {};
  var state = { term: '' };
  var pendingFocus = null; // מזהה/שם לקוח שצריך להדגיש ולגלול אליו אחרי render

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
    DB.subscribePayments(function (p) { payments = p; render(); });
  }

  /* ---------------------------------------------------------- helpers */
  function ordersOf(custId) {
    return orders.filter(function (o) { return o.customerId === custId; })
      .sort(function (a, b) { return new Date(b.openedAt) - new Date(a.openedAt); });
  }
  function totalSpent(list) {
    return list.reduce(function (s, o) { return s + Number(o.price || 0); }, 0);
  }
  // חוב פתוח = סכום היתרות הנגזרות (מחיר פחות תשלומים) על פני כל ההזמנות
  function openBalance(list) {
    return list.reduce(function (s, o) {
      return s + Math.max(0, U.balanceOf(o, payments));
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

    listEl.innerHTML = boardHead() + rows.map(rowHTML).join('');
    Array.prototype.forEach.call(listEl.querySelectorAll('.row'), function (r) {
      if (openIds[r.getAttribute('data-id')]) r.classList.add('open');
    });

    applyPendingFocus();
  }

  // שורת כותרות עמודה (board header) - עיצוב בלבד, ללא לוגיקה. אחיד עם הזמנות/מלאי.
  function boardHead() {
    return '<div class="brow--head" aria-hidden="true">' +
      '<span class="bcol"></span>' +
      '<span class="bcol bcol--name">לקוח</span>' +
      '<span class="bcol">טלפון</span>' +
      '<span class="bcol">הזמנה אחרונה</span>' +
      '<span class="bcol">סה"כ הוציא</span>' +
      '<span class="bcol">יתרה</span>' +
      '<span class="bcol">פעולה</span>' +
      '<span class="bcol"></span>' +
    '</div>';
  }

  // הדגשה + גלילה לכרטיס לקוח אחרי מעבר מטאב אחר (Gallery.openCustomer)
  function applyPendingFocus() {
    if (!pendingFocus || !listEl) return;
    var id = pendingFocus;
    pendingFocus = null;
    var el = null;
    Array.prototype.forEach.call(listEl.querySelectorAll('.row'), function (r) {
      if (r.getAttribute('data-id') === id) el = r;
    });
    if (!el) return;
    (global.requestAnimationFrame || function (f) { setTimeout(f, 16); })(function () {
      try { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); } catch (e) { el.scrollIntoView(); }
      el.classList.add('row--focus');
      setTimeout(function () { el.classList.remove('row--focus'); }, 2200);
    });
  }

  function focusCustomer(idOrName) {
    var c = customers.filter(function (x) { return x.id === idOrName; })[0] ||
            customers.filter(function (x) { return x.name === idOrName; })[0];
    if (!c) return;
    // ניקוי חיפוש כדי שהכרטיס בטוח יופיע
    state.term = '';
    var searchEl = container && container.querySelector('[data-search]');
    if (searchEl) searchEl.value = '';
    openIds[c.id] = true;
    pendingFocus = c.id;
    render();
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
    var lastOrder = list[0]; // ordersOf ממוין לפי openedAt יורד, לכן הראשון הוא האחרון שנפתח
    var hasNote = c.notes && String(c.notes).trim() !== '';

    var noteFlag = hasNote ?
      '<span class="cust-note-flag" title="קיימת הערה על הלקוח">' + I.lightbulb + 'הערה</span>' : '';
    var balCell = owed > 0 ?
      '<span class="cust-balance owed">' + U.fmtMoney(owed) + '</span>' :
      '<span class="cust-balance paid">שולם</span>';

    var head =
      '<div class="row__head" role="button" tabindex="0" aria-expanded="' + !!openIds[c.id] + '" data-toggle>' +
        '<span class="cust-avatar">' + esc(initial) + '</span>' +
        '<span class="row__main">' +
          '<span class="cust-name-row"><span class="row__name">' + esc(c.name) + '</span>' + noteFlag + '</span>' +
          '<span class="row__meta">' +
            U.plural(count, 'הזמנה אחת', 'הזמנות') +
            (owed > 0 ? '<span class="cust-meta-owed-m cust-owed"> · יתרה ' + U.fmtMoney(owed) + '</span>' : '') +
          '</span>' +
        '</span>' +
        '<span class="row__spacer"></span>' +
        '<span class="cust-phone mono">' + esc(c.phone) + '</span>' +
        '<span class="cust-last">' + (lastOrder ? U.fmtDate(lastOrder.openedAt) : '') + '</span>' +
        '<span class="cust-total">' + U.fmtMoney(spent) + '</span>' +
        balCell +
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
      var oBal = U.balanceOf(o, payments);
      var bal = (oBal > 0) ?
        '<span class="cust-order__bal">יתרה ' + U.fmtMoney(oBal) + '</span>' :
        '<span class="cust-order__bal paid">שולם</span>';
      return '<button type="button" class="cust-order" data-open-order="' + esc(o.id) + '" ' +
        'title="פתח את פירוט ההזמנה">' +
        '<span class="pill is-' + color + '"><span class="dot"></span>' + esc(U.STATUS_LABEL[o.status]) + '</span>' +
        '<span class="cust-order__id mono">#' + esc(o.orderNo) + '</span>' +
        '<span class="cust-order__desc">' + esc(o.frameDesc || 'מסגרת') +
          ' · <span class="mono">' + o.width + '×' + o.height + '</span></span>' +
        '<span class="cust-order__date">' + U.fmtDate(o.openedAt) + '</span>' +
        '<span class="cust-order__price">' + U.fmtMoney(o.price) + '</span>' +
        bal +
      '</button>';
    }).join('');

    var noteVal = c.notes ? esc(c.notes) : '';
    var notes = '<div class="cust-notes">' +
      '<label class="cust-notes__label" for="note-' + esc(c.id) + '">הערות ללקוח</label>' +
      '<textarea id="note-' + esc(c.id) + '" class="cust-notes__input" data-note-input ' +
        'placeholder="מה חשוב לזכור על הלקוח הזה. העדפות מסגור, שיחות, כל דבר.">' + noteVal + '</textarea>' +
      '<div class="cust-notes__foot">' +
        '<button type="button" class="btn btn--primary btn--sm" data-save-note data-id="' + esc(c.id) + '">' +
          I.check + 'שמור הערה</button>' +
        '<span class="cust-notes__status" data-note-status></span>' +
      '</div>' +
    '</div>';

    return '<div class="mat">' +
      notes +
      '<div class="cust-orders__head">היסטוריית הזמנות (' + list.length + ') · לחיצה על שורה פותחת את ההזמנה המלאה</div>' +
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

  function saveNote(btn) {
    var id = btn.getAttribute('data-id');
    var c = findCustomer(id);
    if (!c) return;
    var wrap = btn.closest('.cust-notes');
    var ta = wrap ? wrap.querySelector('[data-note-input]') : null;
    var status = wrap ? wrap.querySelector('[data-note-status]') : null;
    var text = ta ? ta.value.trim() : '';
    openIds[id] = true; // השאר את השורה פתוחה אחרי השמירה (המנוי מרנדר מחדש)
    if (status) status.textContent = 'שומר...';
    // saveCustomer ממזג עם הרשומה הקיימת, לכן שם וטלפון לא נדרסים
    DB.saveCustomer({ id: id, notes: text });
  }

  function onClick(e) {
    var openBtn = e.target.closest('[data-open-order]');
    if (openBtn) { e.stopPropagation(); Gallery.OrderDetail.open(openBtn.getAttribute('data-open-order')); return; }

    var noteBtn = e.target.closest('[data-save-note]');
    if (noteBtn) { e.stopPropagation(); saveNote(noteBtn); return; }

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
    // הקלדה בשדה טקסט או פעולה על כפתור פנימי לא מקפלת את השורה
    if (e.target.matches('textarea, input, button') ||
        e.target.closest('[data-action],[data-open-order],[data-save-note]')) return;
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

  Gallery.Customers = { mount: mount, focusCustomer: focusCustomer };

})(window);
