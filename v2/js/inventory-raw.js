/* =============================================================================
 * inventory-raw.js  -  מלאי > חומרי גלם (C20.2). OWNER: agent B (wave 3).
 * נטען דינמית מתוך inventory.js. שם, כמות + יחידה, מינימום -> מלאי נמוך,
 * ספק, הערה, כפתורי +/-. לחיצה על פריט = "למי להתקשר". הוספה / עריכה / מחיקה.
 * סבב 5: הפרדה ברורה בין "במלאי" (מה שיש בפועל, עם +/-) לבין "להזמין" (שורות ספק פתוחות,
 * או הצעה = מינימום × 2 פחות הכמות כשנמוך ואין שורה, מסומן "מוצע"). סיכום למעלה.
 * אין כסף בקובץ הזה (נטען גם בסדנה).
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var Inv = Gallery.Inv;
  if (!Inv) return;
  var D = Gallery.data;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;
  var st = Inv.state, dat = Inv.data, num = Inv.num;

  function rowHTML(r) {
    var low = D.rawMaterials.isLow(r);
    var to = Inv.toOrder('raw', r);
    var unit = r.unit || 'יחידות';
    var hasOpen = Inv.openQty('raw', r.id) > 0;
    return '<article class="inv-item inv-raw' + (low ? ' is-low' : '') + '" data-rid="' + esc(r.id) + '" style="--spine:var(--st-' + (low ? 'red' : 'green') + ')">' +
      '<div class="inv-raw__top">' +
        '<button type="button" class="inv-raw__main" data-contact aria-label="פרטי ספק עבור ' + esc(r.name) + '">' +
          '<span class="inv-raw__name">' + esc(r.name) + '</span>' +
          '<span class="inv-item__sup">' + I.phone + esc(Inv.supplierName(r.supplierId)) + ' · מינימום ' + num(r.minQty) + ' ' + esc(r.unit || '') + '</span>' +
          (Inv.isFrameSupplier(r.supplierId) ? '<span class="inv-suphint">' + I.alert + 'זה ספק מסגרות. כדאי לבחור ספק חומרי גלם בעריכה</span>' : '') +
        '</button>' +
        '<div class="inv-raw__qtys">' +
          '<div class="inv-raw__box inv-raw__stock' + (low ? ' is-low' : '') + '">' +
            '<span class="inv-raw__k">במלאי בפועל' + (low ? ' <span class="pill is-red"><span class="dot"></span>נמוך</span>' : '') + '</span>' +
            '<div class="inv-step">' +
              '<button type="button" class="inv-step__btn" data-adj="-1" aria-label="הורד אחד">' + I.minus + '</button>' +
              '<span class="inv-step__show" data-stock><b>' + num(r.qty) + '</b><small>' + esc(unit) + '</small></span>' +
              '<button type="button" class="inv-step__btn" data-adj="1" aria-label="הוסף אחד">' + I.plus + '</button>' +
            '</div>' +
          '</div>' +
          '<div class="inv-raw__box inv-raw__order' + (to.qty ? (to.suggested ? ' is-suggested' : ' is-open') : ' is-none') + '">' +
            '<span class="inv-raw__k">להזמין' + (to.suggested ? ' <span class="inv-raw__sugg">מוצע</span>' : (to.qty ? ' <span class="inv-raw__sugg is-open">ברשימת ספק</span>' : '')) + '</span>' +
            '<span class="inv-raw__ordv" data-toorder><b>' + (to.qty ? num(to.qty) : 'אין') + '</b>' + (to.qty ? '<small>' + esc(unit) + '</small>' : '') + '</span>' +
            '<button type="button" class="btn btn--primary btn--sm inv-raw__ordbtn" data-line>' + (hasOpen ? I.edit + 'עדכן הזמנה' : I.plus + 'הוסף להזמנה') + '</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
      '<div class="inv-item__bar">' + Inv.noteHTML('rawMaterials', r) +
        '<button type="button" class="btn btn--ghost inv-act" data-edit>' + I.edit + 'עריכה</button>' +
        '<button type="button" class="iconbtn inv-del-ico" data-del aria-label="מחיקת ' + esc(r.name) + '" title="מחיקה">' + I.trash + '</button>' +
      '</div>' +
    '</article>';
  }

  /* סיכום למעלה: כמה נמוכים, וכמה שורות חומרי גלם פתוחות להזמנה */
  function summaryHTML() {
    var lowN = dat.raw.filter(D.rawMaterials.isLow).length;
    var openN = dat.lines.filter(function (x) { return !x.sentAt && x.itemType === 'raw'; }).length;
    return '<div class="inv-raw__sum" data-raw-sum>' +
      '<span class="inv-raw__sumi' + (lowN ? ' is-low' : '') + '">פריטים במלאי נמוך: <b>' + lowN + '</b></span>' +
      '<span class="inv-raw__sumsep" aria-hidden="true">·</span>' +
      '<span class="inv-raw__sumi">שורות להזמנה פתוחות: <b>' + openN + '</b></span>' +
    '</div>';
  }

  function editModal(id) {
    var isNew = !id;
    var rawSups = D.suppliers.rawSuppliers();
    var r = isNew ? { name: '', unit: 'יחידות', qty: 0, minQty: 1, supplierId: rawSups.length === 1 ? rawSups[0].id : null, note: '' } : D.rawMaterials.peekOne(id);
    if (!r) return;
    var wrongKind = Inv.isFrameSupplier(r.supplierId);
    var node = Gallery.modalNode({
      title: (isNew ? I.plus + 'חומר גלם חדש' : I.edit + 'עריכה: ' + esc(r.name)),
      body: '<div class="form-grid">' +
        Inv.field('name', 'שם הפריט', r.name) + Inv.field('unit', 'יחידה (קופסאות, גלילים...)', r.unit) +
        Inv.field('qty', 'כמות במלאי', num(r.qty), 'number') + Inv.field('minQty', 'מינימום (מתחתיו = נמוך)', num(r.minQty), 'number') +
        '<div class="form-field"><label>ספק חומרי גלם</label><div class="inv-suprow">' +
          '<select class="select" name="supplierId">' + Inv.supplierOptions(r.supplierId, 'raw') + '</select>' +
          '<button type="button" class="btn btn--secondary" data-newsup>' + I.plus + 'ספק חדש</button></div>' +
          (wrongKind ? '<small class="inv-suphint">' + I.alert + 'הספק הנוכחי הוא ספק מסגרות. כדאי לבחור ספק חומרי גלם.</small>' : '') +
          (!rawSups.length ? '<small class="field-note">עוד אין ספקי חומרי גלם. לחצו "ספק חדש".</small>' : '') + '</div>' +
        Inv.field('note', 'הערה', r.note) +
        '<div class="inv-newsup" data-newsup-box hidden>' +
          Inv.field('ns_name', 'שם הספק החדש', '') + Inv.field('ns_phone', 'טלפון', '') +
        '</div>' +
      '</div>',
      foot: '<button class="btn btn--primary btn--lg" data-save>' + I.check + (isNew ? 'הוסף פריט' : 'שמור') + '</button>' +
        '<button class="btn btn--ghost btn--lg" data-close>ביטול</button>' +
        (isNew ? '' : '<button class="btn btn--danger inv-del" data-del>' + I.trash + 'מחק</button>')
    });
    node.querySelector('[data-save]').addEventListener('click', function () {
      var btn = this;
      if (btn.disabled) return;   // QA O4: הקשה כפולה לא שומרת פעמיים
      function v(n) { return node.querySelector('[name="' + n + '"]').value.trim(); }
      if (!v('name')) { Gallery.toast('חסר שם לפריט'); return; }
      var newSup = !node.querySelector('[data-newsup-box]').hidden && v('ns_name');
      btn.disabled = true;
      var supP = newSup ? D.suppliers.createRaw({ name: v('ns_name'), phone: v('ns_phone') }) : Promise.resolve(null);
      supP.then(function (sup) {
        Object.assign(r, { name: v('name'), unit: v('unit') || 'יחידות', qty: Math.max(0, num(v('qty'))),
          minQty: Math.max(0, num(v('minQty'))), supplierId: sup ? sup.id : (v('supplierId') || null), note: v('note') });
        return D.rawMaterials.save(r);
      }).then(function () { Gallery.closeModal(); Gallery.toast(isNew ? 'הפריט נוסף' : 'הפריט נשמר'); })
        .catch(function (err) { btn.disabled = false; Gallery.toast('השמירה נכשלה: ' + (err && err.message ? err.message : err)); });
    });
    node.querySelector('[data-newsup]').addEventListener('click', function () {
      var box = node.querySelector('[data-newsup-box]');
      box.hidden = !box.hidden;
      if (!box.hidden) { var i = box.querySelector('input'); if (i) i.focus(); }
    });
    var del = node.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () { deleteRaw(r.id); });
    Gallery.openModal(node);
  }

  function deleteRaw(id) {
    var r = D.rawMaterials.peekOne(id);
    if (!r) return;
    Gallery.deleteRecord({
      collection: 'rawMaterials', id: id, label: r.name,
      onDone: function () { if (Gallery.isModalOpen()) Gallery.closeModal(); }
    });
  }

  function contact(id) {
    var r = D.rawMaterials.peekOne(id);
    if (!r) return;
    var low = D.rawMaterials.isLow(r);
    Inv.contactModal(r.supplierId, {
      itemLabel: r.name,
      headHTML: '<div class="inv-contact__item' + (low ? ' is-low' : '') + '">' +
        '<b>' + esc(r.name) + '</b>: נשארו ' + num(r.qty) + ' ' + esc(r.unit || '') +
        (low ? ' (מתחת למינימום ' + num(r.minQty) + ')' : '') +
        (r.note ? '<div class="inv-line__note">' + esc(r.note) + '</div>' : '') + '</div>',
      footHTML: '<button class="btn btn--secondary btn--lg" data-to-line>' + I.plus + 'הוסף לרשימת ספק</button>' +
        '<button class="btn btn--ghost btn--lg" data-to-edit>' + I.edit + 'עריכת פריט</button>',
      onOpen: function (node) {
        node.querySelector('[data-to-line]').addEventListener('click', function () { Inv.lineModal('raw', id); });
        node.querySelector('[data-to-edit]').addEventListener('click', function () { editModal(id); });
      }
    });
  }

  Inv.panes.raw = {
    placeholder: 'חיפוש חומר גלם, ספק, הערה...',
    addLabel: 'פריט חדש',
    chipsHTML: function () {
      var n = dat.raw.filter(D.rawMaterials.isLow).length;
      return '<button class="fchip" data-low aria-pressed="' + st.lowOnly + '">רק מלאי נמוך <span class="cnt">' + n + '</span></button>';
    },
    onChip: function (e) { if (e.target.closest('[data-low]')) { st.lowOnly = !st.lowOnly; return true; } return false; },
    onAdd: function () { editModal(null); },
    render: function () {
      if (!dat.raw.length) return Inv.emptyHTML('עוד אין חומרי גלם', 'מוסיפים סיכות, קרטון גב, טייפים וכו\'.', 'פריט חדש');
      var list = dat.raw.filter(function (r) {
        if (st.lowOnly && !D.rawMaterials.isLow(r)) return false;
        return Inv.match([r.name, r.unit, r.note, Inv.supplierName(r.supplierId)]);
      }).sort(function (a, b) {
        var la = D.rawMaterials.isLow(a) ? 0 : 1, lb = D.rawMaterials.isLow(b) ? 0 : 1;
        return la - lb || String(a.name).localeCompare(String(b.name), 'he');
      });
      if (!list.length) return summaryHTML() + Inv.emptyHTML('לא נמצא פריט תואם', 'נסו מילה אחרת.');
      return summaryHTML() + '<div class="inv-list">' + list.map(rowHTML).join('') + '</div>';
    },
    onClick: function (e) {
      var t = e.target, row = t.closest('[data-rid]');
      if (!row) return;
      var id = row.getAttribute('data-rid');
      var adj = t.closest('[data-adj]');
      if (adj) { D.rawMaterials.adjust(id, num(adj.getAttribute('data-adj'))); return; }
      if (t.closest('[data-line]')) { Inv.lineModal('raw', id); return; }
      if (t.closest('[data-edit]')) { editModal(id); return; }
      if (t.closest('[data-del]')) { deleteRaw(id); return; }
      if (t.closest('[data-contact]')) contact(id);
    }
  };
})(window);
