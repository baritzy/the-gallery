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
  var profiles = [], suppliers = [], usage = [];
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

    html += supplierOrderHTML(list);
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

  /* ------------------------------------------------ רשימת הזמנה לספק */
  function supplierOrderHTML(list) {
    var lows = profiles.filter(isLow);
    if (lows.length === 0) {
      return '<div class="supplier-order"><h3>רשימת הזמנה לספק</h3>' +
        '<p class="view__subtitle">אין כרגע פרופילים מתחת לסף. הכל תקין.</p></div>';
    }
    var bySup = {};
    lows.forEach(function (p) { (bySup[p.supplierId] = bySup[p.supplierId] || []).push(p); });

    var blocks = suppliers.map(function (s) {
      var arr = bySup[s.id];
      if (!arr || !arr.length) return '';
      return '<div class="sup-block">' +
        '<div class="sup-block__head">' + esc(s.name) +
          ' <span class="view__subtitle" style="font-weight:400">· ' + esc(s.orderFormat) + '</span></div>' +
        '<div class="sup-lines">' + arr.map(function (p) {
          return '<div class="sup-line"><span class="sku">' + esc(p.sku) + '</span>' +
            '<span class="desc">' + esc(p.woodType) + ' ' + esc(p.color) + '</span>' +
            '<span class="qty">' + recommendQty(p) + ' ס"מ</span></div>';
        }).join('') + '</div></div>';
    }).join('');

    return '<div class="supplier-order" data-order-section><h3>רשימת הזמנה לספק</h3>' +
      '<p class="view__subtitle">מקובץ לפי ספק, כולל מק"טים וכמות מומלצת.</p>' + blocks + '</div>';
  }

  /* ------------------------------------------------------------- events */
  function onClick(e) {
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
