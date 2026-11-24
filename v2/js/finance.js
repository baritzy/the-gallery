/* =============================================================================
 * finance.js  -  כספים (C29 עד C34), admin בלבד. לא נטען ב-workshop.
 * OWNER: agent C (wave 3). חוזה: P-projects/The-Gallery/context/v2-contract.md
 * -----------------------------------------------------------------------------
 * - ניווט תקופות (C31): יום / שבוע / חודש / שנה, חצים, בחירת תאריך, "היום".
 * - הכנסות מחולקות (C33): הכל / הזמנות / מוצרים, סכום לכל אחד וסך הכל.
 * - סוף יום (C29 / C30): פירוט לפי אמצעי הקבלה (מזומן / אשראי / אחר / לא צוין),
 *   מספר קבלות, והתראות: תשלום בלי קבלה, סכום קבלה שלא תואם, חורים במספור.
 * - קבלות (C32): Gallery.ReceiptsUI (sales.js). הוסף הוצאה (C34) ללא שינוי.
 * הכנסה = תשלומים בהזמנות (payment.at) + מכירות מוצרים (sale.at). האמצעי מגיע מהקבלה.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var D = Gallery.data;
  var esc = U.esc;

  var EXP_CATEGORIES = ['חומרי גלם', 'שכירות', 'ציוד', 'אחר'];
  var UNITS = [['day', 'יום'], ['week', 'שבוע'], ['month', 'חודש'], ['year', 'שנה']];
  var SPLITS = [['all', 'הכל'], ['order', 'הזמנות'], ['sale', 'מוצרים']];
  var METHODS = [['cash', 'מזומן'], ['credit', 'אשראי'], ['other', 'אחר'], ['none', 'לא צוין']];
  var MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
  var DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  var CHEV_R = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  var CHEV_L = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>';

  var bodyEl = null;
  var state = { unit: 'day', anchor: new Date(), split: 'all' };

  /* ------------------------------------------------------------------ mount */
  function mount(el) {
    el.innerHTML =
      '<div class="view__head">' +
        '<div><h1 class="view__title">כספים</h1>' +
        '<p class="view__subtitle">הכנסות מהזמנות וממכירת מוצרים, סוף יום, קבלות והוצאות.</p></div>' +
        '<div class="fin-head-actions">' +
          '<button class="btn btn--primary btn--lg" data-receipts>' + I.receipt + 'קבלות</button>' +
          '<button class="btn btn--secondary btn--lg" data-sale>' + I.tag + 'מכירת מוצר</button>' +
          '<button class="btn btn--secondary btn--lg" data-add-expense>' + I.plus + 'הוסף הוצאה</button>' +
        '</div>' +
      '</div>' +
      '<div data-body></div>';
    bodyEl = el.querySelector('[data-body]');
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    ['orders', 'receipts', 'sales', 'expenses', 'customers', 'products'].forEach(function (c) { D[c].subscribe(render); });
  }

  /* ------------------------------------------------------------------ תקופה */
  function sod(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function range(unit, anchor) {
    var a = sod(anchor), start, end, label;
    if (unit === 'day') {
      start = a; end = new Date(a); end.setDate(end.getDate() + 1);
      label = 'יום ' + DAYS[a.getDay()] + ' ' + U.fmtDate(a);
    } else if (unit === 'week') {
      start = new Date(a); start.setDate(a.getDate() - a.getDay());
      end = new Date(start); end.setDate(start.getDate() + 7);
      var last = new Date(end); last.setDate(end.getDate() - 1);
      label = U.fmtDateShort(start) + ' עד ' + U.fmtDate(last);
    } else if (unit === 'month') {
      start = new Date(a.getFullYear(), a.getMonth(), 1); end = new Date(a.getFullYear(), a.getMonth() + 1, 1);
      label = MONTHS[a.getMonth()] + ' ' + a.getFullYear();
    } else {
      start = new Date(a.getFullYear(), 0, 1); end = new Date(a.getFullYear() + 1, 0, 1);
      label = String(a.getFullYear());
    }
    return { start: start, end: end, label: label };
  }
  function shift(dir) {
    var a = new Date(state.anchor);
    if (state.unit === 'day') a.setDate(a.getDate() + dir);
    else if (state.unit === 'week') a.setDate(a.getDate() + 7 * dir);
    else if (state.unit === 'month') { a.setDate(1); a.setMonth(a.getMonth() + dir); }
    else { a.setMonth(0, 1); a.setFullYear(a.getFullYear() + dir); }
    state.anchor = a;
  }
  function inR(iso, r) { if (!iso) return false; var t = new Date(iso).getTime(); return t >= r.start.getTime() && t < r.end.getTime(); }

  /* ------------------------------------------------------------------ חישובים */
  function incomeEvents(r) {
    var out = [];
    D.orders.peek().forEach(function (o) {
      (o.payments || []).forEach(function (p) {
        if (!inR(p.at, r)) return;
        out.push({ kind: 'order', at: p.at, amount: Number(p.amount || 0), order: o, payment: p, customerId: o.customerId,
          receipt: p.receiptId ? D.receipts.peekOne(p.receiptId) : null });
      });
    });
    D.sales.peek().forEach(function (s) {
      if (!inR(s.at, r)) return;
      out.push({ kind: 'sale', at: s.at, amount: Number(s.price || 0), sale: s, product: D.products.peekOne(s.productId), customerId: s.customerId,
        receipt: s.receiptId ? D.receipts.peekOne(s.receiptId) : null });
    });
    return out.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
  }
  function sum(list) { return list.reduce(function (s, x) { return s + Number(x.amount || 0); }, 0); }
  function methodOf(ev) { return ev.receipt ? (ev.receipt.method || 'none') : 'none'; }

  function alerts(r, events) {
    var out = [];
    events.forEach(function (ev) {
      var who = D.customers.nameOf(ev.customerId) || 'לקוח';
      var what = ev.kind === 'order' ? 'הזמנה ' + ev.order.number : (ev.product ? ev.product.name : 'מכירת מוצר');
      if (!ev.receipt) {
        out.push({ kind: 'missing', text: 'תשלום בלי קבלה: ' + what + ' · ' + who + ' · ' + U.fmtMoney(ev.amount) + ' (' + U.fmtDate(ev.at) + ')',
          issue: ev.kind === 'order' ?
            { source: 'order', refId: ev.order.id, paymentId: ev.payment.id, customerId: ev.customerId, amount: ev.amount } :
            { source: 'sale', refId: ev.sale.id, customerId: ev.customerId, amount: ev.amount } });
      } else if (Math.round(ev.receipt.amount) !== Math.round(ev.amount)) {
        out.push({ kind: 'mismatch', receiptId: ev.receipt.id,
          text: 'קבלה ' + ev.receipt.number + ' על ' + U.fmtMoney(ev.receipt.amount) + ', אבל התשלום (' + what + ') הוא ' + U.fmtMoney(ev.amount) });
      }
    });
    /* קבלות בתקופה שהתשלום שלהן כבר לא קיים */
    D.receipts.peek().forEach(function (rc) {
      if (!inR(rc.at, r)) return;
      var linked = rc.source === 'sale' ? !!D.sales.peekOne(rc.refId) :
        (function () { var o = D.orders.peekOne(rc.refId); return !!(o && (o.payments || []).some(function (p) { return p.id === rc.paymentId; })); })();
      if (!linked) out.push({ kind: 'orphan', receiptId: rc.id, text: 'קבלה ' + rc.number + ' (' + U.fmtMoney(rc.amount) + ') לא מקושרת לתשלום. אולי התשלום נמחק.' });
    });
    /* חורים וכפילויות במספור (כל הקבלות, מוצג כשהקבלה שאחרי החור בתקופה) */
    var all = D.receipts.peek().slice().sort(function (a, b) { return a.number - b.number; });
    for (var i = 1; i < all.length; i++) {
      var a = all[i - 1], b = all[i];
      if (!inR(b.at, r) && !inR(a.at, r)) continue;
      if (b.number === a.number) out.push({ kind: 'dup', receiptId: b.id, text: 'מספר קבלה כפול: ' + b.number });
      else if (b.number - a.number > 1) {
        var from = a.number + 1, to = b.number - 1;
        out.push({ kind: 'gap', text: 'חור במספור הקבלות: ' + (from === to ? 'חסרה קבלה ' + from : 'חסרות קבלות ' + from + ' עד ' + to) + ' (בין ' + a.number + ' ל-' + b.number + ')' });
      }
    }
    /* השוואת סכומים */
    var rcSum = sum(D.receipts.peek().filter(function (x) { return inR(x.at, r); }));
    var evSum = sum(events);
    if (Math.round(rcSum) !== Math.round(evSum)) {
      out.push({ kind: 'total', text: 'סכום הקבלות בתקופה ' + U.fmtMoney(rcSum) + ' לא תואם לסכום התשלומים ' + U.fmtMoney(evSum) + '.' });
    }
    return out;
  }

  /* ------------------------------------------------------------------ render */
  function render() {
    if (!bodyEl) return;
    var r = range(state.unit, state.anchor);
    var all = incomeEvents(r);
    var shown = state.split === 'all' ? all : all.filter(function (e) { return e.kind === state.split; });
    var exps = D.expenses.peek().filter(function (e) { return inR(e.date, r); });
    /* סבב 5: אריח "הוצאות" לחיץ, ומציג את פירוט ההוצאות לתקופה במקום התנועות */
    bodyEl.innerHTML = periodBar(r) + splitTiles(all, exps) +
      (state.split === 'expenses' ? expensesSection(r, exps) : eodSection(r, shown, all) + txnSection(shown, exps));
  }

  function expensesSection(r, exps) {
    var list = exps.slice().sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var byCat = {};
    list.forEach(function (e) { var k = e.category || 'אחר'; byCat[k] = byCat[k] || { amount: 0, n: 0 }; byCat[k].amount += Number(e.amount || 0); byCat[k].n += 1; });
    var cats = Object.keys(byCat).sort(function (a, b) { return byCat[b].amount - byCat[a].amount; });
    var total = sum(list);
    return '<section class="fin-sec fin-exp" data-exp-sec>' +
      '<h2 class="fin-sec__title">' + I.coins + 'הוצאות · ' + esc(r.label) + ' <span class="fin-sec__n">' + list.length + '</span>' +
        '<button type="button" class="btn btn--ghost btn--sm fin-exp__back" data-split="all">חזרה להכנסות</button></h2>' +
      (list.length ?
        '<div class="fin-expcats">' + cats.map(function (k) {
          var b = byCat[k];
          return '<div class="fin-expcat"><span class="fin-expcat__k">' + esc(k) + '</span><span class="fin-expcat__v">' + U.fmtMoney(b.amount) + '</span>' +
            '<span class="fin-expcat__n">' + (b.n === 1 ? 'הוצאה אחת' : b.n + ' הוצאות') + (total ? ' · ' + Math.round(b.amount * 100 / total) + '%' : '') + '</span></div>';
        }).join('') +
          '<div class="fin-expcat is-total"><span class="fin-expcat__k">סך הכל הוצאות</span><span class="fin-expcat__v">' + U.fmtMoney(total) + '</span>' +
            '<span class="fin-expcat__n">' + (list.length === 1 ? 'הוצאה אחת' : list.length + ' הוצאות') + '</span></div>' +
        '</div>' +
        '<div class="fin-explist" role="table" aria-label="פירוט הוצאות">' +
          '<div class="fin-exprow fin-exprow--head" role="row"><span>תאריך</span><span>קטגוריה</span><span>תיאור</span><span class="fin-exprow__amt">סכום</span><span></span></div>' +
          list.map(function (e) {
            return '<div class="fin-exprow" role="row" data-exp="' + esc(e.id) + '">' +
              '<span class="fin-exprow__date">' + U.fmtDate(e.date) + '</span>' +
              '<span class="fin-exprow__cat">' + esc(e.category || 'אחר') + '</span>' +
              '<span class="fin-exprow__note">' + esc(e.note || '') + '</span>' +
              '<span class="fin-exprow__amt">' + U.fmtMoney(e.amount) + '</span>' +
              '<button class="iconbtn" data-del-expense="' + esc(e.id) + '" aria-label="מחיקת הוצאה" title="מחיקה">' + I.trash + '</button></div>';
          }).join('') +
        '</div>' :
        '<div class="empty"><p>אין הוצאות בתקופה הזו. אפשר לעבור לתקופה אחרת או להוסיף הוצאה.</p>' +
          '<button class="btn btn--secondary" data-add-expense>' + I.plus + 'הוסף הוצאה</button></div>') +
    '</section>';
  }

  function segHTML(attr, opts, cur, label) {
    return '<div class="seg fin-seg" role="radiogroup" aria-label="' + esc(label) + '">' + opts.map(function (o) {
      return '<button type="button" role="radio" ' + attr + '="' + o[0] + '" aria-checked="' + (o[0] === cur) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  function periodBar(r) {
    var isNow = r.end.getTime() > Date.now();
    return '<div class="fin-period">' +
      segHTML('data-unit', UNITS, state.unit, 'יחידת זמן') +
      '<div class="fin-nav">' +
        '<button class="fin-nav__btn" data-nav="-1" aria-label="תקופה קודמת">' + CHEV_R + '</button>' +
        '<div class="fin-nav__label">' + esc(r.label) + '</div>' +
        '<button class="fin-nav__btn" data-nav="1" aria-label="תקופה הבאה"' + (isNow ? ' disabled' : '') + '>' + CHEV_L + '</button>' +
      '</div>' +
      '<label class="fin-date"><span>מעבר לתאריך</span><input type="date" data-date value="' + U.toDateInput(state.anchor) + '" max="' + U.toDateInput(new Date()) + '"></label>' +
      '<button class="btn btn--secondary fin-today" data-today' + (isNow ? ' disabled' : '') + '>היום</button>' +
    '</div>';
  }

  function splitTiles(all, exps) {
    var ord = all.filter(function (e) { return e.kind === 'order'; }), sal = all.filter(function (e) { return e.kind === 'sale'; });
    var inc = sum(all), ex = sum(exps);
    function tile(id, label, list, tone) {
      return '<button type="button" class="fin-tile fin-c-' + tone + (state.split === id ? ' is-on' : '') + '" data-split="' + id + '" aria-pressed="' + (state.split === id) + '">' +
        '<span class="fin-tile__k">' + esc(label) + '</span><span class="fin-tile__v">' + U.fmtMoney(sum(list)) + '</span>' +
        '<span class="fin-tile__s">' + (list.length === 1 ? 'תשלום אחד' : list.length + ' תשלומים') + '</span></button>';
    }
    return '<div class="fin-split">' +
      '<div class="fin-split__head"><span>הכנסות</span>' + segHTML('data-split', SPLITS, state.split, 'סוג הכנסה') + '</div>' +
      '<div class="fin-tiles">' +
        tile('order', 'מהזמנות מסגור', all.filter(function (e) { return e.kind === 'order'; }), 'blue') +
        tile('sale', 'ממכירת מוצרים', sal, 'green') +
        tile('all', 'סך הכל הכנסות', all, 'primary') +
        '<button type="button" class="fin-tile fin-c-orange' + (state.split === 'expenses' ? ' is-on' : '') + '" data-split="expenses" aria-pressed="' + (state.split === 'expenses') + '">' +
          '<span class="fin-tile__k">הוצאות</span><span class="fin-tile__v">' + U.fmtMoney(ex) + '</span>' +
          '<span class="fin-tile__s">' + (exps.length === 1 ? 'הוצאה אחת' : exps.length + ' הוצאות') + ' · רווח: ' + U.fmtMoney(inc - ex) + '</span></button>' +
      '</div>' +
      (ord.length + sal.length ? '' : '<p class="fin-muted">אין הכנסות בתקופה הזו.</p>') +
    '</div>';
  }

  function eodSection(r, shown, all) {
    var by = {};
    METHODS.forEach(function (m) { by[m[0]] = { amount: 0, n: 0 }; });
    shown.forEach(function (ev) { var b = by[methodOf(ev)]; b.amount += ev.amount; b.n += 1; });
    var receipts = D.receipts.peek().filter(function (x) { return inR(x.at, r); });
    var al = alerts(r, all);
    var title = state.unit === 'day' ? 'סוף יום · ' + r.label : 'פירוט לפי אמצעי תשלום · ' + r.label;
    var splitNote = state.split === 'all' ? '' : ' (' + (state.split === 'order' ? 'הזמנות בלבד' : 'מוצרים בלבד') + ')';
    return '<section class="fin-sec fin-eod">' +
      '<h2 class="fin-sec__title">' + I.wallet + esc(title + splitNote) + '</h2>' +
      '<div class="fin-methods">' + METHODS.map(function (m) {
        var b = by[m[0]];
        return '<div class="fin-method is-' + m[0] + (b.n ? '' : ' is-empty') + '"><span class="fin-method__k">' + esc(m[1]) + '</span>' +
          '<span class="fin-method__v">' + U.fmtMoney(b.amount) + '</span><span class="fin-method__n">' + (b.n === 1 ? 'תשלום אחד' : b.n + ' תשלומים') + '</span></div>';
      }).join('') +
        '<div class="fin-method is-receipts"><span class="fin-method__k">קבלות שהונפקו</span><span class="fin-method__v">' + receipts.length + '</span>' +
          '<span class="fin-method__n">על סך ' + U.fmtMoney(sum(receipts)) + '</span></div>' +
      '</div>' +
      '<div class="fin-alerts' + (al.length ? ' has-alerts' : '') + '" data-alerts>' +
        '<div class="fin-alerts__head">' + (al.length ? I.alert + 'התראות על קבלות (' + al.length + ')' : I.check + 'אין בעיות בקבלות בתקופה הזו') + '</div>' +
        al.map(function (a, i) {
          var act = '';
          if (a.issue) act = '<button class="btn btn--primary btn--sm" data-issue="' + i + '">' + I.receipt + 'הנפק קבלה</button>';
          else if (a.receiptId) act = '<button class="btn btn--secondary btn--sm" data-rview="' + esc(a.receiptId) + '">פתח קבלה</button>';
          return '<div class="fin-alert is-' + a.kind + '"><span>' + esc(a.text) + '</span>' + act + '</div>';
        }).join('') +
      '</div>' +
    '</section>';
  }

  function txnSection(shown, exps) {
    var rows = shown.map(function (ev) { return { at: ev.at, ev: ev }; });
    if (state.split === 'all') exps.forEach(function (e) { rows.push({ at: e.date, exp: e }); });
    rows.sort(function (a, b) { return new Date(b.at) - new Date(a.at); });
    var html = rows.map(function (row) {
      if (row.exp) {
        var e = row.exp;
        return '<div class="fin-row is-exp"><span class="fin-row__badge">הוצאה</span>' +
          '<span class="fin-row__main"><b>' + esc(e.category || 'הוצאה') + '</b><small>' + esc(e.note || '') + '</small></span>' +
          '<span class="fin-row__date">' + U.fmtDate(e.date) + '</span><span class="fin-row__m"></span>' +
          '<span class="fin-row__amt is-neg">-' + U.fmtMoney(e.amount) + '</span>' +
          '<button class="iconbtn" data-del-expense="' + esc(e.id) + '" aria-label="מחיקת הוצאה" title="מחיקה">' + I.trash + '</button></div>';
      }
      var ev = row.ev, who = D.customers.nameOf(ev.customerId) || 'לקוח';
      var main = ev.kind === 'order' ?
        '<button type="button" class="fin-row__num mono" data-order="' + esc(ev.order.id) + '" title="פתח הזמנה">' + esc(ev.order.number) + '</button>' +
          '<span class="fin-row__main"><b>' + esc(who) + '</b><small>' + esc(D.orders.PAYMENT_TYPES[ev.payment.type] || 'תשלום') + '</small></span>' :
        '<span class="fin-row__num fin-row__num--sale">' + I.tag + '</span>' +
          '<span class="fin-row__main"><b>' + esc(ev.product ? ev.product.name : 'מוצר') + '</b><small>' + esc(who) + '</small></span>';
      var rc = ev.receipt ?
        '<button type="button" class="fin-row__rc mono" data-rview="' + esc(ev.receipt.id) + '">קבלה ' + esc(ev.receipt.number) + '</button>' :
        '<span class="fin-row__rc is-missing">אין קבלה</span>';
      return '<div class="fin-row is-' + ev.kind + '"><span class="fin-row__badge">' + (ev.kind === 'order' ? 'הזמנה' : 'מוצר') + '</span>' + main +
        '<span class="fin-row__date">' + U.fmtDate(ev.at) + ' ' + U.fmtTime(ev.at) + '</span>' +
        '<span class="fin-row__m">' + esc(ev.receipt ? Gallery.receipts.methodLabel(ev.receipt.method) : 'לא צוין') + ' · ' + rc + '</span>' +
        '<span class="fin-row__amt">' + U.fmtMoney(ev.amount) + '</span></div>';
    }).join('');
    return '<section class="fin-sec"><h2 class="fin-sec__title">' + I.coins + 'תנועות בתקופה <span class="fin-sec__n">' + rows.length + '</span></h2>' +
      (rows.length ? '<div class="fin-rows">' + html + '</div>' : '<div class="empty"><p>אין תנועות בתקופה הזו. אפשר לעבור לתקופה אחרת.</p></div>') +
    '</section>';
  }

  /* ------------------------------------------------------------------ אירועים */
  function onClick(e) {
    var t = e.target, el;
    if (t.closest('[data-receipts]')) { Gallery.ReceiptsUI.openList(); return; }
    if (t.closest('[data-sale]')) { Gallery.SalesUI.pickProduct(); return; }
    if (t.closest('[data-add-expense]')) { openExpenseForm(); return; }
    if ((el = t.closest('[data-unit]'))) { state.unit = el.getAttribute('data-unit'); render(); return; }
    if ((el = t.closest('[data-split]'))) { state.split = el.getAttribute('data-split'); render(); return; }
    if ((el = t.closest('[data-nav]'))) { if (!el.disabled) { shift(Number(el.getAttribute('data-nav'))); render(); } return; }
    if (t.closest('[data-today]')) { state.anchor = new Date(); render(); return; }
    if ((el = t.closest('[data-order]'))) { Gallery.openOrder(el.getAttribute('data-order')); return; }
    if ((el = t.closest('[data-rview]'))) { Gallery.ReceiptsUI.openView(el.getAttribute('data-rview')); return; }
    if ((el = t.closest('[data-issue]'))) {
      var r = range(state.unit, state.anchor);
      var a = alerts(r, incomeEvents(r))[Number(el.getAttribute('data-issue'))];
      if (a && a.issue) Gallery.ReceiptsUI.issueFor(a.issue, 'קבלה לתשלום שחסרה לו');
      return;
    }
    if ((el = t.closest('[data-del-expense]'))) {
      var ex = D.expenses.peekOne(el.getAttribute('data-del-expense'));
      if (ex) Gallery.deleteRecord({ collection: 'expenses', id: ex.id,
        label: 'ההוצאה "' + (ex.category || 'הוצאה') + (ex.note ? ', ' + ex.note : '') + '" ' + U.fmtMoney(ex.amount) });
    }
  }
  function onChange(e) {
    var d = e.target.closest('[data-date]');
    if (d && d.value) { state.anchor = new Date(U.fromDateInput(d.value)); render(); }
  }

  /* ------------------------------------------------------------------ הוסף הוצאה (C34, ללא שינוי) */
  function openExpenseForm() {
    var node = Gallery.modalNode({
      title: 'הוספת הוצאה',
      body: '<form data-form onsubmit="return false"><div class="form-grid">' +
        '<div class="form-field"><label for="exp-amount">סכום (₪)</label><input id="exp-amount" name="amount" type="number" inputmode="numeric" min="0" step="1" required></div>' +
        '<div class="form-field"><label for="exp-cat">קטגוריה</label><select id="exp-cat" name="category">' +
          EXP_CATEGORIES.map(function (c) { return '<option value="' + esc(c) + '">' + esc(c) + '</option>'; }).join('') + '</select></div>' +
        '<div class="form-field col-2"><label for="exp-note">הערה</label><input id="exp-note" name="note" type="text" placeholder="לדוגמה: הזמנת פרופילים"></div>' +
        '<div class="form-field col-2"><label for="exp-date">תאריך</label><input id="exp-date" name="date" type="date" value="' + U.toDateInput(new Date()) + '"></div>' +
      '</div></form>',
      foot: '<button class="btn btn--primary btn--lg" data-save>' + I.check + 'שמור הוצאה</button><button class="btn btn--ghost" data-close>ביטול</button>'
    });
    node.querySelector('[data-save]').addEventListener('click', function () {
      var btn = this;
      if (btn.disabled) return;   // QA O4: הקשה כפולה לא שומרת פעמיים
      var f = node.querySelector('[data-form]');
      var val = function (n) { return f.querySelector('[name="' + n + '"]').value.trim(); };
      var amount = Math.round(parseFloat(val('amount')) || 0);
      if (amount <= 0) { Gallery.toast('צריך סכום גדול מאפס'); f.querySelector('[name="amount"]').focus(); return; }
      btn.disabled = true;
      D.expenses.save({ amount: amount, category: val('category') || 'אחר', note: val('note'), supplierId: null,
        date: val('date') ? U.fromDateInput(val('date')) : new Date().toISOString() })
        .then(function () { Gallery.closeModal(); Gallery.toast('ההוצאה נשמרה'); })
        .catch(function (err) { btn.disabled = false; Gallery.toast('השמירה נכשלה: ' + (err && err.message ? err.message : err)); });
    });
    Gallery.openModal(node);
  }

  Gallery.Finance = { mount: mount, onShow: render };
  Gallery.registerView('finance', Gallery.Finance);

})(window);
