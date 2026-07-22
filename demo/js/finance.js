/* =============================================================================
 * finance.js  -  מודול "כספים" (טאב 5, בין תזכורות לתובנות)
 * ארכיון ומעקב פיננסי. בורר תקופה (יום / שבוע / חודש / שנה) עם ניווט אחורה
 * וקדימה בזמן. לכל תקופה: הכנסות (כסף שנגבה בפועל מ-collection payments),
 * הוצאות (collection expenses), רווח, פירוט לפי אמצעי תשלום, רשימת תנועות,
 * והשוואה לתקופה הקודמת. באותה שכבת נתונים אסינכרונית ובאותם טוקנים/עיצוב.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var DB = Gallery.DB;
  var U = Gallery.util;
  var I = Gallery.icons;
  var SHOP = Gallery.SHOP;
  var esc = U.esc;

  var EXP_CATEGORIES = ['חומרי גלם', 'שכירות', 'ציוד', 'אחר'];
  var UNITS = [
    { id: 'day',   label: 'יום' },
    { id: 'week',  label: 'שבוע' },
    { id: 'month', label: 'חודש' },
    { id: 'year',  label: 'שנה' }
  ];
  var MONTHS_HE = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  // אייקוני ניווט זמן (מקומי למודול). ב-RTL: קודמת בימין (מצביע ימינה), הבאה בשמאל.
  var CHEV_R = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
  var CHEV_L = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>';

  var container = null, bodyEl = null;
  var payments = [], expenses = [], orders = [], customers = [];
  var loaded = { payments: false, expenses: false };
  var state = { unit: 'month', offset: 0 };

  /* ------------------------------------------------------------------ mount */
  function mount(el) {
    container = el;
    container.innerHTML =
      '<div class="view__head">' +
        '<div><h1 class="view__title">כספים</h1>' +
        '<p class="view__subtitle">ארכיון ומעקב פיננסי. הכנסות שנגבו בפועל, הוצאות ורווח לכל תקופה.</p></div>' +
        '<div class="fin-head-actions">' +
          '<button class="btn btn--secondary" data-add-expense>' + I.plus + 'הוסף הוצאה</button>' +
          '<button class="btn btn--primary" data-receipts>' + I.receipt + 'הפק קבלות לרו"ח</button>' +
        '</div>' +
      '</div>' +
      '<div data-body></div>';

    bodyEl = container.querySelector('[data-body]');
    container.addEventListener('click', onClick);

    DB.subscribePayments(function (p) { payments = p; loaded.payments = true; render(); });
    DB.subscribeExpenses(function (e) { expenses = e; loaded.expenses = true; render(); });
    DB.subscribeOrders(function (o) { orders = o; render(); });
    DB.subscribeCustomers(function (c) { customers = c; render(); });
  }

  /* ------------------------------------------------------- חישוב תקופה */
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }

  // מחזיר { start, end, label } לפי יחידה + היסט (0 = התקופה הנוכחית, -1 = הקודמת)
  function periodRange(unit, offset) {
    var now = new Date();
    var start, end, label;
    if (unit === 'day') {
      start = startOfDay(now); start.setDate(start.getDate() + offset);
      end = new Date(start); end.setDate(end.getDate() + 1);
      label = U.fmtDate(start.toISOString());
    } else if (unit === 'week') {
      start = startOfDay(now);
      start.setDate(start.getDate() - start.getDay() + offset * 7); // ראשון = תחילת שבוע
      end = new Date(start); end.setDate(end.getDate() + 7);
      var last = new Date(end); last.setDate(last.getDate() - 1);
      label = U.fmtDate(start.toISOString()) + ' עד ' + U.fmtDate(last.toISOString());
    } else if (unit === 'month') {
      start = new Date(now.getFullYear(), now.getMonth() + offset, 1);
      end = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
      label = MONTHS_HE[start.getMonth()] + ' ' + start.getFullYear();
    } else { // year
      start = new Date(now.getFullYear() + offset, 0, 1);
      end = new Date(now.getFullYear() + offset + 1, 0, 1);
      label = String(start.getFullYear());
    }
    return { start: start, end: end, label: label };
  }

  function inRange(iso, r) {
    if (!iso) return false;
    var t = new Date(iso).getTime();
    return t >= r.start.getTime() && t < r.end.getTime();
  }

  function sumAmount(s, x) { return s + Number(x.amount || 0); }
  function orderById(id) { return orders.filter(function (o) { return o.id === id; })[0] || null; }

  // צובר את כל המספרים של תקופה נתונה
  function aggregate(r) {
    var pays = payments.filter(function (p) { return inRange(p.date, r); });
    var exps = expenses.filter(function (e) { return inRange(e.date, r); });
    var income = pays.reduce(sumAmount, 0);
    var expense = exps.reduce(sumAmount, 0);
    var byMethod = {};
    U.PAY_METHODS.forEach(function (m) { byMethod[m] = 0; });
    pays.forEach(function (p) {
      var m = p.method || 'אחר';
      if (!(m in byMethod)) byMethod[m] = 0;
      byMethod[m] += Number(p.amount || 0);
    });
    return { pays: pays, exps: exps, income: income, expense: expense, profit: income - expense, byMethod: byMethod };
  }

  /* ------------------------------------------------------------ render */
  function render() {
    if (!bodyEl || !loaded.payments || !loaded.expenses) return;
    var r = periodRange(state.unit, state.offset);
    var agg = aggregate(r);
    var prev = aggregate(periodRange(state.unit, state.offset - 1));

    bodyEl.innerHTML =
      periodBarHTML(r) +
      summaryHTML(agg, prev) +
      methodHTML(agg) +
      transactionsHTML(agg);
  }

  function periodBarHTML(r) {
    var chips = UNITS.map(function (u) {
      var on = u.id === state.unit;
      return '<button class="fin-unit' + (on ? ' is-active' : '') + '" data-unit="' + u.id + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '">' + esc(u.label) + '</button>';
    }).join('');
    var atCurrent = state.offset >= 0;
    return '<div class="fin-periodbar">' +
      '<div class="fin-units" role="group" aria-label="בחירת יחידת תקופה">' + chips + '</div>' +
      '<div class="fin-nav">' +
        '<button class="fin-nav__btn" data-nav="-1" aria-label="תקופה קודמת" title="תקופה קודמת">' + CHEV_R + '</button>' +
        '<div class="fin-nav__label">' + esc(r.label) + '</div>' +
        '<button class="fin-nav__btn" data-nav="1" aria-label="תקופה הבאה" title="תקופה הבאה"' +
          (atCurrent ? ' disabled' : '') + '>' + CHEV_L + '</button>' +
      '</div>' +
      '<button class="fin-today' + (state.offset === 0 ? ' is-hidden' : '') + '" data-nav="today">חזרה לתקופה הנוכחית</button>' +
    '</div>';
  }

  function trendBadge(cur, prev) {
    if (!prev || prev <= 0) return '';
    var t = (cur - prev) / prev * 100;
    var up = t >= 0;
    return '<span class="kpi__trend ' + (up ? 'up' : 'down') + '">' +
      (up ? I.trendUp : I.trendDown) + (up ? '+' : '') + Math.round(t) + '%</span>';
  }

  function summaryHTML(agg, prev) {
    var incomeSub = trendBadge(agg.income, prev.income) || '<span class="kpi__sub">שנגבו בפועל בתקופה</span>';
    var profitTone = agg.profit >= 0 ? 'green' : 'red';
    var tiles = [
      { label: 'הכנסות', value: U.fmtMoney(agg.income), sub: incomeSub, tone: 'green',
        note: 'סך התשלומים שנגבו בפועל בתקופה, לא שווי הזמנות. מדויק יותר.' },
      { label: 'הוצאות', value: U.fmtMoney(agg.expense),
        sub: '<span class="kpi__sub">' + U.plural(agg.exps.length, 'הוצאה אחת', 'הוצאות') + '</span>', tone: 'orange' },
      { label: 'רווח', value: U.fmtMoney(agg.profit),
        sub: '<span class="kpi__sub">הכנסות פחות הוצאות</span>', tone: profitTone },
      { label: 'תנועות', value: String(agg.pays.length),
        sub: '<span class="kpi__sub">' + U.plural(agg.pays.length, 'תשלום אחד', 'תשלומים') + '</span>', tone: 'primary' }
    ];
    return '<div class="kpi-row fin-summary">' + tiles.map(function (t) {
      return '<div class="kpi is-' + t.tone + '">' +
        '<div class="kpi__label">' + esc(t.label) + '</div>' +
        '<div class="kpi__value">' + t.value + '</div>' +
        '<div class="kpi__foot">' + t.sub + '</div>' +
        (t.note ? '<div class="kpi__note">' + esc(t.note) + '</div>' : '') +
      '</div>';
    }).join('') + '</div>';
  }

  function methodHTML(agg) {
    var items = U.PAY_METHODS.filter(function (m) { return agg.byMethod[m] > 0; })
      .map(function (m) {
        var pct = agg.income > 0 ? Math.round(agg.byMethod[m] / agg.income * 100) : 0;
        return '<div class="fin-method">' +
          '<div class="fin-method__top"><span class="fin-method__name">' + esc(m) + '</span>' +
            '<span class="fin-method__val">' + U.fmtMoney(agg.byMethod[m]) + '</span></div>' +
          '<div class="fin-method__track"><div class="fin-method__fill" style="width:' + pct + '%"></div></div>' +
          '<div class="fin-method__pct">' + pct + '% מההכנסות</div>' +
        '</div>';
      }).join('');
    if (!items) items = '<div class="fin-empty">אין תשלומים בתקופה זו.</div>';
    return '<div class="fin-section">' +
      '<div class="fin-section__head">' + I.wallet + '<span>פירוט הכנסות לפי אמצעי תשלום</span></div>' +
      '<div class="fin-methods">' + items + '</div>' +
    '</div>';
  }

  function transactionsHTML(agg) {
    var rows = [];
    agg.pays.forEach(function (p) { rows.push({ kind: 'pay', date: p.date, data: p }); });
    agg.exps.forEach(function (e) { rows.push({ kind: 'exp', date: e.date, data: e }); });
    rows.sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

    var list;
    if (!rows.length) {
      list = '<div class="fin-empty">אין תנועות בתקופה זו. אפשר לנווט לתקופה אחרת או להוסיף הוצאה.</div>';
    } else {
      list = rows.map(function (row) {
        if (row.kind === 'pay') {
          var p = row.data;
          var o = orderById(p.orderId);
          var who = o ? o.customerName : 'לקוח';
          var num = o ? '#' + o.orderNo : '';
          return '<button type="button" class="fin-txn" data-open-order="' + esc(o ? o.id : '') + '"' +
            (o ? '' : ' disabled') + ' title="פתח את פירוט ההזמנה">' +
            '<span class="fin-txn__badge income">+</span>' +
            '<span class="fin-txn__main">' +
              '<span class="fin-txn__who">' + esc(who) + ' <span class="mono">' + esc(num) + '</span></span>' +
              '<span class="fin-txn__sub">' + esc(p.type || 'תשלום') + ' · ' + esc(p.method || '') + ' · ' + U.fmtDate(p.date) + '</span>' +
            '</span>' +
            '<span class="fin-txn__amt income">' + U.fmtMoney(p.amount) + '</span>' +
          '</button>';
        }
        var e = row.data;
        return '<div class="fin-txn is-expense">' +
          '<span class="fin-txn__badge expense">−</span>' +
          '<span class="fin-txn__main">' +
            '<span class="fin-txn__who">' + esc(e.category || 'הוצאה') + '</span>' +
            '<span class="fin-txn__sub">' + (e.note ? esc(e.note) + ' · ' : '') + U.fmtDate(e.date) + '</span>' +
          '</span>' +
          '<span class="fin-txn__actions">' +
            '<span class="fin-txn__amt expense">−' + U.fmtMoney(e.amount) + '</span>' +
            '<button type="button" class="fin-txn__del" data-del-expense="' + esc(e.id) + '" aria-label="מחק הוצאה" title="מחק הוצאה">×</button>' +
          '</span>' +
        '</div>';
      }).join('');
    }

    return '<div class="fin-section">' +
      '<div class="fin-section__head">' + I.coins + '<span>תנועות בתקופה</span>' +
        '<span class="fin-section__count">' + rows.length + '</span></div>' +
      '<div class="fin-txns">' + list + '</div>' +
    '</div>';
  }

  /* ------------------------------------------------------- טופס הוצאה */
  function toDateInput(d) {
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  function openExpenseForm() {
    var node = document.createElement('div');
    node.className = 'modal';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');

    var catOpts = EXP_CATEGORIES.map(function (c) {
      return '<option value="' + esc(c) + '">' + esc(c) + '</option>';
    }).join('');

    node.innerHTML =
      '<div class="modal__head">' +
        '<h2 class="modal__title">הוספת הוצאה</h2>' +
        '<button class="modal__close" data-close aria-label="סגירה">×</button>' +
      '</div>' +
      '<div class="modal__body"><form data-form>' +
        '<div class="form-grid">' +
          '<div class="form-field"><label for="exp-amount">סכום (₪)</label>' +
            '<input id="exp-amount" name="amount" type="number" min="0" step="1" required></div>' +
          '<div class="form-field"><label for="exp-cat">קטגוריה</label>' +
            '<select id="exp-cat" name="category">' + catOpts + '</select></div>' +
          '<div class="form-field col-2"><label for="exp-note">הערה</label>' +
            '<input id="exp-note" name="note" type="text" placeholder="לדוגמה: הזמנת פרופילים מהצפון"></div>' +
          '<div class="form-field col-2"><label for="exp-date">תאריך</label>' +
            '<input id="exp-date" name="date" type="date" value="' + toDateInput(new Date()) + '"></div>' +
        '</div>' +
      '</form></div>' +
      '<div class="modal__foot">' +
        '<button class="btn btn--primary" data-save>' + I.check + 'שמור הוצאה</button>' +
        '<button class="btn btn--ghost" data-close>ביטול</button>' +
      '</div>';

    Array.prototype.forEach.call(node.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', Gallery.closeModal);
    });
    node.querySelector('[data-save]').addEventListener('click', function () { saveExpenseForm(node); });

    Gallery.openModal(node);
  }

  function saveExpenseForm(node) {
    var form = node.querySelector('[data-form]');
    function val(n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; }
    var amount = parseFloat(val('amount')) || 0;
    if (amount <= 0) { global.alert('הזן סכום גדול מאפס.'); return; }

    var dateStr = val('date');
    var dateIso;
    if (dateStr) {
      var d = new Date(dateStr + 'T12:00:00');
      dateIso = isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
    } else {
      dateIso = new Date().toISOString();
    }

    DB.saveExpense({
      amount: Math.round(amount),
      category: val('category') || 'אחר',
      note: val('note'),
      supplierId: null,
      date: dateIso
    }).then(Gallery.closeModal);
  }

  /* =========================================================================
   * הפקת קבלות לרו"ח (חיבור עתידי)
   * -------------------------------------------------------------------------
   * זו הפונקציה היחידה שבעתיד תיקרא ל-API של תוכנת חשבוניות מאושרת. כרגע היא
   * מייצרת סיכום פנימי בלבד (mock) לתקופה הנבחרת, עם הבהרה גלויה שאין כאן קבלה
   * חוקית. אין ליצור מסמך שנראה כמו חשבונית מס רשמית.
   * ======================================================================= */
  function issueReceiptsForAccountant() {
    var r = periodRange(state.unit, state.offset);
    var agg = aggregate(r);
    // נקודת החיבור העתידית: כאן, במקום להציג mock, ייקרא ה-API של תוכנת החשבוניות.
    openAccountantModal(r, agg);
  }

  function accountantText(r, agg) {
    var lines = [];
    lines.push('סיכום פיננסי פנימי · ' + SHOP.name);
    lines.push('תקופה: ' + r.label);
    lines.push('');
    lines.push('הכנסות שנגבו בפועל: ' + U.fmtMoney(agg.income));
    lines.push('לפי אמצעי תשלום:');
    var anyMethod = false;
    U.PAY_METHODS.forEach(function (m) {
      if (agg.byMethod[m] > 0) { lines.push('- ' + m + ': ' + U.fmtMoney(agg.byMethod[m])); anyMethod = true; }
    });
    if (!anyMethod) lines.push('- לא נגבו תשלומים בתקופה זו.');
    lines.push('');
    lines.push('תשלומים (' + agg.pays.length + '):');
    if (agg.pays.length) {
      agg.pays.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); }).forEach(function (p) {
        var o = orderById(p.orderId);
        var who = o ? o.customerName + ' (#' + o.orderNo + ')' : 'לקוח';
        lines.push('- ' + who + ' · ' + (p.type || '') + ' · ' + (p.method || '') + ' · ' + U.fmtMoney(p.amount) + ' · ' + U.fmtDate(p.date));
      });
    } else {
      lines.push('- אין תשלומים בתקופה זו.');
    }
    lines.push('');
    lines.push('הוצאות (' + agg.exps.length + '): ' + U.fmtMoney(agg.expense));
    if (agg.exps.length) {
      agg.exps.slice().sort(function (a, b) { return new Date(a.date) - new Date(b.date); }).forEach(function (e) {
        lines.push('- ' + (e.category || 'הוצאה') + (e.note ? ' · ' + e.note : '') + ' · ' + U.fmtMoney(e.amount) + ' · ' + U.fmtDate(e.date));
      });
    } else {
      lines.push('- אין הוצאות בתקופה זו.');
    }
    lines.push('');
    lines.push('רווח (הכנסות פחות הוצאות): ' + U.fmtMoney(agg.profit));
    lines.push('');
    lines.push('הערה: זהו סיכום פנימי בלבד ואינו מהווה קבלה או חשבונית מס.');
    return lines.join('\n');
  }

  function openAccountantModal(r, agg) {
    var node = document.createElement('div');
    node.className = 'modal';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');

    var text = accountantText(r, agg);

    node.innerHTML =
      '<div class="modal__head">' +
        '<h2 class="modal__title">הפקת קבלות לרו"ח · ' + esc(r.label) + '</h2>' +
        '<button class="modal__close" data-close aria-label="סגירה">×</button>' +
      '</div>' +
      '<div class="modal__body">' +
        '<div class="eod-note">' + I.alert +
          '<span>הנפקת קבלה חוקית תתחבר לתוכנת חשבוניות מאושרת בהמשך. זהו סיכום פנימי בלבד.</span></div>' +
        '<textarea class="eod-text" data-acc-text readonly>' + esc(text) + '</textarea>' +
      '</div>' +
      '<div class="modal__foot">' +
        '<button class="btn btn--primary" data-acc-copy>' + I.copy + 'העתק את הסיכום</button>' +
        '<button class="btn btn--ghost" data-close>סגירה</button>' +
      '</div>';

    Array.prototype.forEach.call(node.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', Gallery.closeModal);
    });

    var copyBtn = node.querySelector('[data-acc-copy]');
    copyBtn.addEventListener('click', function () {
      var ta = node.querySelector('[data-acc-text]');
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

    Gallery.openModal(node);
  }

  /* ------------------------------------------------------------- events */
  function onClick(e) {
    var unitBtn = e.target.closest('[data-unit]');
    if (unitBtn) { state.unit = unitBtn.getAttribute('data-unit'); state.offset = 0; render(); return; }

    var navBtn = e.target.closest('[data-nav]');
    if (navBtn) {
      if (navBtn.disabled) return;
      var v = navBtn.getAttribute('data-nav');
      if (v === 'today') {
        state.offset = 0;
      } else {
        var next = state.offset + (parseInt(v, 10) || 0);
        if (next > 0) next = 0; // אין ניווט אל העתיד מעבר לתקופה הנוכחית
        state.offset = next;
      }
      render();
      return;
    }

    var addBtn = e.target.closest('[data-add-expense]');
    if (addBtn) { openExpenseForm(); return; }

    var recBtn = e.target.closest('[data-receipts]');
    if (recBtn) { issueReceiptsForAccountant(); return; }

    var delBtn = e.target.closest('[data-del-expense]');
    if (delBtn) { e.stopPropagation(); DB.deleteExpense(delBtn.getAttribute('data-del-expense')); return; }

    var ordBtn = e.target.closest('[data-open-order]');
    if (ordBtn && !ordBtn.disabled) {
      var id = ordBtn.getAttribute('data-open-order');
      if (id) Gallery.OrderDetail.open(id);
    }
  }

  Gallery.Finance = { mount: mount };

})(window);
