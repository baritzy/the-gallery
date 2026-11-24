/* =============================================================================
 * suppliers.js  -  ספקים (C23 עד C25)
 * OWNER: agent A (wave 3). רק הבעלים עורך את הקובץ הזה.
 * חוזה: P-projects/The-Gallery/context/v2-contract.md
 * נטען גם ב-admin וגם ב-workshop. בלי מחירים בכלל, בשום תפקיד (פשוט יותר).
 * -----------------------------------------------------------------------------
 * שלוש עמודות כמו דף הספקים הידני: פרופילי אברהם | סילבר | יוני.
 * לכל ספק: פרטי קשר (עריכה ב-admin), שורות פתוחות (מטבלת העבודה / מלאי נמוך / ידני),
 * הוספה ידנית, הסרה, "הוסף מלאי נמוך", PDF (print.js), וואטסאפ, "סמן נשלח" -> היסטוריה.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;
  var D = Gallery.data;
  var L = D.supplierOrderLines;

  I.minus = I.minus || '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>';
  I.send = I.send || '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/></svg>';

  var root = null;
  var queued = false;
  var openHistory = {};

  var SOURCE = {
    worktable: { label: 'מטבלת העבודה', cls: 'is-blue' },
    low_stock: { label: 'מלאי נמוך', cls: 'is-orange' },
    manual: { label: 'ידני', cls: 'is-grey' }
  };

  function sourceBadge(l) {
    var s = SOURCE[l.source] || SOURCE.manual;
    var extra = '';
    if (l.source === 'worktable' && l.orderId) {
      var o = D.orders.peekOne(l.orderId);
      if (o) extra = ' · הזמנה ' + o.number;
    }
    return '<span class="pill ' + s.cls + ' sup-src">' + esc(s.label + extra) + '</span>';
  }

  /* ---------------------------------------------------------------------------
   * רינדור
   * ------------------------------------------------------------------------- */
  function lineHTML(l) {
    var qty = L.qtyOf(l);
    return '<li class="sup-line" data-line="' + esc(l.id) + '">' +
      '<div class="sup-qty">' +
        '<button type="button" class="sup-qty__btn" data-qty="1" aria-label="עוד אחד">' + I.plus + '</button>' +
        '<span class="sup-qty__val mono">' + esc(qty) + '</span>' +
        '<button type="button" class="sup-qty__btn" data-qty="-1" aria-label="פחות אחד"' + (qty <= 1 ? ' disabled' : '') + '>' + I.minus + '</button>' +
      '</div>' +
      '<div class="sup-line__main">' +
        '<div class="sup-line__label">' + esc(l.label || 'פריט') + '</div>' +
        '<div class="sup-line__meta"><span class="sup-line__unit">' + esc(L.unitOf(l)) + '</span>' + sourceBadge(l) + '</div>' +
      '</div>' +
      '<button type="button" class="iconbtn sup-line__rm" data-rm aria-label="הסר שורה">' + I.trash + '</button>' +
    '</li>';
  }

  function historyHTML(s) {
    var hist = L.history(s.id);
    if (!hist.length) return '';
    var batches = {};
    var order = [];
    hist.forEach(function (l) {
      var k = U.fmtDate(l.sentAt);
      if (!batches[k]) { batches[k] = []; order.push(k); }
      batches[k].push(l);
    });
    var isOpen = !!openHistory[s.id];
    return '<div class="sup-hist">' +
      '<button type="button" class="sup-hist__toggle" data-hist aria-expanded="' + isOpen + '">' + I.clock +
        'נשלחו בעבר (' + hist.length + ')' + I.chevron + '</button>' +
      (isOpen ? '<div class="sup-hist__body">' + order.slice(0, 6).map(function (k) {
        return '<div class="sup-hist__batch"><div class="sup-hist__date">נשלח ב-' + esc(k) + '</div><ul>' +
          batches[k].map(function (l) {
            return '<li><span class="mono">' + esc(L.qtyOf(l)) + '</span> ' + esc(L.unitOf(l)) + ' · ' + esc(l.label || '') + '</li>';
          }).join('') + '</ul></div>';
      }).join('') + '</div>' : '') +
    '</div>';
  }

  function cardHTML(s) {
    var lines = L.pending(s.id).sort(function (a, b) { return String(a.createdAt).localeCompare(String(b.createdAt)); });
    var sugg = L.lowStockSuggestions(s.id);
    var canEdit = Gallery.can('admin');
    return '<article class="sup-card" data-sup="' + esc(s.id) + '">' +
      '<header class="sup-card__head">' +
        '<div class="sup-card__title"><h2>' + esc(s.name) + '</h2>' +
          (canEdit ? '<button type="button" class="iconbtn sup-card__edit" data-edit aria-label="עריכת פרטי ספק">' + I.edit + '</button>' : '') +
        '</div>' +
        '<div class="sup-card__contact">' +
          (s.contactName ? '<span>' + esc(s.contactName) + '</span>' : '') +
          (s.phone ? '<a class="mono" href="tel:' + esc(String(s.phone).replace(/[^\d+]/g, '')) + '">' + I.contact + esc(s.phone) + '</a>' : '<span class="sup-muted">אין טלפון</span>') +
          (s.email ? '<span class="sup-email">' + esc(s.email) + '</span>' : '') +
        '</div>' +
        (s.note ? '<div class="sup-card__note">' + esc(s.note) + '</div>' : '') +
      '</header>' +
      '<div class="sup-card__sec"><span>רשימת הזמנה</span><span class="sup-card__cnt">' + U.plural(lines.length, 'שורה אחת', 'שורות') + '</span></div>' +
      (lines.length ? '<ul class="sup-lines">' + lines.map(lineHTML).join('') + '</ul>' :
        '<div class="sup-empty">אין כרגע מה להזמין מהספק הזה.</div>') +
      (sugg.length ? '<button type="button" class="btn btn--warn sup-low" data-low>' + I.alert + 'הוסף מלאי נמוך (' + sugg.length + ')</button>' : '') +
      '<button type="button" class="btn btn--secondary sup-add" data-add>' + I.plus + 'הוסף שורה</button>' +
      '<div class="sup-actions">' +
        '<button type="button" class="btn btn--secondary" data-print' + (lines.length ? '' : ' disabled') + '>' + I.printer + 'הדפס PDF</button>' +
        '<button type="button" class="btn btn--wa" data-wa' + (lines.length ? '' : ' disabled') + '>' + I.wa + 'וואטסאפ</button>' +
        '<button type="button" class="btn btn--primary sup-sent" data-sent' + (lines.length ? '' : ' disabled') + '>' + I.send + 'סמן נשלח</button>' +
      '</div>' +
      historyHTML(s) +
    '</article>';
  }

  function render() {
    queued = false;
    var cardsEl = root && root.querySelector('[data-cards]');
    if (!cardsEl) return;
    var sups = D.suppliers.sorted();
    cardsEl.innerHTML = sups.length ? sups.map(cardHTML).join('') :
      '<div class="empty"><h3>אין ספקים</h3></div>';
    Gallery.updateBadge('suppliers', L.pending().length);
  }
  function queue() {
    if (queued) return;
    queued = true;
    (global.requestAnimationFrame || global.setTimeout)(render);
  }

  /* ---------------------------------------------------------------------------
   * מודלים
   * ------------------------------------------------------------------------- */
  function editSupplier(s) {
    var f = function (k, label, type) {
      return '<div class="form-field"><label for="sup-' + k + '">' + label + '</label>' +
        '<input id="sup-' + k + '" type="' + (type || 'text') + '" data-k="' + k + '" value="' + esc(s[k] || '') + '"' + (type === 'tel' ? ' dir="ltr"' : '') + '></div>';
    };
    var node = Gallery.modalNode({
      title: 'פרטי ספק · ' + esc(s.name),
      body: '<div class="form-grid sup-form">' + f('name', 'שם הספק') + f('contactName', 'איש קשר') + f('phone', 'טלפון', 'tel') + f('email', 'אימייל', 'email') + '</div>' +
        '<div class="form-field"><label for="sup-note">הערה</label><textarea id="sup-note" rows="2" data-k="note">' + esc(s.note || '') + '</textarea></div>',
      foot: '<button class="btn btn--primary btn--lg" data-save>' + I.check + 'שמור</button><button class="btn btn--ghost" data-close>ביטול</button>'
    });
    node.querySelector('[data-save]').addEventListener('click', function () {
      var rec = Object.assign({}, s);
      Array.prototype.forEach.call(node.querySelectorAll('[data-k]'), function (i) { rec[i.getAttribute('data-k')] = i.value.trim(); });
      if (!rec.name) { Gallery.toast('צריך שם לספק'); return; }
      D.suppliers.save(rec).then(function () { Gallery.closeModal(); Gallery.toast('פרטי הספק נשמרו'); });
    });
    Gallery.openModal(node);
  }

  function addManual(s) {
    var type = 'frame';
    var qty = 1;
    function options() {
      var items = type === 'frame' ? D.frames.peek() : D.rawMaterials.peek();
      var mine = items.filter(function (x) { return x.supplierId === s.id; });
      var other = items.filter(function (x) { return x.supplierId !== s.id; });
      var lbl = function (x) { return type === 'frame' ? (x.sku + ' · ' + D.frames.label(x)) : x.name; };
      var opt = function (x) { return '<option value="' + esc(x.id) + '">' + esc(lbl(x)) + '</option>'; };
      return (mine.length ? '<optgroup label="של ' + esc(s.name) + '">' + mine.map(opt).join('') + '</optgroup>' : '') +
        (other.length ? '<optgroup label="אחרים">' + other.map(opt).join('') + '</optgroup>' : '') +
        '<option value="__free">פריט אחר (לכתוב בעצמי)</option>';
    }
    var node = Gallery.modalNode({
      title: 'שורה חדשה · ' + esc(s.name),
      body: '<div class="seg sup-seg" role="radiogroup" aria-label="סוג">' +
          '<button type="button" role="radio" data-type="frame" aria-checked="true">מסגרת (מוטות)</button>' +
          '<button type="button" role="radio" data-type="raw" aria-checked="false">חומר גלם</button></div>' +
        '<div class="form-field"><label for="sup-item">פריט</label><select id="sup-item" class="select sup-select" data-item>' + options() + '</select></div>' +
        '<div class="form-field" data-freewrap hidden><label for="sup-free">מה להזמין?</label><input id="sup-free" type="text" data-free placeholder="למשל: 4322-20 דבש בהיר"></div>' +
        '<div class="wt-step sup-step"><div class="wt-step__lbl" data-qlbl>כמה מוטות?</div><div class="wt-step__ctl">' +
          '<button type="button" class="wt-step__btn" data-step="1" aria-label="עוד">' + I.plus + '</button>' +
          '<output class="wt-step__val mono" data-qtyv>1</output>' +
          '<button type="button" class="wt-step__btn" data-step="-1" aria-label="פחות">' + I.minus + '</button></div></div>',
      foot: '<button class="btn btn--primary btn--lg" data-ok>' + I.plus + 'הוסף לרשימה</button><button class="btn btn--ghost" data-close>ביטול</button>'
    });
    node.classList.add('wt-modal');
    var sel = node.querySelector('[data-item]');
    function syncFree() { node.querySelector('[data-freewrap]').hidden = sel.value !== '__free'; }
    sel.addEventListener('change', syncFree);
    node.addEventListener('click', function (e) {
      var t = e.target.closest('[data-type]');
      if (t) {
        type = t.getAttribute('data-type');
        Array.prototype.forEach.call(node.querySelectorAll('[data-type]'), function (b) { b.setAttribute('aria-checked', String(b === t)); });
        sel.innerHTML = options();
        node.querySelector('[data-qlbl]').textContent = type === 'frame' ? 'כמה מוטות?' : 'כמה יחידות?';
        syncFree();
        return;
      }
      var st = e.target.closest('[data-step]');
      if (st) { qty = Math.max(1, Math.min(99, qty + Number(st.getAttribute('data-step')))); node.querySelector('[data-qtyv]').textContent = qty; return; }
      if (!e.target.closest('[data-ok]')) return;
      var line = { itemType: type, supplierId: s.id, source: 'manual', orderId: null };
      if (sel.value === '__free') {
        var txt = node.querySelector('[data-free]').value.trim();
        if (!txt) { Gallery.toast('צריך לכתוב מה להזמין'); return; }
        line.itemId = 'free:' + Gallery.store.uid();
        line.label = txt;
      } else {
        line.itemId = sel.value;
      }
      if (type === 'frame') line.qtyRods = qty; else line.qty = qty;
      var same = sel.value !== '__free' && L.pending(s.id).filter(function (x) { return x.itemType === type && x.itemId === sel.value && x.source === 'manual'; })[0];
      if (same) { if (type === 'frame') line.qtyRods = L.qtyOf(same) + qty; else line.qty = L.qtyOf(same) + qty; }
      Gallery.addSupplierLine(line).then(function () { Gallery.closeModal(); Gallery.toast('נוסף לרשימת ההזמנה של ' + s.name); });
    });
    Gallery.openModal(node, { focus: false });
  }

  function addLowStock(s) {
    var sugg = L.lowStockSuggestions(s.id);
    if (!sugg.length) { Gallery.toast('אין מלאי נמוך אצל ' + s.name); return; }
    var node = Gallery.modalNode({
      title: 'מלאי נמוך · ' + esc(s.name),
      body: '<p class="sup-hint">סמנו מה להוסיף לרשימה. הכמות המוצעת מחזירה את המלאי לפי 2 מהסף, ואפשר לשנות אותה ברשימה.</p>' +
        '<ul class="sup-sugg">' + sugg.map(function (g, i) {
          return '<li><label class="bigcheck"><input type="checkbox" data-i="' + i + '" checked><span></span></label>' +
            '<div class="sup-sugg__main"><div class="sup-sugg__label">' + esc(g.label) + '</div><div class="sup-sugg__why">' + esc(g.why) + '</div></div>' +
            '<div class="sup-sugg__qty"><span class="mono">' + esc(g.qty) + '</span> ' + esc(g.unit) + '</div></li>';
        }).join('') + '</ul>',
      foot: '<button class="btn btn--primary btn--lg" data-ok>' + I.plus + 'הוסף לרשימה</button><button class="btn btn--ghost" data-close>ביטול</button>'
    });
    node.querySelector('[data-ok]').addEventListener('click', function () {
      var picked = Array.prototype.filter.call(node.querySelectorAll('[data-i]'), function (c) { return c.checked; })
        .map(function (c) { return sugg[Number(c.getAttribute('data-i'))]; });
      if (!picked.length) { Gallery.closeModal(); return; }
      Promise.all(picked.map(function (g) {
        var line = { itemType: g.itemType, itemId: g.itemId, supplierId: s.id, source: 'low_stock', orderId: null, label: g.label };
        if (g.itemType === 'frame') line.qtyRods = g.qty; else line.qty = g.qty;
        return Gallery.addSupplierLine(line);
      })).then(function () { Gallery.closeModal(); Gallery.toast('נוספו ' + U.plural(picked.length, 'שורה אחת', 'שורות') + ' לרשימה של ' + s.name); });
    });
    Gallery.openModal(node, { focus: false });
  }

  /* ---------------------------------------------------------------------------
   * פעולות
   * ------------------------------------------------------------------------- */
  function changeQty(l, delta) {
    var rec = Object.assign({}, l);
    var key = l.itemType === 'frame' ? 'qtyRods' : 'qty';
    rec[key] = Math.max(1, L.qtyOf(l) + delta);
    L.save(rec);
  }

  function removeLine(l) {
    L.remove(l.id).then(function () {
      Gallery.toast('השורה הוסרה', { timeout: 5000, actions: [{ label: 'ביטול', primary: true, onClick: function () { L.save(l); } }] });
    });
  }

  function markSent(s) {
    var n = L.pending(s.id).length;
    if (!n) return;
    if (!global.confirm('לסמן ' + U.plural(n, 'שורה אחת', 'שורות') + ' כנשלחו ל' + s.name + '?\nהרשימה תעבור להיסטוריה.')) return;
    L.markSent(s.id).then(function () { Gallery.toast('הרשימה של ' + s.name + ' סומנה כנשלחה'); });
  }

  function onClick(e) {
    var card = e.target.closest('[data-sup]');
    if (!card) return;
    var s = D.suppliers.peekOne(card.getAttribute('data-sup'));
    if (!s) return;
    var li = e.target.closest('[data-line]');
    var l = li ? L.peekOne(li.getAttribute('data-line')) : null;

    var q = e.target.closest('[data-qty]');
    if (q && l) { changeQty(l, Number(q.getAttribute('data-qty'))); return; }
    if (e.target.closest('[data-rm]') && l) { removeLine(l); return; }
    if (e.target.closest('[data-edit]')) { editSupplier(s); return; }
    if (e.target.closest('[data-add]')) { addManual(s); return; }
    if (e.target.closest('[data-low]')) { addLowStock(s); return; }
    if (e.target.closest('[data-print]')) { Gallery.printSupplierList(s.id); return; }
    if (e.target.closest('[data-wa]')) {
      var text = Gallery.supplierListText ? Gallery.supplierListText(s.id) : '';
      if (!s.phone) Gallery.toast('אין טלפון לספק. אפשר להוסיף בעריכת פרטי הספק.');
      Gallery.whatsapp(s.phone || '', text);
      return;
    }
    if (e.target.closest('[data-sent]')) { markSent(s); return; }
    if (e.target.closest('[data-hist]')) { openHistory[s.id] = !openHistory[s.id]; render(); }
  }

  function mount(el) {
    root = el;
    el.innerHTML =
      '<div class="view__head"><div><h1 class="view__title">ספקים</h1>' +
        '<p class="view__subtitle">רשימת הזמנה לכל ספק. מתמלאת לבד מ-X בטבלת העבודה וממלאי נמוך.</p></div></div>' +
      '<div class="sup-grid" data-cards></div>';
    el.addEventListener('click', onClick);
    render();
    D.suppliers.subscribe(queue);
    L.subscribe(queue);
    D.frames.subscribe(queue);
    D.rawMaterials.subscribe(queue);
    D.orders.subscribe(queue);
  }

  Gallery.registerView('suppliers', { mount: mount, onShow: render });
})(window);
