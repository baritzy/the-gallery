/* =============================================================================
 * worktable.js  -  טבלת עבודה (C15 עד C18): מסך הסדנה הראשי
 * OWNER: agent A (wave 3). רק הבעלים עורך את הקובץ הזה.
 * חוזה: P-projects/The-Gallery/context/v2-contract.md
 * נטען גם ב-admin וגם ב-workshop. בלי שם לקוח ובלי מחירים, בשום תפקיד.
 * -----------------------------------------------------------------------------
 * עמודות כמו הדף הפיזי: מס' הזמנה | מס' תמונה | הדבקה | מט | תיאור תמונה | חומר |
 * מידות | סוג מסגרת | בוצע | הערות. שורה לכל תמונה, הזמנות פתוחות בלבד.
 * X בחומר = גיליון "כמה להזמין" -> שורה ברשימת הספק (C17). V = מוחק אותה.
 * "בוצע" = orders.setItemDone -> הסטטוס נגזר (כולן בוצעו = מוכנה, ירוק) (C18).
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
    { id: 'material', label: 'ממתין לחומר' },
    { id: 'undone', label: 'לא בוצע' },
    { id: 'blocked', label: 'תקועות' }
  ];
  var COLS = 10;

  var root = null;
  var filter = 'all';
  var renderQueued = false;

  /* ---------------------------------------------------------------------------
   * עזרים
   * ------------------------------------------------------------------------- */
  function rowsFor(o) {
    var items = (o.items || []).slice().sort(function (a, b) { return (a.idx || 0) - (b.idx || 0); });
    if (filter === 'material') return items.filter(function (it) { return it.material === 'X'; });
    if (filter === 'undone') return items.filter(function (it) { return !it.done; });
    if (filter === 'blocked') return U.isBlocked(o) ? items : [];
    return items;
  }

  function counts(list) {
    var c = { all: 0, material: 0, undone: 0, blocked: 0 };
    list.forEach(function (o) {
      var items = o.items || [];
      c.all += items.length;
      c.material += items.filter(function (it) { return it.material === 'X'; }).length;
      c.undone += items.filter(function (it) { return !it.done; }).length;
      if (U.isBlocked(o)) c.blocked += 1;
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
      return '<button type="button" class="fchip wt-fchip' + (f.id === 'blocked' ? ' wt-fchip--red' : '') + '" data-filter="' + f.id +
        '" aria-pressed="' + (filter === f.id) + '">' + esc(f.label) + '<span class="cnt">' + c[f.id] + '</span></button>';
    }).join('');
  }

  function flagRowHTML(o) {
    var b = o.blocked;
    return '<tr class="wt-flagrow" data-order="' + esc(o.id) + '"><td colspan="' + COLS + '">' +
      '<div class="wt-flag">' +
        '<span class="wt-flag__icon">' + I.flag + '</span>' +
        '<span class="wt-flag__txt"><b>' + esc(U.BLOCK_KIND_LABEL[b.kind] || 'תקועה') + ' · הזמנה ' + esc(o.number) + ':</b> ' +
          esc(b.reason || 'ללא סיבה') + ' <span class="wt-flag__since">(מאז ' + esc(U.fmtDateShort(b.since)) + ')</span></span>' +
        '<button type="button" class="btn btn--sm btn--secondary wt-flag__btn" data-flag>' + I.check + 'נפתר</button>' +
      '</div></td></tr>';
  }

  function noCellHTML(o, span) {
    var look = U.orderLook(o);
    var blocked = U.isBlocked(o);
    var due = o.dueDate ? U.dueText(o.dueDate) : '';
    var late = o.dueDate && U.daysUntil(o.dueDate) < 0 && o.status !== 'ready';
    return '<td class="wt-no wt-no--' + look.color + '" rowspan="' + span + '">' +
      '<div class="wt-no__num mono">' + esc(o.number) + '</div>' +
      '<span class="pill pill--lg is-' + (look.color === 'yellow' ? 'yellow' : look.color) + ' wt-no__pill"><span class="dot"></span>' + esc(look.label) + '</span>' +
      (due ? '<div class="wt-no__due' + (late ? ' is-late' : '') + '">' + I.clock + esc(due) + '</div>' : '') +
      '<button type="button" class="wt-flagbtn' + (blocked ? ' is-on' : '') + '" data-flag aria-label="' +
        (blocked ? 'הסרת דגל אדום' : 'סימון בדגל אדום') + '">' + I.flag + '<span>' + (blocked ? 'דגל פעיל' : 'דגל') + '</span></button>' +
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
        (it.note ? esc(it.note) : I.note + '<span>הערה</span>') + '</button></td>' +
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
      if (U.isBlocked(o)) html += flagRowHTML(o);
      rows.forEach(function (it, i) { html += itemRowHTML(o, it, i === 0, rows.length); });
      html += '<tr class="wt-gap" aria-hidden="true"><td colspan="' + COLS + '"></td></tr>';
    });
    if (!html) {
      html = '<tr><td colspan="' + COLS + '"><div class="empty wt-empty"><h3>' +
        (filter === 'all' ? 'אין עבודות פתוחות' : 'אין כאן כלום כרגע') + '</h3><p>' +
        (filter === 'all' ? 'כשתיפתח הזמנה חדשה, התמונות שלה יופיעו כאן.' : 'אפשר לחזור ל"הכל" כדי לראות את כל העבודות.') + '</p></div></td></tr>';
    }
    bodyEl.innerHTML = html;
    Gallery.updateBadge('worktable', list.filter(function (o) { return o.status === 'new' || o.status === 'in_progress'; }).length);
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
      if (o.status === 'ready' && before && before.status !== 'ready') msg.push('הזמנה ' + o.number + ' מוכנה. כל התמונות בוצעו.');
      // C38: הודעה על הורדת המלאי (רק כשבאמת ירד)
      var use = done && D.frameUsage ? D.frameUsage.forItem(itemId) : null;
      var f = use ? D.frames.peekOne(use.profileId) : null;
      if (use && f) msg.push('ירדו ' + (Number(use.amount) / 100) + ' מ\' מ-' + f.sku + ', נשאר ' + D.frames.remainingMeters(f) + ' מ\'.' + (D.frames.isLow(f) ? ' מלאי נמוך, כדאי להזמין.' : ''));
      if (msg.length) Gallery.toast(msg.join(' '));
    });
  }

  function onMaterialV(o, it) {
    var next = it.material === 'V' ? null : 'V';
    D.orders.updateItem(o.id, it.id, { material: next }).then(function () {
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
        D.orders.updateItem(o.id, it.id, { material: 'X' }).then(function () { Gallery.closeModal(); });
        return;
      }
      if (e.target.closest('[data-add]')) {
        var btn = e.target.closest('[data-add]');
        btn.disabled = true;
        D.orders.updateItem(o.id, it.id, { material: 'X' }).then(function () {
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
    var node = Gallery.modalNode({
      title: 'הערה · הזמנה <span class="mono">' + esc(o.number) + '</span> תמונה <span class="mono">' + esc(D.orders.itemLabel(it, o)) + '</span>',
      body: '<div class="form-field"><label for="wt-note">ההערה מופיעה גם בכרטיס ההזמנה</label>' +
        '<textarea id="wt-note" class="wt-notearea" rows="3" data-text placeholder="למשל: צריך לתקן פינות">' + esc(it.note || '') + '</textarea></div>' +
        '<div class="wt-quick">' + ['צריך לתקן פינות', 'זכוכית שבורה, להחליף', 'ממתין לחומר'].map(function (q) {
          return '<button type="button" class="fchip" data-q="' + esc(q) + '">' + esc(q) + '</button>';
        }).join('') + '</div>',
      foot: '<button class="btn btn--primary btn--lg" data-save>' + I.check + 'שמור הערה</button>' +
        (it.note ? '<button class="btn btn--danger" data-clear>מחק הערה</button>' : '') +
        '<button class="btn btn--ghost" data-close>ביטול</button>'
    });
    node.classList.add('wt-modal');
    function save(text) {
      D.orders.updateItem(o.id, it.id, { note: text }).then(function () { Gallery.closeModal(); });
    }
    node.addEventListener('click', function (e) {
      var q = e.target.closest('[data-q]');
      var ta = node.querySelector('[data-text]');
      if (q) { ta.value = q.getAttribute('data-q'); ta.focus(); return; }
      if (e.target.closest('[data-save]')) { save(ta.value.trim()); return; }
      if (e.target.closest('[data-clear]')) save('');
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

    if (e.target.closest('[data-flag]')) { Gallery.openBlockedFlag(o.id); return; }

    var itemId = tr.getAttribute('data-item');
    var it = (o.items || []).filter(function (x) { return x.id === itemId; })[0];
    if (!it) return;

    var tog = e.target.closest('[data-toggle]');
    if (tog) {
      var key = tog.getAttribute('data-toggle');
      var patch = {}; patch[key] = !it[key];
      D.orders.updateItem(o.id, it.id, patch);
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
    Gallery.openOrder = function (orderId) {
      var o = D.orders.peekOne(orderId);
      if (!o) return;
      var look = U.orderLook(o);
      var items = (o.items || []).map(function (it) {
        return '<tr' + (it.done ? ' class="is-done"' : '') + '><td class="c mono">' + esc(D.orders.itemLabel(it, o)) + '</td>' +
          '<td>' + esc(it.desc || 'תמונה') + '</td><td class="c mono">' + esc(U.fmtSize(it.widthCm, it.heightCm) || '-') + '</td>' +
          '<td class="mono">' + esc(it.profileSku || '-') + '</td><td class="c">' + (it.done ? 'בוצע' : '') + '</td><td>' + esc(it.note || '') + '</td></tr>';
      }).join('');
      var node = Gallery.modalNode({
        title: 'הזמנה <span class="mono">' + esc(o.number) + '</span> <span class="pill is-' + look.color + '"><span class="dot"></span>' + esc(look.label) + '</span>',
        body: (U.isBlocked(o) ? '<div class="flag-current"><div class="flag-current__reason">' + esc(o.blocked.reason) + '</div></div>' : '') +
          (o.dueDate ? '<p>מועד מסירה: <b>' + esc(U.fmtDate(o.dueDate)) + '</b> (' + esc(U.dueText(o.dueDate)) + ')</p>' : '') +
          '<div class="tablewrap"><table class="wtable"><thead><tr><th class="c">מס\' תמונה</th><th>תיאור</th><th class="c">מידות</th><th>מסגרת</th><th class="c">בוצע</th><th>הערות</th></tr></thead>' +
          '<tbody>' + items + '</tbody></table></div>' +
          (o.notes ? '<p class="wt-ordnotes">' + esc(o.notes) + '</p>' : ''),
        foot: '<button class="btn btn--secondary" data-close>סגירה</button>'
      });
      Gallery.openModal(node, { wide: true });
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
  }

  Gallery.registerView('worktable', { mount: mount, onShow: render });
})(window);
