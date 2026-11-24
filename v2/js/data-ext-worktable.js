/* =============================================================================
 * data-ext-worktable.js  -  הרחבות נתונים של agent A (wave 3)
 * OWNER: agent A. כאן מוסיפים פונקציות נתונים חסרות, בלי לגעת ב-js/data/*.js.
 * הקובץ נטען אחרי js/data/*.js ולפני app.js.
 * -----------------------------------------------------------------------------
 * frames.WASTE_CM, frames.neededCm(w,h), frames.suggestRods(frame, neededCm), frames.label(f)
 * supplierOrderLines.forRow(orderId, itemRowId), .removeForRow(...), .history(supplierId),
 *   .lowStockSuggestions(supplierId), .unitOf(line), .itemOf(line)
 * suppliers.ORDER, suppliers.sorted()
 * orders.workRows(), orders.isOpen(o)
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var S = Gallery.store;
  var data = Gallery.data;

  /* ---------------------------------------------------------------------------
   * צריכת חומר (C17)
   * היקף המלבן (רוחב + גובה) × 2, כמו במלאי, ועוד פחת קבוע לחיתוכי 45° בפינות.
   * הפחת (20 ס"מ) הוא הנחת עבודה עד אימות מול אסף.
   * ------------------------------------------------------------------------- */
  var frames = data.frames;
  frames.WASTE_CM = 20;
  frames.ROD_CM = 290;

  frames.neededCm = function (w, h) {
    var base = (Number(w || 0) + Number(h || 0)) * 2;
    return base > 0 ? base + frames.WASTE_CM : 0;
  };

  /* כמה מוטות להזמין כדי לכסות את מה שחסר לתמונה הזו (לפחות 1) */
  frames.suggestRods = function (frame, neededCm) {
    var rod = Number(frame && frame.rodLengthCm) || frames.ROD_CM;
    var stock = Number(frame && frame.stockUnits) || 0;
    var missing = Number(neededCm || 0) - stock;
    return Math.max(1, Math.ceil(missing / rod));
  };

  frames.label = function (f) {
    if (!f) return '';
    return [f.woodType, f.color].filter(Boolean).join(' ');
  };

  /* ---------------------------------------------------------------------------
   * ספקים: סדר קבוע כמו העמודות בדף הידני (C23)
   * ------------------------------------------------------------------------- */
  data.suppliers.ORDER = ['sup-avraham', 'sup-silver', 'sup-yoni'];
  data.suppliers.sorted = function () {
    var order = data.suppliers.ORDER;
    return S.all('suppliers').sort(function (a, b) {
      var ia = order.indexOf(a.id), ib = order.indexOf(b.id);
      if (ia === -1) ia = 99;
      if (ib === -1) ib = 99;
      if (ia !== ib) return ia - ib;
      return String(a.name || '').localeCompare(String(b.name || ''), 'he');
    });
  };

  /* ---------------------------------------------------------------------------
   * שורות הזמנה לספק
   * ------------------------------------------------------------------------- */
  var lines = data.supplierOrderLines;

  /* השורה הפתוחה (לא נשלחה) שנוצרה מ-X בשורת תמונה מסוימת */
  lines.forRow = function (orderId, itemRowId) {
    return S.all('supplierOrderLines').filter(function (x) {
      return !x.sentAt && x.source === 'worktable' && x.orderId === orderId && (x.itemRowId || null) === (itemRowId || null);
    })[0] || null;
  };

  /* השורה האחרונה לשורת התמונה, כולל כאלה שכבר נשלחו (להצגה בטבלת העבודה) */
  lines.lastForRow = function (orderId, itemRowId) {
    return lines.forRow(orderId, itemRowId) || S.all('supplierOrderLines').filter(function (x) {
      return x.source === 'worktable' && x.orderId === orderId && (x.itemRowId || null) === (itemRowId || null);
    }).sort(function (a, b) { return String(b.sentAt || '').localeCompare(String(a.sentAt || '')); })[0] || null;
  };

  /* V על החומר: מוחק את השורה הפתוחה מהרשימה (אם לא נשלחה עדיין). מחזיר את השורה שנמחקה או null */
  lines.removeForRow = function (orderId, itemRowId) {
    return S.ready.then(function () {
      var l = lines.forRow(orderId, itemRowId);
      if (!l) return null;
      S.del('supplierOrderLines', l.id);
      return l;
    });
  };

  /* שורות שנשלחו, החדשות קודם */
  lines.history = function (supplierId) {
    return S.all('supplierOrderLines').filter(function (x) {
      return !!x.sentAt && (!supplierId || x.supplierId === supplierId);
    }).sort(function (a, b) { return String(b.sentAt).localeCompare(String(a.sentAt)); });
  };

  lines.itemOf = function (l) {
    if (!l || !l.itemId) return null;
    return l.itemType === 'raw' ? S.find('rawMaterials', l.itemId) : S.find('frames', l.itemId);
  };

  /* יחידה להצגה: מוטות למסגרות, היחידה של חומר הגלם (או "יח'") */
  lines.unitOf = function (l) {
    if (l.itemType === 'frame') return 'מוטות';
    var r = lines.itemOf(l);
    return (r && r.unit) || "יח'";
  };
  lines.qtyOf = function (l) {
    return Number(l.itemType === 'frame' ? l.qtyRods : l.qty) || 0;
  };

  /* מלאי נמוך של הספק שעדיין אין לו שורה פתוחה. כמות מוצעת: חזרה לפי 2 מהסף. */
  lines.lowStockSuggestions = function (supplierId) {
    var pending = lines.pending(supplierId);
    function has(type, id) { return pending.some(function (x) { return x.itemType === type && x.itemId === id; }); }
    var out = [];
    frames.lowStock().forEach(function (f) {
      if (f.supplierId !== supplierId || has('frame', f.id)) return;
      var rod = Number(f.rodLengthCm) || frames.ROD_CM;
      var need = Number(f.minThreshold || 0) * 2 - Number(f.stockUnits || 0);
      out.push({ itemType: 'frame', itemId: f.id, label: (f.sku + ' ' + frames.label(f)).trim(),
        qty: Math.max(1, Math.ceil(need / rod)), unit: 'מוטות',
        why: 'נשאר ' + frames.remainingMeters(f) + " מ', הסף " + (Number(f.minThreshold || 0) / 100) + " מ'" });
    });
    data.rawMaterials.lowStock().forEach(function (r) {
      if (r.supplierId !== supplierId || has('raw', r.id)) return;
      out.push({ itemType: 'raw', itemId: r.id, label: r.name,
        qty: Math.max(1, Number(r.minQty || 0) * 2 - Number(r.qty || 0)), unit: r.unit || "יח'",
        why: 'נשארו ' + Number(r.qty || 0) + ', הסף ' + Number(r.minQty || 0) });
    });
    return out;
  };

  /* ---------------------------------------------------------------------------
   * טבלת עבודה (C16): הזמנות פתוחות = כל מה שלא נמסר. ממוינות לפי מספר.
   * ------------------------------------------------------------------------- */
  var orders = data.orders;
  orders.isOpen = function (o) { return !!o && o.status !== 'delivered'; };
  orders.workRows = function () {
    return S.all('orders').filter(orders.isOpen).sort(function (a, b) { return Number(a.number) - Number(b.number); });
  };

})(window);
