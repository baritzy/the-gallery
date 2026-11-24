/* =============================================================================
 * worktable.js  -  טבלת עבודה (C15 עד C18): מסך הסדנה הראשי
 * OWNER: agent A (wave 3). רק הבעלים עורך את הקובץ הזה.
 * חוזה: P-projects/The-Gallery/context/v2-contract.md
 * נטען גם ב-admin וגם ב-workshop. בלי שם לקוח ובלי מחירים, בשום תפקיד.
 * -----------------------------------------------------------------------------
 * עמודות כמו הדף הפיזי: מס' הזמנה | מס' תמונה | הדבקה | מט | תיאור תמונה | חומר |
 * מידות | סוג מסגרת | בוצע | הערות. שורה לכל תמונה, הזמנות פתוחות בלבד.
 * X בחומר = גיליון "כמה להזמין" -> שורה ברשימת הספק (C17). V = מוחק אותה.
 * "בוצע" = orders.setItemDone (C18). סבב 5: לכל הזמנה שורת כותרת עם כפתור סטטוס אחד
 * ("סטטוס: בעבודה ▾", Gallery.statusPillHTML) שפותח תפריט של 5 הסטטוסים, בלי שאלת אישור.
 * מגע ראשון בשורות מעביר חדשה לבעבודה. כשהשורה האחרונה בוצעה שואלים (Gallery.askOrderReady).
 * סינון למעלה לפי סטטוס: הכל / חדשות / בעבודה / תקועות / מוכנות / ממתין לחומר (עם מספרים).
 * הערת "ליצור קשר עם הלקוח" (flag.js) מוצגת בשורת הכותרת עד שנרשמת תגובה. אפשר לסמן אותה
 * מתוך הערה בשורת תמונה. B2: תגובת הלקוח מוצגת עד שההזמנה מוכנה (או "הסתר").
 * B7: הערת המלאי של הפרופיל מוצגת בחלון ה-X ליד בחירת המוטות.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;
  var D = Gallery.data;

  I.minus = I.minus || '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>';
  I.xmark = I.xmark || '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>';
  I.note = I.note || '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';

  var FILTERS = [
    { id: 'all', label: 'הכל' },
    { id: 'new', label: 'חדשות' },
    { id: 'in_progress', label: 'בעבודה' },
    { id: 'stuck', label: 'תקועות' },
    { id: 'ready', label: 'מוכנות' },
    { id: 'material', label: 'ממתין לחומר' }
  ];
  var COLS = 10;

  var root = null;
  var filter = 'all';
  var renderQueued = false;

  /* ---------------------------------------------------------------------------
   * עזרים
   * ------------------------------------------------------------------------- */
  function sortedItems(o) {
    return (o.items || []).slice().sort(function (a, b) { return (a.idx || 0) - (b.idx || 0); });
  }
  function rowsFor(o, f) {
    f = f || filter;
    var items = sortedItems(o);
    if (f === 'material') return items.filter(function (it) { return it.material === 'X'; });
    if (f !== 'all' && o.status !== f) return [];
    return items;
  }

  /* מספר ההזמנות שכל סינון מציג (טבלת העבודה לא כוללת הזמנות שנמסרו) */
  function counts(list) {
    var c = {};
    FILTERS.forEach(function (f) {
      c[f.id] = list.filter(function (o) { return rowsFor(o, f.id).length > 0; }).length;
    });
    return c;
  }

  function frameInfo(sku) {
    var f = D.frames.findBySku(sku);
    return f ? D.frames.label(f) : '';
  }

  function supplierName(id) {
    var s = id ? D.suppliers.peekOne(id) : null;
    return s ? s.name : 'ספק לא ידוע';
  }

  /* ---------------------------------------------------------------------------
   * רינדור
   * ------------------------------------------------------------------------- */
  function shellHTML() {
    return '<div class="view__head wt-head"><div>' +
        '<h1 class="view__title">טבלת עבודה</h1>' +
        '<p class="view__subtitle">כל התמונות שבעבודה, כמו הדף הפיזי. לוחצים V או X בחומר, ומסמנים בוצע כשהתמונה מוכנה.</p>' +
      '</div><div class="wt-today">' + esc(U.fmtDate(new Date().toISOString())) + '</div></div>' +
      '<div class="wt-filters" role="group" aria-label="סינון" data-filters></div>' +
      '<div class="tablewrap wt-wrap"><table class="wtable wt-table">' +
        '<thead><tr>' +
          '<th class="wt-c-no">מס\' הזמנה</th><th class="c">מס\' תמונה</th><th class="c">הדבקה</th><th class="c">מט</th>' +
          '<th>תיאור תמונה</th><th class="c">חומר</th><th class="c">מידות</th><th>סוג מסגרת</th>' +
          '<th class="c">בוצע</th><th>הערות</th>' +
        '</tr></thead><tbody data-body></tbody></table></div>';
  }

  function filtersHTML(c) {
    return FILTERS.map(function (f) {
      return '<button type="button" class="fchip wt-fchip wt-fchip--' + f.id + '" data-filter="' + f.id +
        '" aria-pressed="' + (filter === f.id) + '">' + esc(f.label) + '<span class="cnt">' + c[f.id] + '</span></button>';
    }).join('');
  }

  /* שורת כותרת להזמנה: כפתור סטטוס אחד (+ סיבה כשתקועה) + התקדמות + הערת יצירת קשר + תגובת לקוח (B2) */
  function groupHeadHTML(o) {
    var items = o.items || [];
    var done = items.filter(function (it) { return it.done; }).length;
    var resp = D.orders.visibleResponse ? D.orders.visibleResponse(o) : null;
    var safe = D.reminders && D.reminders.safeText ? D.reminders.safeText : function (t) { return t; };
    return '<tr class="wt-ghead wt-ghead--' + (U.STATUS_COLOR[o.status] || 'grey') + '" data-order="' + esc(o.id) + '"><td colspan="' + COLS + '">' +
      '<div class="wt-gh">' +
        '<span class="wt-gh__lbl">הזמנה <b class="mono">' + esc(o.number) + '</b></span>' +
        Gallery.statusPillHTML(o, { lg: true }) +
        '<span class="wt-gh__prog' + (items.length && done === items.length ? ' is-all' : '') + '">' +
          (items.length ? 'בוצעו ' + done + ' מתוך ' + items.length : '') + '</span>' +
        (U.hasContact(o) ? '' : '<button type="button" class="btn btn--ghost btn--sm wt-gh__contact" data-contact-new="' + esc(o.id) + '">' + (I.phoneCall || '') + 'ליצור קשר עם הלקוח</button>') +
        (resp ? '<div class="wt-resp" data-resp-box><span class="wt-resp__txt"><b>תגובת הלקוח</b> <span class="wt-resp__date">(' +
          esc(U.fmtDateShort(resp.resolvedAt)) + ')</span>: ' + esc(safe(resp.response)) + '</span>' +
          '<button type="button" class="wt-resp__x" data-hide-resp aria-label="הסתר את התגובה">הסתר</button></div>' : '') +
      '</div>' +
      (U.hasContact(o) ? Gallery.contactBoxHTML(o) : '') +
      '</td></tr>';
  }

  function noCellHTML(o, span) {
    var look = U.orderLook(o);
    var due = o.dueDate ? U.dueText(o.dueDate) : '';
    var late = o.dueDate && U.daysUntil(o.dueDate) < 0 && o.status !== 'ready';
    return '<td class="wt-no wt-no--' + look.color + '" rowspan="' + span + '">' +
      '<div class="wt-no__num mono">' + esc(o.number) + '</div>' +
      (due ? '<div class="wt-no__due' + (late ? ' is-late' : '') + '">' + I.clock + esc(due) + '</div>' : '') +
    '</td>';
  }

  function toggleHTML(on, key, label) {
    return '<button type="button" class="wt-tog' + (on ? ' is-on' : '') + '" data-toggle="' + key + '" aria-pressed="' + !!on + '" aria-label="' + label + '">' +
      (on ? I.check + '<span>כן</span>' : '<span>לא</span>') + '</button>';
  }

  function materialHTML(o, it) {
    var line = it.material === 'X' ? D.supplierOrderLines.lastForRow(o.id, it.id) : null;
    return '<div class="wt-mat">' +
        '<button type="button" class="wt-matbtn wt-matbtn--V' + (it.material === 'V' ? ' is-on' : '') + '" data-mat="V" aria-pressed="' + (it.material === 'V') + '" aria-label="יש חומר">V</button>' +
        '<button type="button" class="wt-matbtn wt-matbtn--X' + (it.material === 'X' ? ' is-on' : '') + '" data-mat="X" aria-pressed="' + (it.material === 'X') + '" aria-label="אין מספיק חומר">X</button>' +
      '</div>' +
      (line ? '<div class="wt-mat__ord' + (line.sentAt ? ' is-sent' : '') + '">' + (line.sentAt ? 'נשלח לספק: ' : 'להזמין: ') +
        esc(D.supplierOrderLines.qtyOf(line)) + ' מוטות</div>' : '');
  }

  function itemRowHTML(o, it, first, span) {
    var info = frameInfo(it.profileSku);
    return '<tr class="wt-row' + (it.done ? ' is-done' : '') + (first ? ' wt-row--first' : '') + '" data-order="' + esc(o.id) + '" data-item="' + esc(it.id) + '">' +
      (first ? noCellHTML(o, span) : '') +
      '<td class="c mono wt-idx">' + esc(D.orders.itemLabel(it, o)) + '</td>' +
      '<td class="c">' + toggleHTML(it.mount, 'mount', 'הדבקה') + '</td>' +
      '<td class="c">' + toggleHTML(it.mat, 'mat', 'מט') + '</td>' +
      '<td class="wt-desc">' + esc(it.desc || 'תמונה') + '</td>' +
      '<td class="c">' + materialHTML(o, it) + '</td>' +
      '<td class="c mono wt-size">' + esc(U.fmtSize(it.widthCm, it.heightCm) || '-') + '</td>' +
      '<td class="wt-frame"><div class="wt-frame__sku mono">' + esc(it.profileSku || '-') + '</div>' +
        (info ? '<div class="wt-frame__info">' + esc(info) + '</div>' : '') + '</td>' +
      '<td class="c"><label class="bigcheck wt-done"><input type="checkbox" data-done' + (it.done ? ' checked' : '') + ' aria-label="בוצע"><span></span></label></td>' +
      '<td class="wt-notecell"><button type="button" class="wt-note' + (it.note ? ' has-note' : '') + '" data-note>' +
        (it.note ? esc(it.note) : I.note + '<span>הערה</span>') + '</button>' +
        (U.hasContact(o) && o.contact.itemId === it.id ? '<span class="wt-note__contact">' + (I.phoneCall || '') + 'ליצור קשר</span>' : '') + '</td>' +
    '</tr>';
  }

  function render() {
    renderQueued = false;
    var filtersEl = root && root.querySelector('[data-filters]');
    var bodyEl = root && root.querySelector('[data-body]');
    if (!filtersEl || !bodyEl) return;
    var list = D.orders.workRows();
    var c = counts(list);
    filtersEl.innerHTML = filtersHTML(c);
    var html = '';
    list.forEach(function (o) {
      var rows = rowsFor(o);
      if (!rows.length) return;
      html += groupHeadHTML(o);
      rows.forEach(function (it, i) { html += itemRowHTML(o, it, i === 0, rows.length); });
      html += '<tr class="wt-gap" aria-hidden="true"><td colspan="' + COLS + '"></td></tr>';
    });
    if (!html) {
      html = '<tr><td colspan="' + COLS + '"><div class="empty wt-empty"><h3>' +
        (filter === 'all' ? 'אין עבודות פתוחות' : 'אין כאן כלום כרגע') + '</h3><p>' +
        (filter === 'all' ? 'כשתיפתח הזמנה חדשה, התמונות שלה יופיעו כאן.' : 'אפשר לחזור ל"הכל" כדי לראות את כל העבודות.') + '</p></div></td></tr>';
    }
    bodyEl.innerHTML = html;
    Gallery.updateBadge('worktable', list.filter(function (o) { return o.status === 'new' || o.status === 'in_progress' || o.status === 'stuck'; }).length);
  }

  function queue() {
    if (renderQueued) return;
    renderQueued = true;
    (global.requestAnimationFrame || global.setTimeout)(render);
  }

  /* ---------------------------------------------------------------------------
   * פעולות
   * ------------------------------------------------------------------------- */
  function onDone(orderId, itemId, done) {
    var before = D.orders.peekOne(orderId);
    D.orders.setItemDone(orderId, itemId, done).then(function (o) {
      if (!o) return;
      var msg = [];
      // C38: הודעה על הורדת המלאי (רק כשבאמת ירד)
      var use = done && D.frameUsage ? D.frameUsage.forItem(itemId) : null;
      var f = use ? D.frames.peekOne(use.profileId) : null;
      if (use && f) msg.push('ירדו ' + (Number(use.amount) / 100) + ' מ\' מ-' + f.sku + ', נשאר ' + D.frames.remainingMeters(f) + ' מ\'.' + (D.frames.isLow(f) ? ' מלאי נמוך, כדאי להזמין.' : ''));
      if (msg.length) Gallery.toast(msg.join(' '));
      // A2: השורה האחרונה בוצעה = שואלים, לא הופכים לירוק לבד
      if (done && before && D.orders.allDone(o) && o.status !== 'ready' && o.status !== 'delivered') Gallery.askOrderReady(o.id);
    });
  }

  function onMaterialV(o, it) {
    var next = it.material === 'V' ? null : 'V';
    D.orders.updateItem(o.id, it.id, { material: next }, { start: true }).then(function () {
      return D.supplierOrderLines.removeForRow(o.id, it.id);
    }).then(function (removed) {
      if (removed) Gallery.toast('הוסר מרשימת ההזמנה של ' + supplierName(removed.supplierId));
    });
  }

  /* C17: X = אין מספיק חומר. מציג כמה נשאר, כמה צריך, וכמה מוטות להזמין. */
  function openMaterialSheet(o, it) {
    var f = D.frames.findBySku(it.profileSku);
    var existing = D.supplierOrderLines.forRow(o.id, it.id);
    var need = D.frames.neededCm(it.widthCm, it.heightCm);
    var rod = f ? (Number(f.rodLengthCm) || D.frames.ROD_CM) : D.frames.ROD_CM;
    var noDims = !(need > 0);
    var qty = existing ? D.supplierOrderLines.qtyOf(existing) : (f && !noDims ? D.frames.suggestRods(f, need) : 1);
    var head = 'אין מספיק חומר · הזמנה <span class="mono">' + esc(o.number) + '</span> תמונה <span class="mono">' + esc(D.orders.itemLabel(it, o)) + '</span>';

    var body;
    if (!f) {
      body = '<div class="wt-sheet__warn">' + I.alert + '<div>' +
        (it.profileSku ? 'הפרופיל <b class="mono">' + esc(it.profileSku) + '</b> לא נמצא בטבלת המלאי.' : 'לא נבחר פרופיל לתמונה הזו.') +
        ' אפשר לסמן X עכשיו ולהוסיף שורה ידנית בטאב ספקים.</div></div>';
    } else {
      var left = D.frames.remainingMeters(f);
      var short = !noDims && Number(f.stockUnits || 0) < need;
      body = '<div class="wt-sheet">' +
        '<div class="wt-sheet__prof">' +
          '<div class="wt-sheet__swatch" style="background:' + U.woodSwatch(f) + '"></div>' +
          '<div><div class="wt-sheet__sku mono">' + esc(f.sku) + '</div>' +
          '<div class="wt-sheet__name">' + esc(D.frames.label(f)) + '</div>' +
          '<div class="wt-sheet__sup">ספק: <b>' + esc(supplierName(f.supplierId)) + '</b></div></div>' +
        '</div>' +
        '<div class="wt-sheet__facts">' +
          '<div class="wt-sheet__fact' + (short ? ' is-short' : '') + '"><div class="k">נשאר במלאי</div><div class="v">נשאר ' + esc(left) + ' מ\'</div></div>' +
          (noDims ?
            '<div class="wt-sheet__fact"><div class="k">צריך לתמונה הזו</div><div class="v">חסרות מידות</div>' +
              '<div class="s">אפשר להשלים רוחב וגובה בכרטיס ההזמנה</div></div>' :
            '<div class="wt-sheet__fact"><div class="k">צריך לתמונה הזו</div><div class="v">' + esc(need / 100) + ' מ\'</div>' +
              '<div class="s"><span dir="ltr">(' + esc(Number(it.widthCm || 0)) + ' + ' + esc(Number(it.heightCm || 0)) + ') × 2 + ' + D.frames.WASTE_CM + '</span> ס"מ, כולל פחת לפינות</div></div>') +
        '</div>' +
        '<div class="wt-step">' +
          '<div class="wt-step__lbl">כמה מוטות להזמין? <span>(מוט = ' + esc(rod / 100) + ' מ\')</span></div>' +
          '<div class="wt-step__ctl">' +
            '<button type="button" class="wt-step__btn" data-step="1" aria-label="עוד מוט">' + I.plus + '</button>' +
            '<output class="wt-step__val mono" data-qty>' + qty + '</output>' +
            '<button type="button" class="wt-step__btn" data-step="-1" aria-label="פחות מוט">' + I.minus + '</button>' +
          '</div>' +
          (f.note ? '<div class="wt-step__fnote" data-fnote>' + I.note + '<span><b>הערה במלאי:</b> ' + esc(D.reminders ? D.reminders.safeText(f.note) : f.note) + '</span></div>' : '') +
          (existing ? '<div class="wt-step__note">כבר ברשימה של ' + esc(supplierName(existing.supplierId)) + '. שינוי הכמות יעדכן את אותה שורה.</div>' : '') +
        '</div></div>';
    }

    var node = Gallery.modalNode({
      title: head,
      body: body,
      foot: (f ? '<button class="btn btn--primary btn--lg" data-add>' + I.check + (existing ? 'עדכן כמות ברשימה' : 'הוסף לרשימת ההזמנה') + '</button>' : '') +
        (!existing ? '<button class="btn btn--secondary btn--lg" data-xonly>' + (f ? 'רק לסמן X' : 'לסמן X') + '</button>' : '') +
        '<button class="btn btn--ghost" data-close>ביטול</button>'
    });
    node.classList.add('wt-modal');

    node.addEventListener('click', function (e) {
      var st = e.target.closest('[data-step]');
      if (st) {
        qty = Math.max(1, Math.min(50, qty + Number(st.getAttribute('data-step'))));
        node.querySelector('[data-qty]').textContent = qty;
        return;
      }
      if (e.target.closest('[data-xonly]')) {
        D.orders.updateItem(o.id, it.id, { material: 'X' }, { start: true }).then(function () { Gallery.closeModal(); });
        return;
      }
      if (e.target.closest('[data-add]')) {
        var btn = e.target.closest('[data-add]');
        btn.disabled = true;
        D.orders.updateItem(o.id, it.id, { material: 'X' }, { start: true }).then(function () {
          return Gallery.addSupplierLine({ itemType: 'frame', itemId: f.id, qtyRods: qty, source: 'worktable', orderId: o.id, itemRowId: it.id });
        }).then(function (line) {
          Gallery.closeModal();
          Gallery.toast('נוסף לרשימת ההזמנה של ' + supplierName(line.supplierId) + ': ' + qty + ' מוטות ' + f.sku, {
            actions: Gallery.hasView('suppliers') ? [{ label: 'לרשימת הספק', onClick: function () { Gallery.switchTab('suppliers'); } }, { label: 'סגור' }] : [],
            timeout: 6000
          });
        });
      }
    });
    Gallery.openModal(node, { focus: false });
  }

  function openNote(o, it) {
    var hasC = U.hasContact(o);
    var contactHTML = hasC ?
      '<div class="wt-note-contact is-on">' + (I.phoneCall || '') + '<span>יש להזמנה הערת "ליצור קשר עם הלקוח" פעילה' +
        (o.contact.text ? ': ' + esc(D.reminders ? D.reminders.safeText(o.contact.text) : o.contact.text) : '') + '</span>' +
        '<button type="button" class="btn btn--sm btn--primary" data-contact-resp="' + esc(o.id) + '">' + I.check + 'רשום תגובת לקוח</button></div>' :
      '<label class="wt-note-contact"><span class="bigcheck"><input type="checkbox" data-contact-mark><span></span></span>' +
        '<span><b>ליצור קשר עם הלקוח</b><small>יוצר תזכורת פעילה, בחנות ובסדנה, עד שנרשמת תגובת הלקוח</small></span></label>';
    var node = Gallery.modalNode({
      title: 'הערה · הזמנה <span class="mono">' + esc(o.number) + '</span> תמונה <span class="mono">' + esc(D.orders.itemLabel(it, o)) + '</span>',
      body: '<div class="form-field"><label for="wt-note">ההערה מופיעה גם בכרטיס ההזמנה</label>' +
        '<textarea id="wt-note" class="wt-notearea" rows="3" data-text placeholder="למשל: צריך לתקן פינות">' + esc(it.note || '') + '</textarea></div>' +
        '<div class="wt-quick">' + ['צריך לתקן פינות', 'זכוכית שבורה, להחליף', 'ממתין לחומר'].map(function (q) {
          return '<button type="button" class="fchip" data-q="' + esc(q) + '">' + esc(q) + '</button>';
        }).join('') + '</div>' + contactHTML,
      foot: '<button class="btn btn--primary btn--lg" data-save>' + I.check + 'שמור הערה</button>' +
        (it.note ? '<button class="btn btn--danger" data-clear>מחק הערה</button>' : '') +
        '<button class="btn btn--ghost" data-close>ביטול</button>'
    });
    node.classList.add('wt-modal');
    function save(text) {
      var mark = node.querySelector('[data-contact-mark]');
      var wantContact = !!(mark && mark.checked);
      if (wantContact && !text) { node.querySelector('[data-text]').focus(); Gallery.toast('צריך לכתוב על מה ליצור קשר עם הלקוח'); return; }
      D.orders.updateItem(o.id, it.id, { note: text }, { start: true }).then(function () {
        return wantContact ? D.orders.setContact(o.id, { text: text, itemId: it.id }) : null;
      }).then(function () {
        Gallery.closeModal();
        if (wantContact) Gallery.toast('נוספה הערה "ליצור קשר עם הלקוח" להזמנה ' + o.number + '. התזכורת פעילה עד שנרשמת תגובה.');
      });
    }
    node.addEventListener('click', function (e) {
      var q = e.target.closest('[data-q]');
      var ta = node.querySelector('[data-text]');
      if (q) { ta.value = q.getAttribute('data-q'); ta.focus(); return; }
      if (e.target.closest('[data-save]')) { save(ta.value.trim()); return; }
      if (e.target.closest('[data-clear]')) {
        Gallery.confirmDelete({
          label: 'ההערה "' + it.note + '"',
          onDelete: function () {
            return D.trash.moveItemNote(o.id, it.id, 'הערה: ' + it.note + ' (הזמנה ' + o.number + ')').then(function (entry) { Gallery.closeModal(); return entry; });
          }
        });
      }
    });
    Gallery.openModal(node);
  }

  function onClick(e) {
    var f = e.target.closest('[data-filter]');
    if (f) { filter = f.getAttribute('data-filter'); render(); return; }

    var tr = e.target.closest('tr[data-order]');
    if (!tr) return;
    var o = D.orders.peekOne(tr.getAttribute('data-order'));
    if (!o) return;

    if (e.target.closest('[data-spill], [data-stuck-edit], [data-contact-new], [data-contact-resp]')) return;   // order-status-ui.js / flag.js
    if (e.target.closest('[data-hide-resp]')) { D.orders.hideResponse(o); return; }

    var itemId = tr.getAttribute('data-item');
    var it = (o.items || []).filter(function (x) { return x.id === itemId; })[0];
    if (!it) return;

    var tog = e.target.closest('[data-toggle]');
    if (tog) {
      var key = tog.getAttribute('data-toggle');
      var patch = {}; patch[key] = !it[key];
      D.orders.updateItem(o.id, it.id, patch, { start: true });
      return;
    }
    var m = e.target.closest('[data-mat]');
    if (m) {
      if (m.getAttribute('data-mat') === 'V') onMaterialV(o, it);
      else openMaterialSheet(o, it);
      return;
    }
    if (e.target.closest('[data-note]')) openNote(o, it);
  }

  function onChange(e) {
    var cb = e.target.closest('[data-done]');
    if (!cb) return;
    var tr = cb.closest('tr[data-order]');
    onDone(tr.getAttribute('data-order'), tr.getAttribute('data-item'), cb.checked);
  }

  /* ---------------------------------------------------------------------------
   * פירוט הזמנה בסדנה (בלי שם לקוח ובלי מחירים). ב-admin נשאר orders.js.
   * ------------------------------------------------------------------------- */
  if (Gallery.role === 'workshop') {
    var wsBody = function (o) {
      var items = (o.items || []).map(function (it) {
        return '<tr' + (it.done ? ' class="is-done"' : '') + '><td class="c mono">' + esc(D.orders.itemLabel(it, o)) + '</td>' +
          '<td>' + esc(it.desc || 'תמונה') + '</td><td class="c mono">' + esc(U.fmtSize(it.widthCm, it.heightCm) || '-') + '</td>' +
          '<td class="mono">' + esc(it.profileSku || '-') + '</td><td class="c">' + (it.done ? 'בוצע' : '') + '</td><td>' + esc(it.note || '') + '</td></tr>';
      }).join('');
      return '<div class="wt-ocard__status">' + Gallery.statusPillHTML(o, { lg: true }) + '</div>' +
        (U.hasContact(o) ? Gallery.contactBoxHTML(o) : '<p><button type="button" class="btn btn--ghost" data-contact-new="' + esc(o.id) + '">' + (I.phoneCall || '') + 'ליצור קשר עם הלקוח</button></p>') +
        (Gallery.flagHistoryHTML ? Gallery.flagHistoryHTML(o) : '') +
        (o.dueDate ? '<p>מועד מסירה: <b>' + esc(U.fmtDate(o.dueDate)) + '</b> (' + esc(U.dueText(o.dueDate)) + ')</p>' : '') +
        '<div class="tablewrap"><table class="wtable"><thead><tr><th class="c">מס\' תמונה</th><th>תיאור</th><th class="c">מידות</th><th>מסגרת</th><th class="c">בוצע</th><th>הערות</th></tr></thead>' +
        '<tbody>' + items + '</tbody></table></div>' +
        (o.notes ? '<p class="wt-ordnotes">' + esc(o.notes) + '</p>' : '');
    };
    Gallery.openOrder = function (orderId) {
      var o = D.orders.peekOne(orderId);
      if (!o) return;
      var node = Gallery.modalNode({
        title: 'הזמנה <span class="mono">' + esc(o.number) + '</span>',
        body: wsBody(o),
        foot: '<button class="btn btn--secondary" data-close>סגירה</button>'
      });
      node.classList.add('wt-ocard');
      /* מתעדכן בזמן אמת (שינוי סטטוס מה-pill, מהאייפד השני) */
      var unsub = D.orders.subscribe(function () {
        if (!document.body.contains(node)) return;
        var cur = D.orders.peekOne(orderId);
        if (!cur) { Gallery.closeModal(); return; }
        var body = node.querySelector('.modal__body');
        if (body) body.innerHTML = wsBody(cur);
      });
      Gallery.openModal(node, { wide: true, onClose: function () { unsub(); } });
    };
  }

  function mount(el) {
    root = el;
    el.innerHTML = shellHTML();
    el.addEventListener('click', onClick);
    el.addEventListener('change', onChange);
    render();
    D.orders.subscribe(queue);
    D.frames.subscribe(queue);
    D.supplierOrderLines.subscribe(queue);
    global.addEventListener('gallery:resp-hidden', queue);
  }

  Gallery.registerView('worktable', { mount: mount, onShow: render });
})(window);
