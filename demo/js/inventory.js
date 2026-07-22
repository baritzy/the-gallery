/* =============================================================================
 * inventory.js  -  מודול "מלאי" (טאב 2)
 * שורות נפתחות של פרופילי מסגרת לפי ספק, בר צריכה, המלצת הזמנה מחדש,
 * ורשימת הזמנה לספק שמקבצת מלאי נמוך. נוסחת הצריכה מסומנת כטיוטה לאימות.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var DB = Gallery.DB;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;

  var container = null, bodyEl = null;
  var profiles = [], suppliers = [], usage = [], reorderItems = [];
  var openIds = {};
  var state = { term: '', lowOnly: false };

  function mount(el) {
    container = el;
    container.innerHTML =
      '<div class="view__head">' +
        '<div><h1 class="view__title">מלאי פרופילים</h1>' +
        '<p class="view__subtitle">מעקב אחר פרופילי המסגרת בסדנה, לפי שלושת הספקים.</p></div>' +
      '</div>' +
      '<div class="toolbar">' +
        '<div class="search">' + I.search +
          '<input type="search" data-search placeholder="חיפוש לפי מק״ט, סוג עץ, צבע..." aria-label="חיפוש מלאי">' +
        '</div>' +
        '<div class="chips">' +
          '<button class="fchip" data-low aria-pressed="false">רק מלאי נמוך <span class="cnt" data-lowcount>0</span></button>' +
        '</div>' +
      '</div>' +
      '<div data-body></div>';

    bodyEl = container.querySelector('[data-body]');

    container.querySelector('[data-search]').addEventListener('input', function (e) {
      state.term = e.target.value.trim(); render();
    });
    var lowBtn = container.querySelector('[data-low]');
    lowBtn.addEventListener('click', function () {
      state.lowOnly = !state.lowOnly;
      lowBtn.setAttribute('aria-pressed', String(state.lowOnly));
      render();
    });

    bodyEl.addEventListener('click', onClick);
    bodyEl.addEventListener('change', onChange);

    DB.subscribeSuppliers(function (s) { suppliers = s; render(); });
    DB.subscribeUsage(function (u) { usage = u; render(); });
    DB.subscribeProfiles(function (p) { profiles = p; render(); });
    DB.subscribeReorderItems(function (r) { reorderItems = r; render(); });
  }

  /* ------------------------------------------------------------- מדדי מלאי */
  function isLow(p) { return p.stockUnits < p.minThreshold; }
  function stockColor(p) {
    if (p.stockUnits < p.minThreshold) return 'red';
    if (p.stockUnits < p.minThreshold * 1.5) return 'orange';
    return 'green';
  }
  function fillPct(p) {
    var cap = p.minThreshold * 3;
    return Math.max(4, Math.min(100, Math.round(p.stockUnits / cap * 100)));
  }
  function thresholdPct() { return Math.round(1 / 3 * 100); } // סף = 33% מהסקאלה
  function supplierName(id) {
    var s = suppliers.filter(function (x) { return x.id === id; })[0];
    return s ? s.name : 'ספק';
  }
  function recommendQty(p) {
    var target = p.minThreshold * 3;
    var gap = target - p.stockUnits;
    return Math.max(50, Math.ceil(gap / 50) * 50);
  }

  /* -------------------------------------------------------------- render */
  function render() {
    if (!bodyEl) return;
    var lowCount = profiles.filter(isLow).length;
    var lc = container.querySelector('[data-lowcount]');
    if (lc) lc.textContent = lowCount;
    Gallery.updateBadge('inventory', lowCount);

    var list = profiles.filter(function (p) {
      if (state.lowOnly && !isLow(p)) return false;
      if (!state.term) return true;
      var t = state.term.toLowerCase();
      return (p.sku || '').toLowerCase().indexOf(t) !== -1 ||
        (p.woodType || '').toLowerCase().indexOf(t) !== -1 ||
        (p.color || '').toLowerCase().indexOf(t) !== -1;
    });

    if (list.length === 0) {
      bodyEl.innerHTML = '<div class="empty">' + I.frameEmpty +
        '<h3>לא נמצא פרופיל תואם</h3><p>נסה מק"ט או צבע אחר.</p></div>';
      return;
    }

    // קיבוץ לפי ספק
    var html = '';
    suppliers.forEach(function (s) {
      var group = list.filter(function (p) { return p.supplierId === s.id; });
      if (group.length === 0) return;
      var lowN = group.filter(isLow).length;
      html += '<div class="group">' +
        '<div class="group__head" style="--gcolor:var(--walnut);--gtext:var(--walnut);--gsoft:var(--walnut-soft)">' +
          '<span class="group__title">' + esc(s.name) + '</span>' +
          '<span class="group__count">' + group.length + '</span>' +
          (lowN ? '<span class="pill is-red" style="margin-inline-start:auto"><span class="dot"></span>' + lowN + ' להזמין</span>' : '') +
        '</div>' +
        '<div class="group__body">' + group.map(rowHTML).join('') + '</div>' +
      '</div>';
    });

    html += supplierOrderHTML();
    bodyEl.innerHTML = html;

    Array.prototype.forEach.call(bodyEl.querySelectorAll('.row'), function (r) {
      if (openIds[r.getAttribute('data-id')]) r.classList.add('open');
    });
  }

  // דוגמית עץ / thumbnail תמונה בשורה. small = מצב סגור, large = פאנל.
  function thumbHTML(p, large) {
    var cls = 'pthumb' + (large ? ' pthumb--lg' : '');
    if (p.photo) {
      return '<span class="' + cls + '"><img src="' + esc(p.photo) + '" alt="תמונת פרופיל ' + esc(p.sku) + '"></span>';
    }
    var grad = U.woodSwatch(p);
    var tag = large ? '<span class="pthumb__tag">📷 לצילום</span>' : '';
    return '<span class="' + cls + '" style="background-image:' + grad + '">' + tag + '</span>';
  }

  function rowHTML(p) {
    var color = stockColor(p);
    var low = isLow(p);
    return '<div class="row' + (low ? ' low' : '') + '" data-id="' + p.id + '" style="--spine:var(--st-' + color + ')">' +
      '<button class="row__head" aria-expanded="' + !!openIds[p.id] + '" data-toggle>' +
        thumbHTML(p, false) +
        '<span class="row__id mono">' + esc(p.sku) + '</span>' +
        '<span class="row__main">' +
          '<span class="row__name">' + esc(p.woodType) + ' · ' + esc(p.color) + '</span>' +
          '<span class="row__meta">' + esc(supplierName(p.supplierId)) + '</span>' +
        '</span>' +
        '<span class="stockbar">' +
          '<span class="track"><span class="fill" style="--fillc:var(--st-' + color + ');width:' + fillPct(p) + '%"></span>' +
          '<span class="thr" style="right:' + thresholdPct() + '%"></span></span>' +
          '<span class="num">' + p.stockUnits + ' ס"מ</span>' +
        '</span>' +
        (low ? '<span class="pill is-red"><span class="dot"></span>מלאי נמוך</span>' :
               '<span class="pill is-green"><span class="dot"></span>תקין</span>') +
        I.chevron +
      '</button>' +
      '<div class="row__panel"><div class="inner">' + panelHTML(p) + '</div></div>' +
    '</div>';
  }

  function panelHTML(p) {
    var hist = usage.filter(function (u) { return u.profileId === p.id; })
      .sort(function (a, b) { return new Date(b.date) - new Date(a.date); });

    var weekAvg = 0;
    if (hist.length) {
      var total = hist.reduce(function (s, u) { return s + (u.amount || 0); }, 0);
      var span = Math.max(1, U.daysSince(hist[hist.length - 1].date)) / 7;
      weekAvg = Math.round(total / Math.max(1, span));
    }

    var grid = '<div class="dgrid">' +
      '<div class="field"><div class="k">מק"ט</div><div class="v mono">' + esc(p.sku) + '</div></div>' +
      '<div class="field"><div class="k">סוג / צבע</div><div class="v">' + esc(p.woodType) + ' · ' + esc(p.color) + '</div></div>' +
      '<div class="field"><div class="k">ספק</div><div class="v">' + esc(supplierName(p.supplierId)) + '</div></div>' +
      '<div class="field"><div class="k">במלאי</div><div class="v strong">' + p.stockUnits + ' ס"מ</div></div>' +
      '<div class="field"><div class="k">סף מינימום</div><div class="v">' + p.minThreshold + ' ס"מ</div></div>' +
      '<div class="field"><div class="k">צריכה שבועית (ממוצע)</div><div class="v">' + (weekAvg || '-') + ' ס"מ</div></div>' +
      '</div>';

    var draftNote = '<div class="note-draft" title="הנוסחה מבוססת על היקף המלבן. היחידות המדויקות והפחת בפינות (חיתוך 45°) טרם נסגרו סופית עם אסף.">' +
      I.alert + 'חישוב צריכה: (רוחב + גובה) × 2 · טיוטה לאימות מול אסף</div>';

    var histHtml = '<div class="usage-hist"><div class="k">היסטוריית צריכה</div>' +
      (hist.length ? hist.slice(0, 5).map(function (u) {
        return '<div class="usage-row"><span>הזמנה #' + esc(u.orderNo) + ' · ' + U.fmtDate(u.date) + '</span>' +
          '<span class="amt">−' + u.amount + ' ס"מ</span></div>';
      }).join('') : '<div class="usage-row"><span>אין צריכה מתועדת עדיין</span></div>') +
      '</div>';

    var rec = isLow(p) ?
      '<div class="reorder-rec"><span class="txt">מתחת לסף. מומלץ להזמין <b>' + recommendQty(p) + ' ס"מ אורך</b> מ' + esc(supplierName(p.supplierId)) + '.</span>' +
      '<button class="btn btn--primary btn--sm" data-scroll-order>' + I.check + 'לרשימת ההזמנה</button></div>' :
      '<div class="reorder-rec" style="background:var(--st-green-soft)"><span class="txt" style="color:var(--st-green-text)">המלאי מעל הסף. אין צורך בהזמנה כרגע.</span></div>';

    var photo = '<div class="pphoto">' +
      thumbHTML(p, true) +
      '<div class="pphoto__side">' +
        '<div class="pphoto__title">תמונת סוג העץ</div>' +
        '<div class="pphoto__hint">' + (p.photo ? 'תמונה הועלתה. אפשר להחליף בכל רגע.' : 'עדיין דוגמית צבע. צלם את הפרופיל האמיתי כדי לזהות אותו במבט.') + '</div>' +
        '<label class="btn btn--secondary btn--sm pphoto__btn">' +
          '<input type="file" accept="image/*" capture="environment" data-photo-input hidden>' +
          '📷 ' + (p.photo ? 'החלף תמונה' : 'צלם / העלה תמונה') +
        '</label>' +
      '</div>' +
    '</div>';

    return '<div class="mat">' + photo + grid + draftNote + histHtml + rec + '</div>';
  }

  /* ------------------------------------------------ רשימת הזמנה לספק
     הרשימה = איחוד של (אוטומטי: מלאי נמוך) + (הוספות ידניות) פחות (הסרות ידניות).
     הכל נשמר ב-collection reorderItems כך שהבחירות של אסף נשמרות בין רענונים. */
  function reorderLines() {
    var dismissed = {}, manualSkus = {};
    reorderItems.forEach(function (r) { if (r.dismissed && r.sku) dismissed[r.sku] = true; });
    reorderItems.forEach(function (r) { if (r.manual && !r.dismissed && r.sku) manualSkus[r.sku] = true; });

    var lines = [];
    // אוטומטי: פרופילים מתחת לסף, פרט לאלה שאסף הסיר ידנית או שכבר הוסיף ידנית (כדי לא לכפול)
    profiles.filter(isLow).forEach(function (p) {
      if (dismissed[p.sku] || manualSkus[p.sku]) return;
      lines.push({ source: 'auto', sku: p.sku, desc: p.woodType + ' ' + p.color, qty: recommendQty(p), supplierId: p.supplierId });
    });
    // ידני: כל הוספה של אסף
    reorderItems.forEach(function (r) {
      if (!r.manual || r.dismissed) return;
      lines.push({ source: 'manual', rid: r.id, sku: r.sku || '', desc: r.label || r.sku || 'פריט', qty: r.qty || 0, supplierId: r.supplierId || null });
    });
    return lines;
  }

  function lineHTML(l) {
    var removeBtn = '<button class="sup-line__x" data-remove-line data-source="' + l.source + '"' +
      (l.source === 'manual' ? ' data-rid="' + esc(l.rid) + '"' : ' data-sku="' + esc(l.sku) + '"') +
      ' aria-label="הסר מהרשימה" title="הסר מהרשימה">×</button>';
    var tag = l.source === 'manual' ? ' <span class="sup-line__tag">ידני</span>' : '';
    return '<div class="sup-line">' +
      '<span class="sku">' + esc(l.sku || '-') + '</span>' +
      '<span class="desc">' + esc(l.desc) + tag + '</span>' +
      '<span class="qty">' + esc(String(l.qty)) + ' ס"מ</span>' +
      removeBtn + '</div>';
  }

  function supBlockHTML(name, fmt, arr) {
    return '<div class="sup-block">' +
      '<div class="sup-block__head">' + esc(name) +
        ' <span class="view__subtitle" style="font-weight:400">· ' + esc(fmt) + '</span></div>' +
      '<div class="sup-lines">' + arr.map(lineHTML).join('') + '</div></div>';
  }

  function supplierOrderHTML() {
    var lines = reorderLines();
    var head = '<div class="supplier-order__head"><h3>רשימת הזמנה לספק</h3>' +
      '<button class="btn btn--secondary btn--sm" data-add-reorder>' + I.plus + 'הוסף פריט ידנית</button></div>';
    var intro = '<p class="view__subtitle so-intro">מתעדכן אוטומטית לפי פרופילים מתחת לסף. אפשר להוסיף ולהסיר ידנית.</p>';

    var body;
    if (lines.length === 0) {
      body = '<p class="view__subtitle so-empty">אין כרגע פריטים ברשימה. הכל תקין. אפשר להוסיף פריט ידנית בכל רגע.</p>';
    } else {
      var known = {};
      suppliers.forEach(function (s) { known[s.id] = true; });
      var blocks = suppliers.map(function (s) {
        var arr = lines.filter(function (l) { return l.supplierId === s.id; });
        if (!arr.length) return '';
        return supBlockHTML(s.name, s.orderFormat, arr);
      }).join('');
      var other = lines.filter(function (l) { return !l.supplierId || !known[l.supplierId]; });
      if (other.length) blocks += supBlockHTML('פריטים ידניים נוספים', 'ללא ספק משויך', other);
      body = blocks;
    }
    return '<div class="supplier-order" data-order-section>' + head + intro + body + '</div>';
  }

  /* --------------------------------------------- הוספה/הסרה ידנית */
  function removeLine(btn) {
    var source = btn.getAttribute('data-source');
    if (source === 'manual') {
      DB.deleteReorderItem(btn.getAttribute('data-rid'));
      return;
    }
    // הסרת פריט אוטומטי: מסמנים dismissed לפי מק"ט (לא נספר שוב עד שאסף יחזיר אותו ידנית)
    var sku = btn.getAttribute('data-sku');
    var already = reorderItems.filter(function (r) { return r.dismissed && r.sku === sku; })[0];
    if (!already) DB.saveReorderItem({ sku: sku, dismissed: true, manual: false });
  }

  function openReorderModal() {
    var node = document.createElement('div');
    node.className = 'modal';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');

    var sorted = profiles.slice().sort(function (a, b) { return (a.sku || '').localeCompare(b.sku || ''); });
    var profOpts = sorted.map(function (p) {
      return '<option value="' + esc(p.id) + '" data-qty="' + recommendQty(p) + '">' +
        esc(p.sku) + ' · ' + esc(p.woodType) + ' ' + esc(p.color) + '</option>';
    }).join('');
    var defQty = sorted[0] ? recommendQty(sorted[0]) : 100;

    node.innerHTML =
      '<div class="modal__head">' +
        '<h2 class="modal__title">הוספת פריט לרשימת ההזמנה</h2>' +
        '<button class="modal__close" data-close aria-label="סגירה">×</button>' +
      '</div>' +
      '<div class="modal__body"><form data-form>' +
        '<div class="form-grid">' +
          '<div class="form-field col-2"><label for="ro-mode">סוג פריט</label>' +
            '<select id="ro-mode" name="mode">' +
              '<option value="profile">פרופיל קיים מהמלאי</option>' +
              '<option value="free">פריט חופשי (מק"ט וטקסט)</option>' +
            '</select></div>' +
          '<div class="form-field col-2" data-mode="profile"><label for="ro-prof">בחר פרופיל</label>' +
            '<select id="ro-prof" name="profileId">' + profOpts + '</select></div>' +
          '<div class="form-field" data-mode="free"><label for="ro-sku">מק"ט</label>' +
            '<input id="ro-sku" name="freeSku" type="text" placeholder="לדוגמה 4322-20"></div>' +
          '<div class="form-field" data-mode="free"><label for="ro-label">תיאור הפריט</label>' +
            '<input id="ro-label" name="freeLabel" type="text" placeholder="אלון טבעי בהיר"></div>' +
          '<div class="form-field"><label for="ro-qty">כמות מוצעת (ס"מ אורך)</label>' +
            '<input id="ro-qty" name="qty" type="number" min="0" value="' + defQty + '"></div>' +
        '</div>' +
      '</form></div>' +
      '<div class="modal__foot">' +
        '<button class="btn btn--primary" data-save>' + I.check + 'הוסף לרשימה</button>' +
        '<button class="btn btn--ghost" data-close>ביטול</button>' +
      '</div>';

    var modeSel = node.querySelector('[name="mode"]');
    var profSel = node.querySelector('[name="profileId"]');
    var qtyEl = node.querySelector('[name="qty"]');

    function applyMode() {
      var m = modeSel.value;
      Array.prototype.forEach.call(node.querySelectorAll('[data-mode]'), function (el) {
        el.style.display = (el.getAttribute('data-mode') === m) ? '' : 'none';
      });
    }
    modeSel.addEventListener('change', applyMode);
    applyMode();

    if (profSel) profSel.addEventListener('change', function () {
      var opt = profSel.options[profSel.selectedIndex];
      if (opt && opt.getAttribute('data-qty')) qtyEl.value = opt.getAttribute('data-qty');
    });

    Array.prototype.forEach.call(node.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', Gallery.closeModal);
    });
    node.querySelector('[data-save]').addEventListener('click', function () { saveReorderForm(node); });

    Gallery.openModal(node);
  }

  function saveReorderForm(node) {
    var form = node.querySelector('[data-form]');
    function val(n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; }
    var mode = val('mode');
    var qty = parseInt(val('qty'), 10) || 0;

    if (mode === 'profile') {
      var pid = val('profileId');
      var p = profiles.filter(function (x) { return x.id === pid; })[0];
      if (!p) { global.alert('בחר פרופיל מהרשימה.'); return; }
      DB.saveReorderItem({ sku: p.sku, label: p.woodType + ' ' + p.color, qty: qty, supplierId: p.supplierId, manual: true })
        .then(Gallery.closeModal);
    } else {
      var sku = val('freeSku');
      var label = val('freeLabel');
      if (!sku && !label) { global.alert('הזן מק"ט או תיאור לפריט.'); return; }
      DB.saveReorderItem({ sku: sku, label: label || sku, qty: qty, supplierId: null, manual: true })
        .then(Gallery.closeModal);
    }
  }

  /* ------------------------------------------------------------- events */
  function onClick(e) {
    var addBtn = e.target.closest('[data-add-reorder]');
    if (addBtn) { e.stopPropagation(); openReorderModal(); return; }

    var rmBtn = e.target.closest('[data-remove-line]');
    if (rmBtn) { e.stopPropagation(); removeLine(rmBtn); return; }

    var scrollBtn = e.target.closest('[data-scroll-order]');
    if (scrollBtn) {
      e.stopPropagation();
      var sec = bodyEl.querySelector('[data-order-section]');
      if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    var toggle = e.target.closest('[data-toggle]');
    var rowEl = e.target.closest('.row');
    if (toggle && rowEl) {
      var id = rowEl.getAttribute('data-id');
      var willOpen = !rowEl.classList.contains('open');
      rowEl.classList.toggle('open', willOpen);
      toggle.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) openIds[id] = true; else delete openIds[id];
    }
  }

  /* --------------------------------------------------- העלאת/צילום תמונה */
  function onChange(e) {
    var input = e.target.closest('[data-photo-input]');
    if (!input || !input.files || !input.files[0]) return;
    var rowEl = e.target.closest('.row');
    if (!rowEl) return;
    var id = rowEl.getAttribute('data-id');
    resizeImage(input.files[0], 500, function (dataUrl) {
      var p = profiles.filter(function (x) { return x.id === id; })[0];
      if (!p) return;
      openIds[id] = true; // השאר את השורה פתוחה אחרי ההעלאה
      DB.saveProfile(Object.assign({}, p, { photo: dataUrl }));
    });
  }

  // מקטין את התמונה ל-max פיקסלים בצד הארוך דרך canvas, ומחזיר dataURL של JPEG.
  // כך התמונה לא מפוצצת את localStorage (משקל דמו נמוך, בדיוק כמו בצילום אמיתי).
  function resizeImage(file, max, cb) {
    var reader = new FileReader();
    reader.onload = function (ev) {
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height;
        var scale = Math.min(1, max / Math.max(w, h));
        var cw = Math.max(1, Math.round(w * scale));
        var ch = Math.max(1, Math.round(h * scale));
        var canvas = document.createElement('canvas');
        canvas.width = cw; canvas.height = ch;
        canvas.getContext('2d').drawImage(img, 0, 0, cw, ch);
        var out;
        try { out = canvas.toDataURL('image/jpeg', 0.82); }
        catch (err) { out = ev.target.result; } // נפילה חכמה אם הדפדפן חוסם toDataURL
        cb(out);
      };
      img.onerror = function () { global.alert('לא הצלחתי לקרוא את התמונה. נסה קובץ אחר.'); };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  }

  Gallery.Inventory = { mount: mount };

})(window);
