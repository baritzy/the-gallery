/* =============================================================================
 * inventory-count.js  -  ספירת מלאי (C22). OWNER: agent B (wave 3).
 * נטען דינמית מ-inventory.js. מסך מלא לתת-הטאב הנוכחי: שורה לכל פריט עם
 * שדה מספר גדול (ממולא בכמות הנוכחית), +/-, ו"הוסף פריט חדש" בשורה (הזנה ראשונית).
 * "שמור ספירה" מעדכן הכל בבת אחת ורושם ספירה: Gallery.data.inventoryCounts.apply.
 * מסגרות נספרות במטרים. מחיר מופיע רק בהוספת מוצר (admin בלבד).
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
  var num = Inv.num;

  var TITLE = { frames: 'מסגרות', rawMaterials: 'חומרי גלם', products: 'מוצרים' };
  var overlay = null, ctx = null;

  function rowsFor(kind) {
    return D[kind].peek().map(function (r) {
      if (kind === 'frames') return { id: r.id, label: r.sku, sub: (r.woodType || '') + ' ' + (r.color || ''), cur: num(r.stockUnits) / 100, unit: 'מטר', step: 0.5 };
      if (kind === 'products') return { id: r.id, label: r.sticker ? 'מדבקה ' + r.sticker : '', sub: r.name, cur: num(r.qty), unit: 'יח\'', step: 1 };
      return { id: r.id, label: r.name, sub: Inv.supplierName(r.supplierId), cur: num(r.qty), unit: r.unit || 'יח\'', step: 1 };
    }).sort(function (a, b) { return String(a.label + a.sub).localeCompare(String(b.label + b.sub), 'he'); });
  }

  function rowHTML(r) {
    return '<div class="inv-cnt__row" data-cid="' + esc(r.id) + '" data-s="' + esc((r.label + ' ' + r.sub).toLowerCase()) + '">' +
      '<div class="inv-cnt__lbl"><b>' + esc(r.label) + '</b> <span>' + esc(r.sub) + '</span>' +
        '<small>כרגע: ' + fmt(r.cur) + ' ' + esc(r.unit) + '</small></div>' +
      stepHTML(r.cur, r.step, r.unit) +
    '</div>';
  }
  function stepHTML(val, step, unit) {
    return '<div class="inv-step inv-step--lg" data-step="' + step + '">' +
      '<button type="button" class="inv-step__btn" data-d="-1" aria-label="פחות">' + I.minus + '</button>' +
      '<input type="number" class="inv-step__val" inputmode="decimal" min="0" step="' + step + '" value="' + fmt(val) + '" aria-label="כמות שנספרה">' +
      '<button type="button" class="inv-step__btn" data-d="1" aria-label="יותר">' + I.plus + '</button>' +
      '<span class="inv-step__unit">' + esc(unit) + '</span></div>';
  }
  function fmt(n) { return String(Math.round(num(n) * 100) / 100); }

  function newRowHTML(kind) {
    var sup = '<select class="select" name="supplierId">' + Inv.supplierOptions('') + '</select>';
    var f;
    if (kind === 'frames') {
      f = inp('sku', 'מק"ט') + inp('woodType', 'סוג עץ') + inp('color', 'צבע') + sup +
        inp('qty', 'מטרים במלאי', 'number') + inp('min', 'מינימום (מ\')', 'number');
    } else if (kind === 'products') {
      f = inp('sticker', 'מדבקה') + inp('name', 'שם המוצר') +
        '<select class="select" name="kind">' + Object.keys(D.PRODUCT_KINDS).map(function (k) {
          return '<option value="' + k + '">' + esc(D.PRODUCT_KINDS[k]) + '</option>';
        }).join('') + '</select>' +
        inp('size', 'גודל') + (Gallery.can('money') ? inp('price', 'מחיר ₪', 'number') : '') + inp('qty', 'כמות', 'number', 1);
    } else {
      f = inp('name', 'שם הפריט') + inp('unit', 'יחידה') + sup + inp('qty', 'כמות', 'number') + inp('min', 'מינימום', 'number');
    }
    return '<div class="inv-cnt__newrow" data-newrow>' + f +
      '<button type="button" class="iconbtn" data-rm-new aria-label="הסר שורה">' + I.trash + '</button></div>';
  }
  function inp(name, ph, type, val) {
    return '<input name="' + name + '" type="' + (type || 'text') + '"' + (type === 'number' ? ' inputmode="decimal" min="0"' : '') +
      ' placeholder="' + esc(ph) + '" aria-label="' + esc(ph) + '"' + (val != null ? ' value="' + val + '"' : '') + '>';
  }

  function lastText(kind) {
    var e = D.inventoryCounts.peek().filter(function (x) { return x.kind === kind; })[0];
    if (!e) return 'עוד לא נעשתה ספירה. זו גם הדרך להזנה ראשונית.';
    return 'ספירה אחרונה: ' + U.fmtDate(e.at) + (e.who ? ', ' + e.who : '') + ' (' + (e.role === 'workshop' ? 'סדנה' : 'חנות') + '), ' +
      U.plural(e.changes.length, 'שינוי אחד', 'שינויים');
  }

  function changedCount() {
    var n = 0;
    Array.prototype.forEach.call(overlay.querySelectorAll('[data-cid]'), function (row) {
      var cur = ctx.cur[row.getAttribute('data-cid')];
      var on = Math.abs(num(row.querySelector('input').value) - cur) > 1e-9;
      row.classList.toggle('is-changed', on);
      if (on) n++;
    });
    var newN = overlay.querySelectorAll('[data-newrow]').length;
    overlay.querySelector('[data-changes]').textContent = n || newN ?
      U.plural(n, 'שינוי אחד', 'שינויים') + (newN ? ' · ' + U.plural(newN, 'פריט חדש', 'פריטים חדשים') : '') : 'אין שינויים עדיין';
    return n + newN;
  }

  Inv.openCount = function (kind) {
    if (overlay) return;
    if (!D[kind] || (kind === 'products' && !Inv.IS_ADMIN)) return;
    var rows = rowsFor(kind);
    ctx = { kind: kind, cur: {}, rows: {} };
    rows.forEach(function (r) { ctx.cur[r.id] = Math.round(r.cur * 100) / 100; ctx.rows[r.id] = r; });
    var who = ''; try { who = Gallery.store.deviceGet('inv:who') || ''; } catch (e) {}

    overlay = document.createElement('div');
    overlay.className = 'inv-cnt';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'ספירת מלאי');
    overlay.innerHTML =
      '<header class="inv-cnt__head">' +
        '<div class="inv-cnt__title"><h2>' + I.count + 'ספירת מלאי: ' + TITLE[kind] + '</h2><p>' + esc(lastText(kind)) + '</p></div>' +
        '<label class="inv-cnt__who"><span>מי סופר</span><input type="text" data-who value="' + esc(who) + '" placeholder="שם"></label>' +
        '<button type="button" class="modal__close" data-cancel aria-label="סגירה">×</button>' +
      '</header>' +
      '<div class="inv-cnt__tools"><div class="search">' + I.search + '<input type="search" data-filter placeholder="חיפוש מהיר בספירה" aria-label="חיפוש בספירה"></div>' +
        '<span class="inv-cnt__changes" data-changes></span></div>' +
      '<div class="inv-cnt__list">' +
        (rows.length ? rows.map(rowHTML).join('') : '<p class="inv-cnt__empty">אין עדיין פריטים. הוסיפו פריט חדש למטה.</p>') +
        '<div data-newhost></div>' +
        '<button type="button" class="btn btn--secondary btn--lg inv-cnt__add" data-add-new>' + I.plus + 'הוסף פריט חדש</button>' +
      '</div>' +
      '<footer class="inv-cnt__foot">' +
        '<button type="button" class="btn btn--primary btn--lg" data-save>' + I.check + 'שמור ספירה</button>' +
        '<button type="button" class="btn btn--ghost btn--lg" data-cancel>ביטול</button>' +
      '</footer>';
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';
    changedCount();

    overlay.addEventListener('input', function (e) {
      if (e.target.matches('[data-filter]')) {
        var t = e.target.value.trim().toLowerCase();
        Array.prototype.forEach.call(overlay.querySelectorAll('[data-cid]'), function (r) {
          r.hidden = !!t && r.getAttribute('data-s').indexOf(t) === -1;
        });
        return;
      }
      if (e.target.closest('[data-cid]')) changedCount();
    });
    overlay.addEventListener('click', function (e) {
      var t = e.target, b;
      if ((b = t.closest('[data-d]'))) {
        var wrap = b.closest('.inv-step'), input = wrap.querySelector('input');
        var step = num(wrap.getAttribute('data-step')) || 1;
        input.value = fmt(Math.max(0, num(input.value) + step * num(b.getAttribute('data-d'))));
        changedCount();
        return;
      }
      if (t.closest('[data-add-new]')) {
        var host = overlay.querySelector('[data-newhost]');
        host.insertAdjacentHTML('beforeend', newRowHTML(kind));
        var first = host.lastElementChild.querySelector('input');
        if (first) first.focus();
        changedCount();
        return;
      }
      if ((b = t.closest('[data-rm-new]'))) { b.closest('[data-newrow]').remove(); changedCount(); return; }
      if (t.closest('[data-save]')) { save(); return; }
      if (t.closest('[data-cancel]')) {
        if (changedCount() > 0 && !global.confirm('יש שינויים שלא נשמרו. לצאת בלי לשמור?')) return;
        close();
      }
    });
  };

  function close() {
    if (overlay) overlay.remove();
    overlay = null; ctx = null;
    document.body.style.overflow = '';
  }

  function newRecords(kind) {
    var out = [], bad = 0;
    Array.prototype.forEach.call(overlay.querySelectorAll('[data-newrow]'), function (row) {
      function v(n) { var el = row.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; }
      if (kind === 'frames') {
        if (!v('sku')) { bad++; return; }
        out.push({ sku: v('sku'), woodType: v('woodType'), color: v('color'), supplierId: v('supplierId') || null,
          stockUnits: Math.round(num(v('qty')) * 100), minThreshold: Math.round(num(v('min')) * 100), unit: 'ס"מ אורך',
          rodLengthCm: 290, photo: null, note: '' });
      } else if (kind === 'products') {
        if (!v('name')) { bad++; return; }
        var q = Math.max(0, Math.round(num(v('qty') || 1)));
        out.push({ sticker: v('sticker'), name: v('name'), kind: v('kind') || 'other', size: v('size'), frame: '',
          price: num(v('price')), qty: q, note: '', soldAt: q === 0 ? new Date().toISOString() : null });
      } else {
        if (!v('name')) { bad++; return; }
        out.push({ name: v('name'), unit: v('unit') || 'יחידות', supplierId: v('supplierId') || null,
          qty: Math.max(0, num(v('qty'))), minQty: Math.max(0, num(v('min'))), note: '' });
      }
    });
    return { recs: out, bad: bad };
  }

  function save() {
    var kind = ctx.kind;
    var nr = newRecords(kind);
    if (nr.bad) { Gallery.toast('בשורה חדשה חסר ' + (kind === 'frames' ? 'מק"ט' : 'שם') + '. השלימו או הסירו אותה.'); return; }
    var who = overlay.querySelector('[data-who]').value.trim();
    try { Gallery.store.deviceSet('inv:who', who); } catch (e) {}
    var counts = Array.prototype.map.call(overlay.querySelectorAll('[data-cid]'), function (row) {
      var id = row.getAttribute('data-cid');
      return { id: id, qty: num(row.querySelector('input').value), label: kind === 'rawMaterials' ? ctx.rows[id].label : (ctx.rows[id].label + ' ' + ctx.rows[id].sub).trim() };
    });
    var btn = overlay.querySelector('[data-save]');
    btn.disabled = true;
    Promise.all(nr.recs.map(function (r) { return D[kind].save(r); }))
      .then(function () {
        return D.inventoryCounts.apply({ kind: kind, counts: counts, who: who, role: Gallery.role, added: nr.recs.length });
      })
      .then(function (entry) {
        close();
        Gallery.toast('הספירה נשמרה: ' + U.plural(entry.changes.length, 'שינוי אחד', 'שינויים') +
          (nr.recs.length ? ', ' + U.plural(nr.recs.length, 'פריט חדש', 'פריטים חדשים') : ''));
      })
      .catch(function (err) {
        btn.disabled = false;
        global.console.error(err);
        Gallery.toast('השמירה נכשלה. נסו שוב.');
      });
  }
})(window);
