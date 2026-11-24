/* =============================================================================
 * inventory-products.js  -  מלאי > מוצרים למכירה (C20.3), admin בלבד.
 * OWNER: agent B (wave 3). נטען דינמית מ-inventory.js רק כש-Gallery.role === 'admin'.
 * כרטיס מוצר: מספר מדבקה גדול (לא חובה, C39), שם, סוג, תיאור (C39), גודל, מסגרת, מחיר, כמות, הערה.
 * "מכור" = Gallery.openSale(productId) (agent C). נמכר = כמות 0, עם סינון.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var Inv = Gallery.Inv;
  if (!Inv || Gallery.role !== 'admin') return;
  var D = Gallery.data;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;
  var st = Inv.state, dat = Inv.data, num = Inv.num;
  var KINDS = D.PRODUCT_KINDS;
  var FILTERS = { available: 'זמינים', sold: 'נמכרו', all: 'הכל' };

  function isSold(p) { return D.products.isSold(p); }

  function cardHTML(p) {
    var sold = isSold(p);
    var money = Gallery.can('money');
    return '<article class="inv-prod' + (sold ? ' is-sold' : '') + '" data-pid="' + esc(p.id) + '">' +
      '<div class="inv-prod__top">' +
        (p.sticker ? '<span class="inv-sticker" title="מספר מדבקה">' + esc(p.sticker) + '</span>' :
          '<span class="inv-sticker inv-sticker--none" title="בלי מדבקה">בלי<br>מדבקה</span>') +
        '<div class="inv-prod__head">' +
          '<div class="inv-prod__name">' + esc(p.name) + '</div>' +
          '<span class="inv-kind inv-kind--' + esc(p.kind || 'other') + '">' + esc(KINDS[p.kind] || KINDS.other) + '</span>' +
        '</div>' +
      '</div>' +
      (p.description ? '<p class="inv-prod__desc">' + esc(p.description) + '</p>' : '') +
      '<dl class="inv-prod__facts">' +
        (p.size ? '<div><dt>גודל</dt><dd class="mono">' + esc(p.size) + '</dd></div>' : '') +
        (p.frame ? '<div><dt>מסגרת</dt><dd>' + esc(p.frame) + '</dd></div>' : '') +
        '<div><dt>כמות</dt><dd>' + num(p.qty) + '</dd></div>' +
      '</dl>' +
      (p.note ? '<div class="inv-prod__note">' + esc(p.note) + '</div>' : '') +
      '<div class="inv-prod__foot">' +
        (money ? '<span class="inv-prod__price money">' + U.fmtMoney(p.price) + '</span>' : '<span></span>') +
        (sold ? '<span class="pill is-grey pill--lg">נמכר' + (p.soldAt ? ' ' + U.fmtDateShort(p.soldAt) : '') + '</span>' :
          '<button type="button" class="btn btn--primary btn--lg inv-sell" data-sell>' + I.tag + 'מכור</button>') +
        '<button type="button" class="iconbtn inv-prod__edit" data-edit aria-label="עריכת מוצר">' + I.edit + '</button>' +
      '</div>' +
    '</article>';
  }

  function editModal(id) {
    var isNew = !id;
    var p = isNew ? { name: '', kind: 'print', size: '', frame: '', price: 0, qty: 1, sticker: '', description: '', note: '', soldAt: null } : D.products.peekOne(id);
    if (!p) return;
    var kindSeg = Object.keys(KINDS).map(function (k) {
      return '<button type="button" data-kind="' + k + '" aria-pressed="' + (p.kind === k) + '">' + esc(KINDS[k]) + '</button>';
    }).join('');
    var node = Gallery.modalNode({
      title: isNew ? I.plus + 'מוצר חדש למכירה' : I.edit + 'עריכה: ' + esc(p.name),
      body: '<div class="form-grid">' +
        '<div class="form-field col-2"><label>שם המוצר</label><input name="name" type="text" value="' + esc(p.name) + '" placeholder="לדוגמה: הדפס ון גוך"></div>' +
        '<div class="form-field col-2"><label>סוג</label><div class="seg inv-kindseg">' + kindSeg + '</div></div>' +
        '<div class="form-field col-2"><label for="prod-desc">תיאור</label><textarea id="prod-desc" name="description" rows="2" placeholder="לדוגמה: נוף ים בשקיעה, צבעי שמן">' + esc(p.description || '') + '</textarea></div>' +
        Inv.field('sticker', 'מספר מדבקה (לא חובה)', p.sticker) + Inv.field('size', 'גודל (ס"מ)', p.size) +
        Inv.field('frame', 'מסגרת', p.frame) +
        '<div class="form-field"><label>מחיר (₪)</label><input name="price" type="number" inputmode="numeric" min="0" value="' + num(p.price) + '"></div>' +
        '<div class="form-field"><label>כמות</label><input name="qty" type="number" inputmode="numeric" min="0" value="' + num(p.qty) + '"></div>' +
        Inv.field('note', 'הערה', p.note) +
      '</div>',
      foot: '<button class="btn btn--primary btn--lg" data-save>' + I.check + (isNew ? 'הוסף מוצר' : 'שמור') + '</button>' +
        '<button class="btn btn--ghost btn--lg" data-close>ביטול</button>' +
        (isNew ? '' : '<button class="btn btn--danger inv-del" data-del>' + I.trash + 'מחק</button>')
    });
    node.classList.add('modal--wide');
    var kind = p.kind || 'print';
    node.querySelector('.inv-kindseg').addEventListener('click', function (e) {
      var b = e.target.closest('[data-kind]'); if (!b) return;
      kind = b.getAttribute('data-kind');
      Array.prototype.forEach.call(this.children, function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    });
    node.querySelector('[data-save]').addEventListener('click', function () {
      var btn = this;
      if (btn.disabled) return;   // QA O4: הקשה כפולה לא שומרת פעמיים
      function v(n) { return node.querySelector('[name="' + n + '"]').value.trim(); }
      if (!v('name')) { Gallery.toast('חסר שם למוצר'); return; }
      btn.disabled = true;
      var qty = Math.max(0, Math.round(num(v('qty'))));
      Object.assign(p, { name: v('name'), kind: kind, sticker: v('sticker'), description: v('description'), size: v('size'), frame: v('frame'),
        price: Math.max(0, num(v('price'))), qty: qty, note: v('note') });
      p.soldAt = qty === 0 ? (p.soldAt || new Date().toISOString()) : null;
      D.products.save(p).then(function () { Gallery.closeModal(); Gallery.toast(isNew ? 'המוצר נוסף' : 'המוצר נשמר'); })
        .catch(function (err) { btn.disabled = false; Gallery.toast('השמירה נכשלה: ' + (err && err.message ? err.message : err)); });
    });
    var del = node.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () {
      if (!global.confirm('למחוק את "' + p.name + '"? מכירות קודמות נשארות בהיסטוריה.')) return;
      D.products.remove(p.id).then(function () { Gallery.closeModal(); Gallery.toast('המוצר נמחק'); });
    });
    Gallery.openModal(node);
  }

  Inv.panes.products = {
    placeholder: 'חיפוש לפי שם, מספר מדבקה, מסגרת...',
    addLabel: 'מוצר חדש',
    chipsHTML: function () {
      var soldN = dat.products.filter(isSold).length;
      var cnt = { available: dat.products.length - soldN, sold: soldN, all: dat.products.length };
      return Object.keys(FILTERS).map(function (k) {
        return '<button class="fchip" data-pf="' + k + '" aria-pressed="' + (st.prodFilter === k) + '">' + FILTERS[k] + ' <span class="cnt">' + cnt[k] + '</span></button>';
      }).join('');
    },
    onChip: function (e) {
      var b = e.target.closest('[data-pf]');
      if (!b) return false;
      st.prodFilter = b.getAttribute('data-pf');
      return true;
    },
    onAdd: function () { editModal(null); },
    render: function () {
      if (!dat.products.length) return Inv.emptyHTML('עוד אין מוצרים למכירה', 'לחצו "מוצר חדש" כדי להוסיף תמונה או הדפס שמוצגים בחנות.');
      var list = dat.products.filter(function (p) {
        if (st.prodFilter === 'available' && isSold(p)) return false;
        if (st.prodFilter === 'sold' && !isSold(p)) return false;
        return Inv.match([p.name, p.sticker, p.description, p.frame, p.size, p.note, KINDS[p.kind]]);
      }).sort(function (a, b) {
        // בלי מדבקה = בסוף הזמינים (C39)
        return (isSold(a) ? 1 : 0) - (isSold(b) ? 1 : 0) || (a.sticker ? 0 : 1) - (b.sticker ? 0 : 1) || num(a.sticker) - num(b.sticker);
      });
      if (!list.length) return Inv.emptyHTML(st.prodFilter === 'sold' ? 'אין מוצרים שנמכרו' : 'לא נמצא מוצר תואם', 'נסו סינון או חיפוש אחר.');
      return '<div class="inv-prods">' + list.map(cardHTML).join('') + '</div>';
    },
    onClick: function (e) {
      var t = e.target, card = t.closest('[data-pid]');
      if (!card) return;
      var id = card.getAttribute('data-pid');
      if (t.closest('[data-sell]')) { Gallery.openSale(id); return; }
      if (t.closest('[data-edit]')) editModal(id);
    }
  };
})(window);
