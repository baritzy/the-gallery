/* =============================================================================
 * inventory.js  -  טאב "מלאי" v2 (C19, C20, C22). OWNER: agent B (wave 3).
 * -----------------------------------------------------------------------------
 * מעטפת + תתי-טאבים (מסגרות | חומרי גלם | מוצרים) + פאנל המסגרות + עזרים משותפים.
 * חלקים נוספים נטענים דינמית (אין גישה ל-HTML):
 *   js/inventory-raw.js       חומרי גלם (C20.2)
 *   js/inventory-products.js  מוצרים למכירה (C20.3), admin בלבד, לא נטען בסדנה
 *   js/inventory-count.js     ספירת מלאי (C22)
 * כסף: עלות מסגרת (למטר) רק בטופס של admin. מחירי מוצרים רק ב-admin (Gallery.can('money')).
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var D = Gallery.data;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;

  I.phone = I.phone || '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/></svg>';
  I.count = I.count || '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4h6v3H9z"/><path d="M15 5h3a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h3"/><path d="M9 12l2 2 4-4"/><path d="M9 17h6"/></svg>';
  I.minus = I.minus || '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14"/></svg>';

  var IS_ADMIN = Gallery.role === 'admin';
  var SUBS = IS_ADMIN ? ['frames', 'raw', 'products'] : ['frames', 'raw'];
  var SUB_LABEL = { frames: 'מסגרות', raw: 'חומרי גלם', products: 'מוצרים' };

  var Inv = Gallery.Inv = {
    IS_ADMIN: IS_ADMIN, SUBS: SUBS, SUB_LABEL: SUB_LABEL,
    state: { sub: 'frames', term: '', lowOnly: false, prodFilter: 'available' },
    data: { frames: [], raw: [], products: [], suppliers: [], usage: [], lines: [] },
    panes: {},
    open: {}
  };
  var st = Inv.state, dat = Inv.data;
  var container = null, bodyEl = null, chipsEl = null, segEl = null, searchEl = null, addBtn = null;

  try { var saved = Gallery.store.deviceGet('inv:sub'); if (saved && SUBS.indexOf(saved) !== -1) st.sub = saved; } catch (e) {}

  /* ------------------------------------------------ טעינת חלקים נוספים */
  var VER = Gallery.VERSION || '';   // W4: גרסה אחת משותפת (js/version.js)
  function loadPart(name) {
    var s = document.createElement('script');
    s.src = 'js/inventory-' + name + '.js?v=' + VER;
    s.onload = function () { Inv.rerender(); };
    s.onerror = function () { global.console.error('[inventory] failed to load part: ' + name); };
    document.head.appendChild(s);
  }
  loadPart('raw');
  loadPart('count');
  if (IS_ADMIN) loadPart('products');

  /* ------------------------------------------------------------- עזרים */
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function meters(cm) { return (Math.round(num(cm)) / 100).toLocaleString('he-IL', { maximumFractionDigits: 2 }); }
  Inv.num = num;
  Inv.meters = meters;
  Inv.supplier = function (id) { return dat.suppliers.filter(function (s) { return s.id === id; })[0] || null; };
  Inv.supplierName = function (id) { var s = Inv.supplier(id); return s ? s.name : 'ללא ספק'; };
  /* R3: kind = 'frames' | 'raw' -> רק ספקים מהסוג הזה. ספק נוכחי מסוג אחר נשאר ברשימה (מסומן), כדי לא לאבד אותו. */
  Inv.supplierOptions = function (sel, kind) {
    var list = dat.suppliers.filter(function (s) { return !kind || D.suppliers.kindOf(s) === kind || s.id === sel; });
    return '<option value="">ללא ספק</option>' + list.map(function (s) {
      var other = kind && D.suppliers.kindOf(s) !== kind;
      return '<option value="' + esc(s.id) + '"' + (s.id === sel ? ' selected' : '') + '>' + esc(s.name) +
        (other ? (kind === 'raw' ? ' (ספק מסגרות)' : ' (ספק חומרי גלם)') : '') + '</option>';
    }).join('');
  };
  Inv.isFrameSupplier = function (id) { var s = Inv.supplier(id); return !!s && D.suppliers.kindOf(s) === 'frames'; };
  Inv.match = function (fields) {
    if (!st.term) return true;
    var t = st.term.toLowerCase();
    return fields.some(function (f) { return String(f == null ? '' : f).toLowerCase().indexOf(t) !== -1; });
  };
  Inv.pendingText = function (type, id, unit) {
    var l = dat.lines.filter(function (x) { return !x.sentAt && x.itemType === type && x.itemId === id; });
    if (!l.length) return '';
    var q = l.reduce(function (s, x) { return s + num(type === 'frame' ? x.qtyRods : x.qty); }, 0);
    return type === 'frame' ? 'ברשימת ספק: ' + U.plural(q, 'מוט אחד', 'מוטות') : 'ברשימת ספק: ' + q + (unit ? ' ' + unit : '');
  };
  /* addLabel = כפתור הוספה בתוך המצב הריק (R3) */
  Inv.emptyHTML = function (title, sub, addLabel) {
    return '<div class="empty">' + I.frameEmpty + '<h3>' + esc(title) + '</h3><p>' + esc(sub || '') + '</p>' +
      (addLabel ? '<button type="button" class="btn btn--primary btn--lg" data-add-empty>' + I.plus + esc(addLabel) + '</button>' : '') + '</div>';
  };
  Inv.noteHTML = function (col, item) {
    return '<button type="button" class="inv-note' + (item.note ? '' : ' is-empty') + '" data-note="' + col + '" data-id="' + esc(item.id) + '">' +
      I.edit + '<span>' + (item.note ? esc(item.note) : 'הוסף הערה') + '</span></button>';
  };

  /* מודל הערה (C19) */
  Inv.noteModal = function (col, id) {
    var rec = D[col].peekOne(id);
    if (!rec) return;
    var node = Gallery.modalNode({
      title: I.edit + 'הערה: ' + esc(rec.sku || rec.name || ''),
      body: '<div class="form-field"><label for="inv-note-ta">הערה לפריט</label>' +
        '<textarea id="inv-note-ta" class="inv-ta" rows="3" placeholder="לדוגמה: מהחומר הזה מזמינים 10 מוטות, יותר זול">' + esc(rec.note || '') + '</textarea></div>',
      foot: '<button class="btn btn--primary btn--lg" data-save>' + I.check + 'שמור הערה</button>' +
        '<button class="btn btn--ghost btn--lg" data-close>ביטול</button>'
    });
    node.querySelector('[data-save]').addEventListener('click', function () {
      var v = node.querySelector('textarea').value;
      rec.note = String(v || '').trim();
      D[col].save(rec).then(function () { Gallery.closeModal(); Gallery.toast('ההערה נשמרה'); });
    });
    Gallery.openModal(node);
  };

  /* מודל "הוסף לרשימת ספק": כמות גדולה עם +/- */
  Inv.lineModal = function (itemType, id) {
    var col = itemType === 'frame' ? 'frames' : 'rawMaterials';
    var rec = D[col].peekOne(id);
    if (!rec) return;
    var existing = D.supplierOrderLines.peek().filter(function (l) {
      return !l.sentAt && l.itemType === itemType && l.itemId === id && l.source === 'manual' && !l.orderId;
    })[0];
    var qty = existing ? num(itemType === 'frame' ? existing.qtyRods : existing.qty) :
      (itemType === 'frame' ? D.frames.recommendRods(rec) : Math.max(1, num(rec.minQty) * 2 - num(rec.qty)));
    var unit = itemType === 'frame' ? 'מוטות' : (rec.unit || 'יחידות');
    var label = itemType === 'frame' ? rec.sku + ' ' + (rec.woodType || '') + ' ' + (rec.color || '') : rec.name;
    var info = itemType === 'frame' ? 'במלאי עכשיו: ' + meters(rec.stockUnits) + ' מ\'' : 'במלאי עכשיו: ' + num(rec.qty) + ' ' + esc(rec.unit || '');
    var node = Gallery.modalNode({
      title: I.suppliers + 'הוספה לרשימת ספק',
      body: '<div class="inv-line">' +
        '<div class="inv-line__item">' + esc(label) + '</div>' +
        '<div class="inv-line__sub">ספק: <b>' + esc(Inv.supplierName(rec.supplierId)) + '</b> · ' + info + '</div>' +
        (rec.note ? '<div class="inv-line__note">' + esc(rec.note) + '</div>' : '') +
        '<div class="inv-step inv-step--lg">' +
          '<button type="button" class="inv-step__btn" data-d="-1" aria-label="פחות">' + I.minus + '</button>' +
          '<input type="number" inputmode="numeric" min="1" class="inv-step__val" value="' + qty + '" aria-label="כמות">' +
          '<button type="button" class="inv-step__btn" data-d="1" aria-label="יותר">' + I.plus + '</button>' +
        '</div><div class="inv-line__unit">' + esc(unit) + '</div>' +
        (existing ? '<p class="inv-line__exist">כבר ברשימה. השמירה מחליפה את הכמות.</p>' : '') +
        (rec.supplierId ? '' : '<p class="inv-line__exist">לפריט אין ספק. כדאי לבחור ספק בעריכת הפריט.</p>') +
      '</div>',
      foot: '<button class="btn btn--primary btn--lg" data-save>' + I.check + 'הוסף לרשימה</button>' +
        '<button class="btn btn--ghost btn--lg" data-close>ביטול</button>'
    });
    var input = node.querySelector('.inv-step__val');
    Array.prototype.forEach.call(node.querySelectorAll('[data-d]'), function (b) {
      b.addEventListener('click', function () { input.value = Math.max(1, num(input.value) + num(b.getAttribute('data-d'))); });
    });
    node.querySelector('[data-save]').addEventListener('click', function () {
      var q = Math.max(1, Math.round(num(input.value)));
      var line = { itemType: itemType, itemId: id, source: 'manual', orderId: null };
      if (itemType === 'frame') line.qtyRods = q; else line.qty = q;
      Gallery.addSupplierLine(line).then(function () {
        Gallery.closeModal();
        Gallery.toast('נוסף לרשימה של ' + Inv.supplierName(rec.supplierId), {
          actions: Gallery.hasView('suppliers') ? [{ label: 'לרשימת הספקים', onClick: function () { Gallery.switchTab('suppliers'); } }] : [],
          timeout: 4500
        });
      });
    });
    Gallery.openModal(node, { focus: false });
  };

  /* מודל "למי להתקשר": פרטי ספק + התקשר / וואטסאפ */
  Inv.contactModal = function (supplierId, opts) {
    opts = opts || {};
    var s = Inv.supplier(supplierId);
    var body;
    if (!s) {
      body = '<p class="inv-contact__none">לפריט הזה עוד אין ספק. אפשר לבחור ספק בעריכת הפריט.</p>';
    } else {
      body = '<div class="inv-contact">' +
        '<div class="inv-contact__name">' + esc(s.name) + '</div>' +
        (s.contactName ? '<div class="inv-contact__who">איש קשר: ' + esc(s.contactName) + '</div>' : '') +
        (s.phone ? '<div class="inv-contact__phone mono">' + esc(s.phone) + '</div>' : '<div class="inv-contact__who">אין מספר טלפון שמור</div>') +
        (s.note ? '<div class="inv-contact__note">' + esc(s.note) + '</div>' : '') +
        (s.phone ? '<div class="inv-contact__btns">' +
          '<a class="btn btn--primary btn--lg" href="tel:' + esc(String(s.phone).replace(/[^\d+]/g, '')) + '">' + I.phone + 'התקשר</a>' +
          '<button class="btn btn--wa btn--lg" data-wa>' + I.wa + 'וואטסאפ</button></div>' : '') +
      '</div>';
    }
    var node = Gallery.modalNode({
      title: I.phone + 'למי להתקשר' + (opts.itemLabel ? ': ' + esc(opts.itemLabel) : ''),
      body: (opts.headHTML || '') + body,
      foot: (opts.footHTML || '') + '<button class="btn btn--ghost btn--lg" data-close>סגירה</button>'
    });
    var wa = node.querySelector('[data-wa]');
    if (wa) wa.addEventListener('click', function () {
      var text = 'שלום ' + (s.contactName || s.name) + ', כאן ' + (D.settings.peek().shop.name || 'הגלריה') + '.' +
        (opts.itemLabel ? ' צריך להזמין: ' + opts.itemLabel + '.' : '');
      Gallery.whatsapp(s.phone, text);
    });
    if (opts.onOpen) opts.onOpen(node);
    Gallery.openModal(node, { focus: false });
    return node;
  };

  /* --------------------------------------------------------------- mount */
  function mount(el) {
    container = el;
    container.innerHTML =
      '<div class="view__head inv-head">' +
        '<div><h1 class="view__title">מלאי</h1>' +
        '<p class="view__subtitle">' + (IS_ADMIN ? 'מסגרות, חומרי גלם ומוצרים למכירה.' : 'מסגרות וחומרי גלם בסדנה.') + '</p></div>' +
        '<div class="inv-head__acts">' +
          '<button class="btn btn--primary btn--lg inv-add" data-add hidden>' + I.plus + '<span></span></button>' +
          '<button class="btn btn--secondary btn--lg inv-count-btn" data-count>' + I.count + 'ספירת מלאי</button>' +
        '</div>' +
      '</div>' +
      '<div class="seg inv-seg" role="tablist" data-seg>' + SUBS.map(function (k) {
        return '<button type="button" role="tab" data-sub="' + k + '" aria-pressed="' + (st.sub === k) + '">' +
          '<span>' + SUB_LABEL[k] + '</span><span class="inv-seg__cnt" data-subcnt="' + k + '"></span></button>';
      }).join('') + '</div>' +
      '<div class="toolbar inv-toolbar">' +
        '<div class="search">' + I.search + '<input type="search" data-search aria-label="חיפוש במלאי"></div>' +
        '<div class="chips" data-chips></div>' +
      '</div>' +
      '<div data-body></div>';

    bodyEl = container.querySelector('[data-body]');
    chipsEl = container.querySelector('[data-chips]');
    segEl = container.querySelector('[data-seg]');
    searchEl = container.querySelector('[data-search]');
    addBtn = container.querySelector('[data-add]');

    searchEl.addEventListener('input', function (e) { st.term = e.target.value.trim(); renderBody(); });
    segEl.addEventListener('click', function (e) {
      var b = e.target.closest('[data-sub]');
      if (!b) return;
      st.sub = b.getAttribute('data-sub');
      st.term = ''; searchEl.value = '';
      try { Gallery.store.deviceSet('inv:sub', st.sub); } catch (err) {}
      Inv.rerender();
    });
    container.querySelector('[data-count]').addEventListener('click', function () {
      if (Inv.openCount) Inv.openCount(st.sub === 'raw' ? 'rawMaterials' : st.sub);
      else Gallery.toast('ספירת המלאי עדיין נטענת, נסה שוב בעוד רגע');
    });
    addBtn.addEventListener('click', function () { var p = st.sub === 'frames' ? FramesPane : Inv.panes[st.sub]; if (p && p.onAdd) p.onAdd(); });
    chipsEl.addEventListener('click', onChipClick);
    bodyEl.addEventListener('click', onClick);
    bodyEl.addEventListener('change', onChange);

    D.suppliers.subscribe(function (s) { dat.suppliers = s; renderBody(); });
    D.usage.subscribe(function (u) { dat.usage = u; if (st.sub === 'frames') renderBody(); });
    D.supplierOrderLines.subscribe(function (l) { dat.lines = l; renderBody(); });
    D.frames.subscribe(function (f) { dat.frames = f; Inv.rerender(); });
    D.rawMaterials.subscribe(function (r) { dat.raw = r; Inv.rerender(); });
    if (IS_ADMIN) D.products.subscribe(function (p) { dat.products = p; Inv.rerender(); });
    Inv.rerender();
  }

  /* -------------------------------------------------------------- render */
  Inv.rerender = function () {
    if (!container) return;
    var lowF = dat.frames.filter(D.frames.isLow).length;
    var lowR = dat.raw.filter(D.rawMaterials.isLow).length;
    Gallery.updateBadge('inventory', lowF + lowR);
    setSubCount('frames', lowF ? lowF + ' נמוך' : '', !!lowF);
    setSubCount('raw', lowR ? lowR + ' נמוך' : '', !!lowR);
    if (IS_ADMIN) setSubCount('products', String(dat.products.filter(function (p) { return !D.products.isSold(p); }).length), false);
    Array.prototype.forEach.call(segEl.querySelectorAll('[data-sub]'), function (b) {
      b.setAttribute('aria-pressed', String(b.getAttribute('data-sub') === st.sub));
    });
    var pane = st.sub === 'frames' ? FramesPane : Inv.panes[st.sub];
    searchEl.placeholder = pane && pane.placeholder ? pane.placeholder : 'חיפוש...';
    chipsEl.innerHTML = pane && pane.chipsHTML ? pane.chipsHTML() : '';
    if (pane && pane.addLabel) { addBtn.hidden = false; addBtn.querySelector('span').textContent = pane.addLabel; }
    else addBtn.hidden = true;
    renderBody();
  };
  function setSubCount(k, txt, warn) {
    var c = segEl && segEl.querySelector('[data-subcnt="' + k + '"]');
    if (!c) return;
    c.textContent = txt;
    c.classList.toggle('is-warn', warn);
  }
  function renderBody() {
    if (!bodyEl) return;
    var pane = st.sub === 'frames' ? FramesPane : Inv.panes[st.sub];
    if (!pane) { bodyEl.innerHTML = '<div class="empty"><h3>טוען...</h3></div>'; return; }
    bodyEl.innerHTML = pane.render();
  }
  Inv.renderBody = renderBody;

  function onChipClick(e) {
    var pane = st.sub === 'frames' ? FramesPane : Inv.panes[st.sub];
    if (pane && pane.onChip && pane.onChip(e)) Inv.rerender();
  }
  function onClick(e) {
    var t = e.target;
    var nb = t.closest('[data-note]');
    if (nb) { Inv.noteModal(nb.getAttribute('data-note'), nb.getAttribute('data-id')); return; }
    var pane = st.sub === 'frames' ? FramesPane : Inv.panes[st.sub];
    if (t.closest('[data-add-empty]')) { if (pane && pane.onAdd) pane.onAdd(); return; }
    if (pane && pane.onClick) pane.onClick(e);
  }
  function onChange(e) {
    var pane = st.sub === 'frames' ? FramesPane : Inv.panes[st.sub];
    if (pane && pane.onChange) pane.onChange(e);
  }

  /* =========================================================================
   * מסגרות (C19 / C20.1)
   * ======================================================================= */
  function stockColor(f) {
    if (D.frames.isLow(f)) return 'red';
    if (num(f.stockUnits) < num(f.minThreshold) * 1.5) return 'orange';
    return 'green';
  }
  function fillPct(f) {
    var cap = Math.max(1, num(f.minThreshold) * 3);
    return Math.max(4, Math.min(100, Math.round(num(f.stockUnits) / cap * 100)));
  }
  function thumbHTML(f, large) {
    var cls = 'pthumb' + (large ? ' pthumb--lg' : '');
    if (f.photo) return '<span class="' + cls + '"><img src="' + esc(f.photo) + '" alt="תמונת פרופיל ' + esc(f.sku) + '"></span>';
    return '<span class="' + cls + '" style="background-image:' + U.woodSwatch(f) + '"></span>';
  }

  var FramesPane = {
    placeholder: 'חיפוש לפי מק"ט, סוג עץ, צבע, ספק...',
    addLabel: 'מסגרת חדשה',
    onAdd: function () { editFrame(null); },
    chipsHTML: function () {
      var n = dat.frames.filter(D.frames.isLow).length;
      return '<button class="fchip" data-low aria-pressed="' + st.lowOnly + '">רק מלאי נמוך <span class="cnt">' + n + '</span></button>';
    },
    onChip: function (e) { if (e.target.closest('[data-low]')) { st.lowOnly = !st.lowOnly; return true; } return false; },
    render: function () {
      var list = dat.frames.filter(function (f) {
        if (st.lowOnly && !D.frames.isLow(f)) return false;
        return Inv.match([f.sku, f.woodType, f.color, f.note, Inv.supplierName(f.supplierId)]);
      });
      if (!dat.frames.length) return Inv.emptyHTML('עוד אין מסגרות במלאי', 'מוסיפים מסגרת אחת אחת, או הרבה בבת אחת דרך "ספירת מלאי".', 'מסגרת חדשה');
      if (!list.length) return Inv.emptyHTML('לא נמצא פרופיל תואם', 'נסה מק"ט או צבע אחר.');
      var groups = dat.suppliers.map(function (s) { return { s: s, arr: list.filter(function (f) { return f.supplierId === s.id; }) }; });
      var known = {}; dat.suppliers.forEach(function (s) { known[s.id] = 1; });
      groups.push({ s: { id: '', name: 'ללא ספק' }, arr: list.filter(function (f) { return !known[f.supplierId]; }) });
      return groups.filter(function (g) { return g.arr.length; }).map(function (g) {
        var low = g.arr.filter(D.frames.isLow).length;
        return '<section class="inv-group">' +
          '<h2 class="inv-group__head">' + esc(g.s.name) + ' <span class="inv-group__n">' + g.arr.length + '</span>' +
          (low ? '<span class="pill is-red"><span class="dot"></span>' + low + ' מלאי נמוך</span>' : '') + '</h2>' +
          '<div class="inv-list">' + g.arr.sort(function (a, b) { return String(a.sku).localeCompare(String(b.sku)); }).map(frameRow).join('') + '</div></section>';
      }).join('');
    },
    onClick: function (e) {
      var t = e.target, row = t.closest('[data-fid]');
      if (!row) return;
      var id = row.getAttribute('data-fid');
      if (t.closest('[data-line]')) { Inv.lineModal('frame', id); return; }
      if (t.closest('[data-call]')) {
        var f = D.frames.peekOne(id);
        if (f) Inv.contactModal(f.supplierId, { itemLabel: f.sku + ' ' + f.woodType + ' ' + f.color });
        return;
      }
      if (t.closest('[data-edit-frame]')) { editFrame(id); return; }
      if (t.closest('[data-del-frame]')) { deleteFrame(id); return; }
      if (t.closest('[data-toggle]')) {
        Inv.open['f' + id] = !Inv.open['f' + id];
        renderBody();
      }
    },
    onChange: function (e) {
      var input = e.target.closest('[data-photo-input]');
      if (!input || !input.files || !input.files[0]) return;
      var id = input.closest('[data-fid]').getAttribute('data-fid');
      resizeImage(input.files[0], 500, function (dataUrl) {
        var f = D.frames.peekOne(id); if (!f) return;
        f.photo = dataUrl;
        D.frames.save(f);
      });
    }
  };

  function frameRow(f) {
    var color = stockColor(f), low = D.frames.isLow(f), open = !!Inv.open['f' + f.id];
    var pend = Inv.pendingText('frame', f.id);
    return '<article class="inv-item' + (low ? ' is-low' : '') + (open ? ' is-open' : '') + '" data-fid="' + esc(f.id) + '" style="--spine:var(--st-' + color + ')">' +
      '<button type="button" class="inv-item__main" data-toggle aria-expanded="' + open + '">' +
        thumbHTML(f, false) +
        '<span class="inv-item__sku mono">' + esc(f.sku) + '</span>' +
        '<span class="inv-item__txt"><span class="inv-item__name">' + esc(f.woodType || '') + ' · ' + esc(f.color || '') + '</span>' +
          '<span class="inv-item__sup">' + esc(Inv.supplierName(f.supplierId)) + '</span></span>' +
        '<span class="inv-bar"><span class="inv-bar__track"><span class="inv-bar__fill" style="--fillc:var(--st-' + color + ');width:' + fillPct(f) + '%"></span>' +
          '<span class="inv-bar__thr"></span></span>' +
          '<span class="inv-bar__num">' + meters(f.stockUnits) + ' מ\'</span></span>' +
        (low ? '<span class="pill is-red pill--lg"><span class="dot"></span>מלאי נמוך</span>' : '<span class="pill is-green"><span class="dot"></span>תקין</span>') +
        I.chevron +
      '</button>' +
      '<div class="inv-item__bar">' + Inv.noteHTML('frames', f) +
        (pend ? '<span class="inv-pend">' + I.suppliers + esc(pend) + '</span>' : '') +
        '<button type="button" class="btn btn--secondary inv-act" data-call>' + I.phone + 'ספק</button>' +
        '<button type="button" class="btn btn--primary inv-act" data-line>' + I.plus + 'הוסף לרשימת ספק</button>' +
        '<button type="button" class="btn btn--ghost inv-act" data-edit-frame>' + I.edit + 'עריכה</button>' +
        '<button type="button" class="iconbtn inv-del-ico" data-del-frame aria-label="מחיקת מסגרת ' + esc(f.sku) + '" title="מחיקה">' + I.trash + '</button>' +
      '</div>' +
      (open ? '<div class="inv-item__panel">' + framePanel(f) + '</div>' : '') +
    '</article>';
  }

  function framePanel(f) {
    var hist = dat.usage.filter(function (u) { return u.profileId === f.id || (!u.profileId && u.profileSku === f.sku); })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    var weekAvg = 0;
    if (hist.length) {
      var total = hist.reduce(function (s, u) { return s + num(u.amount); }, 0);
      weekAvg = Math.round(total / Math.max(1, U.daysSince(hist[hist.length - 1].date) / 7));
    }
    function fact(k, v) { return '<div class="inv-fact"><div class="inv-fact__k">' + k + '</div><div class="inv-fact__v">' + v + '</div></div>'; }
    return '<div class="inv-panel">' +
      '<div class="inv-panel__photo">' + thumbHTML(f, true) +
        '<label class="btn btn--secondary inv-act"><input type="file" accept="image/*" capture="environment" data-photo-input hidden>' +
        (f.photo ? 'החלף תמונה' : 'צלם / העלה תמונה') + '</label></div>' +
      '<div class="inv-facts">' +
        fact('במלאי', meters(f.stockUnits) + ' מ\' (' + Math.round(num(f.stockUnits)) + ' ס"מ)') +
        fact('סף מינימום', meters(f.minThreshold) + ' מ\'') +
        fact('אורך מוט', num(f.rodLengthCm || 290) + ' ס"מ') +
        fact('צריכה שבועית', weekAvg ? meters(weekAvg) + ' מ\'' : '-') +
        fact('המלצה להזמנה', low(f) ? U.plural(D.frames.recommendRods(f), 'מוט אחד', 'מוטות') : 'אין צורך') +
      '</div>' +
      '<div class="inv-hist"><div class="inv-fact__k">צריכה אחרונה</div>' +
        (hist.length ? hist.slice(0, 5).map(function (u) {
          return '<div class="inv-hist__row"><span>הזמנה ' + esc(u.orderNo) + ' · ' + U.fmtDate(u.date) + '</span><span class="mono">-' + Math.round(num(u.amount)) + ' ס"מ</span></div>';
        }).join('') : '<div class="inv-hist__row"><span>אין צריכה מתועדת עדיין</span></div>') +
      '</div>' +
      '<div class="inv-panel__acts"><button type="button" class="btn btn--ghost inv-act" data-edit-frame>' + I.edit + 'עריכת פרטים</button></div>' +
    '</div>';
  }
  function low(f) { return D.frames.isLow(f); }

  /* R3: הוספה / עריכה מלאה של מסגרת. עלות למטר רק ב-admin (לא קיימת בכלל בטופס של הסדנה). */
  function editFrame(id) {
    var isNew = !id;
    var f = isNew ? { sku: '', woodType: '', color: '', supplierId: null, stockUnits: 0, minThreshold: 290, unit: 'ס"מ אורך',
      rodLengthCm: 290, costPerCm: 0, photo: null, note: '' } : D.frames.peekOne(id);
    if (!f) return;
    var money = Gallery.can('money');
    var photo = f.photo || null;
    var noFrameSup = !dat.suppliers.some(function (s) { return D.suppliers.kindOf(s) === 'frames'; });
    var node = Gallery.modalNode({
      title: isNew ? I.plus + 'מסגרת חדשה' : I.edit + 'עריכת מסגרת ' + esc(f.sku),
      body: '<div class="form-grid inv-fform">' +
        field('sku', 'מק"ט', f.sku) + field('woodType', 'סוג עץ / חומר', f.woodType) + field('color', 'צבע', f.color) +
        '<div class="form-field"><label>ספק מסגרות</label><select class="select" name="supplierId">' + Inv.supplierOptions(f.supplierId, 'frames') + '</select>' +
          (noFrameSup ? '<small class="field-note">אין ספקי מסגרות. אפשר להוסיף בטאב ספקים.</small>' : '') + '</div>' +
        field('stockM', 'במלאי (מטרים)', isNew ? '' : meters(f.stockUnits).replace(/,/g, ''), 'number') +
        field('minM', 'סף מינימום (מטרים)', meters(f.minThreshold).replace(/,/g, ''), 'number') +
        (money ? '<div class="form-field money"><label>עלות למטר (₪)</label><input name="costM" type="number" inputmode="decimal" step="0.1" min="0" value="' +
          esc(f.costPerCm ? String(Math.round(num(f.costPerCm) * 100 * 100) / 100) : '') + '"></div>' : '') +
        '<div class="form-field col-2"><label for="inv-fnote">הערה</label><textarea id="inv-fnote" name="note" rows="2" placeholder="לדוגמה: מהחומר הזה מזמינים 10 מוטות">' + esc(f.note || '') + '</textarea></div>' +
        '<div class="form-field col-2"><label>תמונה</label><div class="inv-fphoto">' +
          '<span class="inv-fphoto__show" data-photo-show></span>' +
          '<label class="btn btn--secondary inv-act"><input type="file" accept="image/*" capture="environment" data-photo-pick hidden><span data-photo-lbl></span></label>' +
          '<button type="button" class="btn btn--ghost inv-act" data-photo-rm>הסר תמונה</button>' +
        '</div></div>' +
      '</div>',
      foot: '<button class="btn btn--primary btn--lg" data-save>' + I.check + (isNew ? 'הוסף מסגרת' : 'שמור') + '</button>' +
        '<button class="btn btn--ghost btn--lg" data-close>ביטול</button>' +
        (isNew ? '' : '<button class="btn btn--danger inv-del" data-del>' + I.trash + 'מחק</button>')
    });
    node.classList.add('modal--wide');
    function showPhoto() {
      node.querySelector('[data-photo-show]').innerHTML = photo ? '<img src="' + esc(photo) + '" alt="תמונת הפרופיל">' : '<span class="inv-fphoto__none">אין תמונה</span>';
      node.querySelector('[data-photo-lbl]').textContent = photo ? 'החלף תמונה' : 'צלם / העלה תמונה';
      node.querySelector('[data-photo-rm]').hidden = !photo;
    }
    showPhoto();
    node.querySelector('[data-photo-pick]').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      resizeImage(file, 500, function (dataUrl) { photo = dataUrl; showPhoto(); });
      e.target.value = '';
    });
    node.querySelector('[data-photo-rm]').addEventListener('click', function () { photo = null; showPhoto(); });
    node.querySelector('[data-save]').addEventListener('click', function () {
      var btn = this;
      if (btn.disabled) return;   // QA O4: הקשה כפולה לא שומרת פעמיים
      function v(n) { var el = node.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; }
      if (!v('sku')) { Gallery.toast('חסר מק"ט'); return; }
      var dup = dat.frames.filter(function (x) { return x.sku === v('sku') && x.id !== f.id; })[0];
      if (dup) { Gallery.toast('כבר יש מסגרת עם המק"ט ' + v('sku')); return; }
      btn.disabled = true;
      Object.assign(f, { sku: v('sku'), woodType: v('woodType'), color: v('color'), supplierId: v('supplierId') || null,
        stockUnits: Math.max(0, Math.round(num(v('stockM')) * 100)), minThreshold: Math.max(0, Math.round(num(v('minM')) * 100)),
        note: v('note'), photo: photo });
      if (money) f.costPerCm = Math.max(0, num(v('costM')) / 100);
      D.frames.save(f).then(function () { Gallery.closeModal(); Gallery.toast(isNew ? 'המסגרת נוספה' : 'המסגרת נשמרה'); })
        .catch(function (err) { btn.disabled = false; Gallery.toast('השמירה נכשלה: ' + (err && err.message ? err.message : err)); });
    });
    var del = node.querySelector('[data-del]');
    if (del) del.addEventListener('click', function () { deleteFrame(f.id); });
    Gallery.openModal(node, { focus: isNew });
  }

  function deleteFrame(id) {
    var f = D.frames.peekOne(id);
    if (!f) return;
    var open = dat.lines.filter(function (l) { return !l.sentAt && l.itemType === 'frame' && l.itemId === id; }).length;
    Gallery.deleteRecord({
      collection: 'frames', id: id,
      label: 'מסגרת ' + f.sku + (f.woodType || f.color ? ' (' + [f.woodType, f.color].filter(Boolean).join(' ') + ')' : ''),
      detail: open ? 'יש לה ' + U.plural(open, 'שורה פתוחה', 'שורות פתוחות') + ' ברשימת ספק. השורות נשארות.' : '',
      onDone: function () { if (Gallery.isModalOpen()) Gallery.closeModal(); }
    });
  }
  Inv.deleteFrame = deleteFrame;

  function field(name, label, val, type) {
    return '<div class="form-field"><label>' + label + '</label><input name="' + name + '" type="' + (type || 'text') + '"' +
      (type === 'number' ? ' inputmode="decimal" step="0.1" min="0"' : '') + ' value="' + esc(val == null ? '' : val) + '"></div>';
  }
  Inv.field = field;

  /* מקטין תמונה דרך canvas ל-JPEG קטן (לא לפוצץ את האחסון) */
  function resizeImage(file, max, cb) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var scale = Math.min(1, max / Math.max(img.width, img.height));
        var c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.width * scale)); c.height = Math.max(1, Math.round(img.height * scale));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        var out; try { out = c.toDataURL('image/jpeg', 0.82); } catch (err) { out = ev.target.result; }
        cb(out);
      };
      img.onerror = function () { Gallery.toast('לא הצלחתי לקרוא את התמונה. נסה קובץ אחר.'); };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  Gallery.Inventory = { mount: mount, onShow: function () { Inv.rerender(); } };
  Gallery.registerView('inventory', Gallery.Inventory);

})(window);
