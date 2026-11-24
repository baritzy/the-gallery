/* =============================================================================
 * orders.js  -  טאב "הזמנות" (admin בלבד): רשימה + כרטיס הזמנה
 * OWNER: foundation (wave 2).  קבצים נלווים: orders-form.js, orders-pay.js
 * C6: מספר ההזמנה הוא הדבר המרכזי. שם הלקוח משני, בקצה.
 * C7: חדשה=כחול, בעבודה=צהוב, מוכנה=ירוק. דגל אדום עם סיבה גובר על הצבע.
 * C10: אין "הדפסת כרטיס עבודה".
 * חושף: Gallery.openOrder(orderId)
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;
  var D = Gallery.data;

  var container = null, listEl = null;
  var orders = [];
  var state = { term: '', filter: 'active', sort: 'due' };
  var card = { id: null, node: null };

  var FILTERS = [
    { id: 'active', label: 'פתוחות' },
    { id: 'new', label: 'חדשות' },
    { id: 'in_progress', label: 'בעבודה' },
    { id: 'ready', label: 'מוכנות' },
    { id: 'blocked', label: 'תקועות' },
    { id: 'delivered', label: 'נמסרו' }
  ];

  /* ------------------------------------------------------------------ mount */
  function mount(el) {
    container = el;
    container.innerHTML =
      '<div class="view__head">' +
        '<div><h1 class="view__title">הזמנות</h1>' +
        '<p class="view__subtitle">לחיצה על הזמנה פותחת את הכרטיס שלה.</p></div>' +
        '<button class="btn btn--primary btn--lg" data-new>' + I.plus + 'הזמנה חדשה</button>' +
      '</div>' +
      '<div class="toolbar">' +
        '<div class="search">' + I.search +
          '<input type="search" data-search placeholder="חיפוש: מספר הזמנה, שם, טלפון" aria-label="חיפוש הזמנות"></div>' +
        '<select class="select" data-sort aria-label="מיון">' +
          '<option value="due">לפי מועד מסירה</option>' +
          '<option value="number">לפי מספר הזמנה</option>' +
        '</select>' +
      '</div>' +
      '<div class="chips chips--orders" data-filters></div>' +
      '<div class="olist" data-list></div>';

    listEl = container.querySelector('[data-list]');
    container.querySelector('[data-new]').addEventListener('click', function () { Gallery.OrdersForm.open(null); });
    container.querySelector('[data-search]').addEventListener('input', function (e) { state.term = e.target.value.trim(); render(); });
    container.querySelector('[data-sort]').addEventListener('change', function (e) { state.sort = e.target.value; render(); });
    container.querySelector('[data-filters]').addEventListener('click', function (e) {
      var b = e.target.closest('[data-filter]');
      if (!b) return;
      state.filter = b.getAttribute('data-filter');
      render();
    });
    listEl.addEventListener('click', onListClick);

    D.orders.subscribe(function (list) { orders = list; render(); refreshCard(); });
    D.customers.subscribe(function () { render(); refreshCard(); });
    D.receipts.subscribe(function () { refreshCard(); });
  }

  /* ---------------------------------------------------------------- filters */
  function match(o, f) {
    if (f === 'active') return o.status !== 'delivered';
    if (f === 'blocked') return U.isBlocked(o) && o.status !== 'delivered';
    if (f === 'delivered') return o.status === 'delivered';
    return o.status === f && o.status !== 'delivered';
  }
  function matchTerm(o) {
    if (!state.term) return true;
    var t = state.term.toLowerCase();
    var c = D.customers.peekOne(o.customerId) || {};
    if (String(o.number).indexOf(t) !== -1) return true;
    if ((c.name || '').toLowerCase().indexOf(t) !== -1) return true;
    if (String(c.phone || '').replace(/\D/g, '').indexOf(t.replace(/\D/g, '') || '#') !== -1) return true;
    return (o.items || []).some(function (it) { return (it.desc || '').toLowerCase().indexOf(t) !== -1; });
  }

  function renderFilters() {
    var wrap = container.querySelector('[data-filters]');
    wrap.innerHTML = FILTERS.map(function (f) {
      var n = orders.filter(function (o) { return match(o, f.id); }).length;
      return '<button class="fchip fchip--' + f.id + '" data-filter="' + f.id + '" aria-pressed="' + (state.filter === f.id) + '">' +
        esc(f.label) + '<span class="cnt">' + n + '</span></button>';
    }).join('');
  }

  /* ------------------------------------------------------------------- list */
  function render() {
    if (!listEl) return;
    renderFilters();
    var blockedCount = orders.filter(function (o) { return U.isBlocked(o) && o.status !== 'delivered'; }).length;
    Gallery.updateBadge('orders', blockedCount);

    var rows = orders.filter(function (o) { return match(o, state.filter) && matchTerm(o); });
    rows.sort(function (a, b) {
      if (state.filter !== 'delivered') {
        var ba = U.isBlocked(a), bb = U.isBlocked(b);
        if (ba !== bb) return ba ? -1 : 1;
      }
      if (state.sort === 'number' || state.filter === 'delivered') return b.number - a.number;
      return new Date(a.dueDate) - new Date(b.dueDate);
    });

    if (!rows.length) {
      listEl.innerHTML = '<div class="empty">' + I.frameEmpty +
        (state.term || state.filter !== 'active' ?
          '<h3>לא נמצאו הזמנות</h3><p>אפשר לנקות את החיפוש או לבחור סינון אחר.</p>' :
          '<h3>אין הזמנות פתוחות</h3><p>הזמנה חדשה תופיע כאן וגם בטבלת העבודה בסדנה.</p>') + '</div>';
      return;
    }
    listEl.innerHTML = '<div class="olist__head" aria-hidden="true"><span>מס\' הזמנה</span><span>סטטוס</span><span>תמונות</span><span>מסירה</span><span class="money">יתרה</span><span>לקוח</span><span></span></div>' +
      rows.map(rowHTML).join('');
  }

  function rowHTML(o) {
    var look = U.orderLook(o);
    var c = D.customers.peekOne(o.customerId) || {};
    var items = o.items || [];
    var done = items.filter(function (i) { return i.done; }).length;
    var n = U.daysUntil(o.dueDate);
    var late = o.status !== 'delivered' && o.status !== 'ready' && n != null && n < 0;
    var tone = U.visitTone(D.customers.visitCount(o.customerId));
    var bal = D.orders.balance(o);
    var firstDesc = items[0] && items[0].desc ? items[0].desc : '';

    return '<div class="orow' + (look.key === 'blocked' ? ' is-blocked' : '') + '" style="--spine:' + U.statusVar(look.color) + '">' +
      '<button class="orow__main" data-open="' + esc(o.id) + '" aria-label="הזמנה ' + esc(o.number) + '">' +
        '<span class="orow__num">' + esc(o.number) + '</span>' +
        '<span class="orow__status"><span class="pill is-' + look.color + '">' + esc(look.label) + '</span>' +
          (look.reason ? '<span class="orow__reason">' + esc(look.reason) + '</span>' : '') + '</span>' +
        '<span class="orow__items"><span><b>' + U.plural(items.length, 'תמונה אחת', 'תמונות') + '</b>' +
          (items.length > 1 && done ? ' · ' + done + ' בוצעו' : '') + '</span>' +
          (firstDesc ? '<span class="orow__desc">' + esc(firstDesc) + '</span>' : '') + '</span>' +
        '<span class="orow__due' + (late ? ' is-late' : '') + '">' +
          (o.status === 'delivered' ? 'נמסרה ' + U.fmtDateShort(o.deliveredAt) : U.fmtDateShort(o.dueDate) + '<small>' + esc(U.dueText(o.dueDate)) + '</small>') + '</span>' +
        '<span class="orow__bal money' + (bal > 0 ? ' is-owed' : '') + '">' + (bal > 0 ? U.fmtMoney(bal) : bal < 0 ? 'שולם ביתר' : 'שולם') + '</span>' +
        '<span class="orow__cust' + (tone ? ' tone-' + tone : '') + '">' + esc(c.name || '') + '</span>' +
      '</button>' +
      (o.status !== 'delivered' ?
        '<button class="orow__flag' + (U.isBlocked(o) ? ' is-on' : '') + '" data-flag="' + esc(o.id) + '" aria-label="' +
          (U.isBlocked(o) ? 'הסרת דגל אדום' : 'סימון בדגל אדום') + '" title="' + (U.isBlocked(o) ? 'הסרת דגל אדום' : 'סימון בדגל אדום') + '">' + I.flag + '</button>' :
        '<span class="orow__flag-sp"></span>') +
    '</div>';
  }

  function onListClick(e) {
    var f = e.target.closest('[data-flag]');
    if (f) { Gallery.openBlockedFlag(f.getAttribute('data-flag')); return; }
    var b = e.target.closest('[data-open]');
    if (b) openOrder(b.getAttribute('data-open'));
  }

  /* ------------------------------------------------------------ order card */
  function openOrder(orderId) {
    if (orderId && orderId.id) orderId = orderId.id;
    var o = D.orders.peekOne(orderId);
    if (!o) return;
    var node = document.createElement('div');
    node.className = 'modal ocard';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    card.id = o.id;
    card.node = node;
    node.innerHTML = cardHTML(o);
    node.addEventListener('click', onCardClick);
    node.addEventListener('change', onCardChange);
    Gallery.openModal(node, { wide: true, focus: false, onClose: function () { card.id = null; card.node = null; } });
  }

  function refreshCard() {
    if (!card.node || !document.body.contains(card.node)) return;
    var o = D.orders.peekOne(card.id);
    if (!o) { Gallery.closeModal(); return; }
    var scroll = card.node.parentNode ? card.node.parentNode.scrollTop : 0;
    card.node.innerHTML = cardHTML(o);
    if (card.node.parentNode) card.node.parentNode.scrollTop = scroll;
  }

  function cardHTML(o) {
    var look = U.orderLook(o);
    var c = D.customers.peekOne(o.customerId) || {};
    var visits = D.customers.visitCount(o.customerId);
    var tone = U.visitTone(visits);
    var paid = D.orders.paid(o), bal = D.orders.balance(o);
    var blocked = U.isBlocked(o);

    var head =
      '<div class="ocard__head" style="--spine:' + U.statusVar(look.color) + '">' +
        '<div class="ocard__numwrap"><span class="ocard__numlbl">הזמנה מס\'</span><span class="ocard__num">' + esc(o.number) + '</span></div>' +
        '<div class="ocard__headmid"><span class="pill pill--lg is-' + look.color + '">' + esc(look.label) + '</span>' +
          (blocked ? '<span class="ocard__under">סטטוס: ' + esc(look.statusLabel) + '</span>' : '') + '</div>' +
        '<div class="ocard__cust">' +
          '<button class="ocard__custname link-cust' + (tone ? ' tone-' + tone : '') + '" data-cust="' + esc(o.customerId || '') + '">' + esc(c.name || 'לקוח') + '</button>' +
          '<span class="ocard__phone mono">' + esc(c.phone || '') + '</span>' +
          (visits > 1 ? '<span class="ocard__visits">ביקור ' + visits + '</span>' : '') +
        '</div>' +
        '<button class="modal__close" data-close aria-label="סגירה">×</button>' +
      '</div>';

    var flag = blocked ?
      '<div class="ocard__flag">' + I.flag +
        '<div><b>' + esc(U.BLOCK_KIND_LABEL[o.blocked.kind] || 'תקועה') + ':</b> ' + esc(o.blocked.reason) +
        '<small>מאז ' + U.fmtDate(o.blocked.since) + '</small></div>' +
        '<button class="btn btn--secondary" data-flag>נפתר</button></div>' : '';

    var statusBar = '<div class="ocard__statusbar" role="group" aria-label="שינוי סטטוס">' +
      U.STATUS_LIST.map(function (s) {
        var on = o.status === s;
        return '<button class="sbtn sbtn--' + U.STATUS_COLOR[s] + (on ? ' is-on' : '') + '" data-status="' + s + '" aria-pressed="' + on + '">' + esc(U.STATUS_LABEL[s]) + '</button>';
      }).join('') +
      (!blocked && o.status !== 'delivered' ? '<button class="sbtn sbtn--flag" data-flag>' + I.flag + 'דגל אדום</button>' : '') +
      '</div>';

    var items = (o.items || []).map(function (it) {
      return '<tr class="' + (it.done ? 'is-done' : '') + '">' +
        '<td class="mono">' + esc(D.orders.itemLabel(it, o)) + '</td>' +
        '<td class="c">' + (it.mount ? '✓' : '') + '</td>' +
        '<td class="c">' + (it.mat ? '✓' : '') + '</td>' +
        '<td>' + esc(it.desc || '') + '</td>' +
        '<td class="c"><span class="matl matl--' + (it.material || 'none') + '">' + esc(it.material || '·') + '</span></td>' +
        '<td class="mono">' + esc(U.fmtSize(it.widthCm, it.heightCm)) + '</td>' +
        '<td class="mono">' + esc(it.profileSku || '') + '</td>' +
        '<td class="c"><label class="bigcheck"><input type="checkbox" data-done="' + esc(it.id) + '"' + (it.done ? ' checked' : '') + '><span></span></label></td>' +
        '<td>' + esc(it.note || '') + '</td>' +
      '</tr>';
    }).join('');

    var itemsTable =
      '<div class="ocard__section"><div class="ocard__sechead">תמונות בהזמנה</div>' +
      '<div class="tablewrap"><table class="wtable">' +
        '<thead><tr><th>מס\' תמונה</th><th>הדבקה</th><th>מט</th><th>תיאור תמונה</th><th>חומר</th><th>מידות</th><th>סוג מסגרת</th><th>בוצע</th><th>הערות</th></tr></thead>' +
        '<tbody>' + items + '</tbody></table></div></div>';

    var dates =
      '<div class="ocard__facts">' +
        fact('נפתחה', U.fmtDate(o.createdAt)) +
        '<div class="fact"><div class="fact__k">מועד מסירה</div><div class="fact__v"><input type="date" class="dateinput" data-due value="' + U.toDateInput(o.dueDate) + '"></div></div>' +
        (o.status === 'delivered' ? fact('נמסרה', U.fmtDate(o.deliveredAt)) : fact('', esc(U.dueText(o.dueDate)))) +
      '</div>';

    var notes = o.notes ? '<div class="ocard__notes"><b>הערות:</b> ' + esc(o.notes) + '</div>' : '';

    var pays = (o.payments || []).slice().sort(function (a, b) { return new Date(a.at) - new Date(b.at); }).map(function (p) {
      var r = p.receiptId ? D.receipts.peekOne(p.receiptId) : null;
      return '<div class="payline">' +
        '<span class="payline__type">' + esc(D.orders.PAYMENT_TYPES[p.type] || p.type) + '</span>' +
        '<span class="payline__date">' + U.fmtDate(p.at) + '</span>' +
        '<span class="payline__amt">' + U.fmtMoney(p.amount) + '</span>' +
        (r ? '<span class="payline__rcpt">קבלה ' + esc(r.number) + ' · ' + esc(Gallery.receipts.methodLabel(r.method)) + '</span>' :
          '<button class="btn btn--sm btn--warn" data-issue="' + esc(p.id) + '">' + I.alert + 'חסרה קבלה, להפיק</button>') +
        '<button class="payline__x" data-delpay="' + esc(p.id) + '" aria-label="מחיקת תשלום" title="מחיקת תשלום">×</button>' +
      '</div>';
    }).join('') || '<div class="pay-empty">עדיין לא נרשם תשלום.</div>';

    var money =
      '<div class="ocard__section ocard__money money"><div class="ocard__sechead">תשלומים</div>' +
        '<div class="ocard__sums">' + fact('מחיר', U.fmtMoney(o.price)) + fact('שולם', U.fmtMoney(paid)) +
          '<div class="fact fact--strong' + (bal > 0 ? ' is-owed' : '') + '"><div class="fact__k">' + (bal < 0 ? 'שולם ביתר' : 'יתרה') + '</div><div class="fact__v">' + U.fmtMoney(Math.abs(bal)) + '</div></div></div>' +
        '<div class="paylist">' + pays + '</div>' +
      '</div>';

    var foot =
      '<div class="modal__foot ocard__foot">' +
        '<button class="btn btn--primary btn--lg money" data-pay>' + I.wallet + 'רשום תשלום</button>' +
        '<button class="btn btn--wa" data-wa-copy>' + I.wa + 'שלח עותק הזמנה</button>' +
        (o.status === 'ready' ? '<button class="btn btn--wa" data-wa-ready>' + I.wa + 'ההזמנה מוכנה</button>' : '') +
        '<button class="btn btn--secondary" data-edit>' + I.edit + 'עריכה</button>' +
        '<span class="ocard__footsp"></span>' +
        '<button class="btn btn--danger" data-delete>' + I.trash + 'מחיקה</button>' +
      '</div>';

    return head + '<div class="modal__body">' + flag + statusBar + itemsTable + dates + notes + money + '</div>' + foot;
  }
  function fact(k, v) { return '<div class="fact"><div class="fact__k">' + k + '</div><div class="fact__v">' + v + '</div></div>'; }

  function onCardClick(e) {
    var o = D.orders.peekOne(card.id);
    if (!o) return;
    var t = e.target;
    var el;
    if (t.closest('[data-close]')) { Gallery.closeModal(); return; }
    if ((el = t.closest('[data-status]'))) { D.orders.setStatus(o.id, el.getAttribute('data-status')); return; }
    if (t.closest('[data-flag]')) { reopenAfter(o.id, function (done) { Gallery.openBlockedFlag(o.id, { onClose: done }); }); return; }
    if ((el = t.closest('[data-cust]'))) { var cid = el.getAttribute('data-cust'); Gallery.closeModal(); Gallery.openCustomer(cid); return; }
    if (t.closest('[data-pay]')) { Gallery.OrdersPay.openPayment(o.id); return; }
    if ((el = t.closest('[data-issue]'))) { Gallery.OrdersPay.openReceiptStep(o.id, el.getAttribute('data-issue')); return; }
    if ((el = t.closest('[data-delpay]'))) {
      var pid = el.getAttribute('data-delpay');
      var pay = (o.payments || []).filter(function (p) { return p.id === pid; })[0];
      if (!pay) return;
      var plabel = (D.orders.PAYMENT_TYPES[pay.type] || 'תשלום') + ' ' + U.fmtMoney(pay.amount) + ' (הזמנה ' + o.number + ')';
      Gallery.confirmDelete({
        label: 'התשלום ' + plabel, detail: 'הקבלה שהונפקה (אם יש) לא נמחקת.',
        onDelete: function () { return D.trash.movePayment(o.id, pid, 'תשלום ' + plabel); }
      });
      return;
    }
    if (t.closest('[data-wa-copy]')) { Gallery.whatsapp(custPhone(o), U.msgOrderCopy(o)); return; }
    if (t.closest('[data-wa-ready]')) { Gallery.whatsapp(custPhone(o), U.msgReady(o)); return; }
    if (t.closest('[data-edit]')) { Gallery.OrdersForm.open(o.id); return; }
    if (t.closest('[data-delete]')) {
      var who = D.customers.nameOf(o.customerId);
      Gallery.deleteRecord({
        collection: 'orders', id: o.id, label: 'הזמנה ' + o.number + (who ? ' של ' + who : ''),
        detail: 'שורות הספק, הקבלות והתשלומים שלה לא נמחקים, והשחזור מחזיר הכל כמו שהיה.',
        onDone: function () { Gallery.closeModal(); }
      });
    }
  }
  function onCardChange(e) {
    var o = D.orders.peekOne(card.id);
    if (!o) return;
    var t = e.target;
    if (t.matches('[data-done]')) { D.orders.setItemDone(o.id, t.getAttribute('data-done'), t.checked); return; }
    if (t.matches('[data-due]') && t.value) { o.dueDate = U.fromDateInput(t.value); D.orders.save(o); }
  }
  function custPhone(o) { var c = D.customers.peekOne(o.customerId); return c ? c.phone : ''; }

  /* פותח מודל אחר ואז חוזר לכרטיס ההזמנה כשהוא נסגר */
  function reopenAfter(orderId, openFn) {
    openFn(function () { global.setTimeout(function () { openOrder(orderId); }, 0); });
  }

  Gallery.openOrder = openOrder;
  Gallery.Orders = { mount: mount, open: openOrder };
  Gallery.registerView('orders', Gallery.Orders);

})(window);
