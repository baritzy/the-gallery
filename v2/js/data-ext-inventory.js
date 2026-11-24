/* =============================================================================
 * data-ext-inventory.js  -  הרחבות נתונים של agent B (wave 3): מלאי וספירת מלאי
 * OWNER: agent B. בלי לגעת ב-js/data/*.js. נטען אחרי js/data/*.js ולפני app.js.
 * -----------------------------------------------------------------------------
 *  frames.recommendRods(f)        כמה מוטות להציע (עד פי 3 מהסף, מינימום 1)
 *  frames.setNote(id, note)       הערה לפריט (C19)
 *  rawMaterials.adjust(id, delta) +/- כמות (לא יורד מתחת ל-0)
 *  rawMaterials.setNote(id, note)
 *  products.isSold(p)             כמות 0 = נמכר
 *  inventoryCounts.apply({ kind, counts:[{id, qty}], who, role }) -> Promise<entry>
 *      kind: 'frames' (qty במטרים) | 'rawMaterials' | 'products'. מעדכן הכל בבת אחת
 *      ורושם רשומת ספירה. inventoryCounts.list() / peek() / subscribe(cb)
 *  pendingLineFor(itemType, itemId) -> שורת ספק שעוד לא נשלחה (או null)
 *  frameUsage.sync(prevOrder, nextOrder)   צריכת מלאי אוטומטית (C38), נקרא מ-orders-model
 *      לפני כל כתיבת הזמנה. רשומת usage אחת לכל שורה, מזהה 'use-<itemId>' (לא מורידים פעמיים).
 *  frameUsage.forItem(itemId) -> רשומת הצריכה של השורה (או null)
 *
 * רשומות הספירה נשמרות במסמך meta (meta.stocktakes, 40 אחרונות), כי אין
 * קולקשן stocktakes. בקשה ל-foundation: להוסיף קולקשן 'stocktakes' ב-store.
 * ========================================================================== */

(function (global) {
  'use strict';
  var Gallery = global.Gallery;
  var S = Gallery.store;
  var D = Gallery.data;
  var KEEP = 40;

  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }

  D.frames.recommendRods = function (f) {
    var rod = num(f.rodLengthCm) || 290;
    var gap = num(f.minThreshold) * 3 - num(f.stockUnits);
    return Math.max(1, Math.ceil(gap / rod));
  };
  D.frames.setNote = function (id, note) {
    return S.ready.then(function () {
      var f = S.find('frames', id); if (!f) return null;
      f.note = String(note || '').trim();
      return S.put('frames', f);
    });
  };

  D.rawMaterials.adjust = function (id, delta) {
    return S.ready.then(function () {
      var r = S.find('rawMaterials', id); if (!r) return null;
      r.qty = Math.max(0, num(r.qty) + num(delta));
      return S.put('rawMaterials', r);
    });
  };
  D.rawMaterials.setNote = function (id, note) {
    return S.ready.then(function () {
      var r = S.find('rawMaterials', id); if (!r) return null;
      r.note = String(note || '').trim();
      return S.put('rawMaterials', r);
    });
  };

  D.products.isSold = function (p) { return num(p && p.qty) <= 0; };

  D.pendingLineFor = function (itemType, itemId) {
    return S.all('supplierOrderLines').filter(function (l) {
      return !l.sentAt && l.itemType === itemType && l.itemId === itemId;
    })[0] || null;
  };

  /* ------------------------------------------------- צריכת מלאי אוטומטית (C38)
   * שורה עברה ל"בוצע" (טבלת עבודה, כרטיס הזמנה, "סמן מוכנה", טופס עריכה):
   *   מורידים מהפרופיל את neededCm (כמו בחלון X) ורושמים usage עם מזהה קבוע לשורה.
   * בוטל "בוצע": מחזירים בדיוק מה שהורד ומוחקים את הרשומה.
   * שורה שנשארה "בוצע" ושונו לה מידות / פרופיל: מחזירים ומורידים מחדש.
   * בלי פרופיל במלאי או בלי מידות: מדלגים בשקט. שורות היסטוריות בלי רשומה לא נוגעים בהן. */
  function useId(itemId) { return 'use-' + itemId; }
  function planFor(it) {
    var f = D.frames.findBySku(it.profileSku);
    var cm = D.frames.neededCm ? D.frames.neededCm(it.widthCm, it.heightCm) : 0;
    return (f && cm > 0) ? { frame: f, cm: cm } : null;
  }
  function consume(o, it) {
    var p = planFor(it);
    if (!p) { delete it.consumedCm; return; }
    var f = S.find('frames', p.frame.id);
    var stock = num(f.stockUnits);
    var take = Math.min(stock, p.cm);
    f.stockUnits = stock - take;
    S.put('frames', f);
    S.put('usage', {
      id: useId(it.id), profileId: f.id, profileSku: f.sku, orderId: o.id || null,
      orderNo: String(o.number || ''), itemId: it.id, amount: p.cm, deductedCm: take,
      date: new Date().toISOString(), source: 'auto'
    });
    it.consumedCm = p.cm;
  }
  function restore(rec, it) {
    var f = rec.profileId ? S.find('frames', rec.profileId) : null;
    if (f) {
      f.stockUnits = num(f.stockUnits) + num(rec.deductedCm != null ? rec.deductedCm : rec.amount);
      S.put('frames', f);
    }
    S.del('usage', rec.id);
    if (it) delete it.consumedCm;
  }
  D.frameUsage = {
    forItem: function (itemId) { return S.find('usage', useId(itemId)); },
    sync: function (prev, o) {
      if (!o || !Array.isArray(o.items)) return;
      var before = {};
      ((prev && prev.items) || []).forEach(function (it) { if (it && it.id) before[it.id] = it; });
      o.items.forEach(function (it) {
        if (!it || !it.id) return;
        var wasDone = !!(before[it.id] && before[it.id].done);
        var rec = S.find('usage', useId(it.id));
        if (!it.done) { if (rec) restore(rec, it); else delete it.consumedCm; return; }
        if (!rec) { if (!wasDone) consume(o, it); return; }
        var p = planFor(it);
        if (!p || p.frame.id !== rec.profileId || p.cm !== num(rec.amount)) {
          restore(rec, it);
          consume(o, it);
        }
      });
    }
  };

  /* ---------------------------------------------------------- ספירת מלאי (C22) */
  function entries() { return ((S.getDoc('meta') || {}).stocktakes || []).slice(); }

  D.inventoryCounts = {
    peek: entries,
    list: function () { return S.ready.then(entries); },
    subscribe: function (cb) { return S.subscribe('meta', function () { cb(entries()); }); },
    apply: function (p) {
      return S.ready.then(function () {
        var kind = p.kind;
        var changes = [];
        (p.counts || []).forEach(function (c) {
          var rec = S.find(kind, c.id);
          if (!rec) return;
          var before, after;
          if (kind === 'frames') {
            before = num(rec.stockUnits);
            after = Math.max(0, Math.round(num(c.qty) * 100));
            if (before === after) return;
            rec.stockUnits = after;
          } else {
            before = num(rec.qty);
            after = Math.max(0, Math.round(num(c.qty) * 100) / 100);
            if (before === after) return;
            rec.qty = after;
            if (kind === 'products') rec.soldAt = after === 0 ? (rec.soldAt || new Date().toISOString()) : null;
          }
          S.put(kind, rec);
          changes.push({ id: rec.id, label: c.label || rec.name || rec.sku || '', before: before, after: after });
        });
        var entry = {
          id: S.uid(), at: new Date().toISOString(), kind: kind,
          who: String(p.who || '').trim(), role: p.role || Gallery.role || '',
          itemsCounted: (p.counts || []).length, added: num(p.added), changes: changes
        };
        var meta = S.getDoc('meta') || {};
        meta.stocktakes = [entry].concat(meta.stocktakes || []).slice(0, KEEP);
        S.setDoc('meta', meta);
        return entry;
      });
    }
  };
})(window);
