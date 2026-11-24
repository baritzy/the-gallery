/* =============================================================================
 * data-ext-reminders.js  -  הרחבות נתונים של agent C (wave 3)
 * OWNER: agent C. לא נוגעים ב-js/data/*.js. נטען אחרי js/data/*.js ולפני app.js.
 * -----------------------------------------------------------------------------
 * Gallery.data.reminders.compute(now?) -> [card]
 *   כרטיס אחד לכל הזמנה שדורשת תשומת לב (C26 עד C28):
 *   { id:'order:<orderId>', orderId, order, level:'red'|'orange'|'blue', rank,
 *     reasons:[{ kind:'contact'|'stuck'|'overdue'|'rule'|'response', ruleId?, text, since:ISO, level }],
 *     since:ISO (הסיבה הראשית), contact:boolean, stuck:boolean, flag (= contact, תאימות) }
 *   מקורות (סבב 5): הערת "ליצור קשר עם הלקוח" פעילה, סטטוס "תקועה", איחור במועד מסירה,
 *   וכללי reminderRules פעילים.
 * Gallery.data.reminderRules.describe(rule) -> טקסט קריא לכלל.
 * Gallery.data.reminders.sortWithOrder(cards, ids) -> סדר ידני (C26).
 * סבב 4 (B2): סיבה מסוג 'response' = תגובת הלקוח לדגל שנפתר, עד שההזמנה מוכנה
 *   או שהוסתרה במכשיר הזה (orders.hideResponse). לא קופצת (B6), רק מוצגת.
 * Gallery.data.orders.responseHidden(o) / hideResponse(o): הסתרה לפי מכשיר (localStorage).
 * Gallery.data.reminders.safeText(text): בסדנה מסתיר טלפונים וסכומים (B2 / B6).
 * ========================================================================== */

(function (global) {
  'use strict';
  var Gallery = global.Gallery;
  var data = Gallery.data;
  var S = Gallery.store;
  var DAY = 86400000;

  var STATUS_TXT = { 'new': 'חדשה', in_progress: 'בעבודה', stuck: 'תקועה', open: 'פתוחה (חדשה, בעבודה או תקועה)', ready: 'מוכנה שלא נאספה' };
  var LEVEL_RANK = { red: 0, orange: 1, blue: 2 };

  function isStuck(o) { return !!(o && o.status === 'stuck'); }
  function hasContact(o) { return !!(o && o.contact && !o.contact.resolvedAt); }
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function shortDate(iso) { var d = new Date(iso); return p2(d.getDate()) + '.' + p2(d.getMonth() + 1); }

  /* תיאור קריא לכלל: "בעבודה · 3 ימים לפני מועד המסירה" */
  data.reminderRules.describe = function (r) {
    if (!r) return '';
    var v = Math.abs(Number(r.offset && r.offset.value || 0));
    var unit = r.offset && r.offset.unit === 'hours' ? (v === 1 ? 'שעה' : v + ' שעות') : (v === 1 ? 'יום' : v + ' ימים');
    var when;
    if (r.anchor === 'due') when = (Number(r.offset && r.offset.value || 0) < 0 ? unit + ' לפני' : unit + ' אחרי') + ' מועד המסירה';
    else when = unit + ' מיום הקבלה';
    return (STATUS_TXT[r.status] || '') + ' · ' + when;
  };
  data.reminderRules.STATUS_TXT = STATUS_TXT;

  /* רמת דחיפות לכלל: לפני מסירה = כתום, מוכנה שלא נאספה = כתום, השאר = כחול */
  function ruleLevel(r) {
    if (r.anchor === 'due') return 'orange';
    return 'blue';
  }

  /* ---- B2: הסתרת תגובה לפי מכשיר. המפתח = orderId, הערך = resolvedAt של התגובה ---- */
  var RESP_KEY = 'respHidden';
  function hiddenMap() {
    try { return JSON.parse(S.deviceGet(RESP_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  data.orders.responseHidden = function (o) {
    var r = data.orders.lastResponse(o);
    return !!r && hiddenMap()[o.id] === r.resolvedAt;
  };
  data.orders.hideResponse = function (o) {
    var r = data.orders.lastResponse(o);
    if (!r) return;
    var m = hiddenMap();
    m[o.id] = r.resolvedAt;
    S.deviceSet(RESP_KEY, JSON.stringify(m));
    try { global.dispatchEvent(new CustomEvent('gallery:resp-hidden', { detail: { orderId: o.id } })); } catch (e) {}
  };
  /* תגובה להצגה: קיימת, ההזמנה עוד לא מוכנה, ולא הוסתרה במכשיר הזה */
  data.orders.visibleResponse = function (o) {
    if (!o || o.status === 'ready' || o.status === 'delivered') return null;
    if (data.orders.responseHidden(o)) return null;
    return data.orders.lastResponse(o);
  };

  /* בסדנה: בלי טלפונים ובלי סכומים בטקסט חופשי */
  function safeText(t) {
    t = String(t == null ? '' : t);
    if (Gallery.role === 'admin') return t;
    return t.replace(/₪\s*[\d.,]+|[\d.,]+\s*₪|₪/g, '...').replace(/\+?\d[\d\s-]{6,}\d/g, '...');
  }

  function compute(now) {
    now = now || Date.now();
    var rules = S.all('reminderRules').filter(function (r) { return r.active; });
    var out = [];
    S.all('orders').forEach(function (o) {
      if (o.status === 'delivered') return;
      var reasons = [];
      /* סבב 5: "תקועה" (סטטוס) ו"ליצור קשר עם הלקוח" (הערה פעילה) במקום הדגל האדום */
      if (hasContact(o)) {
        reasons.push({ kind: 'contact', text: o.contact.text || '', since: o.contact.since || o.updatedAt, level: 'red' });
      }
      if (isStuck(o)) {
        reasons.push({ kind: 'stuck', text: (o.stuck && o.stuck.reason) || '', since: (o.stuck && o.stuck.since) || o.updatedAt, level: 'red' });
      }
      var overdue = false;
      if ((o.status === 'new' || o.status === 'in_progress' || o.status === 'stuck') && o.dueDate && startOfDay(o.dueDate).getTime() < startOfDay(now).getTime()) {
        overdue = true;
        var late = Math.round((startOfDay(now) - startOfDay(o.dueDate)) / DAY);
        reasons.push({ kind: 'overdue', text: 'באיחור ' + (late === 1 ? 'יום' : late + ' ימים') + ' ממועד המסירה (' + shortDate(o.dueDate) + ')', since: o.dueDate, level: 'red' });
      }
      rules.forEach(function (r) {
        if (!data.reminderRules.matches(r, o, now)) return;
        /* באיחור מכסה כללים של "לפני מועד המסירה" */
        if (overdue && r.anchor === 'due' && Number(r.offset && r.offset.value || 0) <= 0) return;
        var at = data.reminderRules.fireAt(r, o);
        reasons.push({ kind: 'rule', ruleId: r.id, text: r.label || data.reminderRules.describe(r), since: at ? at.toISOString() : o.createdAt, level: ruleLevel(r) });
      });
      var resp = data.orders.visibleResponse(o);
      if (resp) {
        reasons.push({ kind: 'response', text: 'תגובת הלקוח (' + shortDate(resp.resolvedAt) + '): ' + safeText(resp.response), since: resp.resolvedAt, level: 'blue' });
      }
      if (!reasons.length) return;
      reasons.sort(function (a, b) { return LEVEL_RANK[a.level] - LEVEL_RANK[b.level] || new Date(a.since) - new Date(b.since); });
      var main = reasons[0];
      out.push({
        id: 'order:' + o.id, orderId: o.id, order: o, level: main.level, rank: LEVEL_RANK[main.level],
        reasons: reasons, since: main.since, flag: hasContact(o), contact: hasContact(o), stuck: isStuck(o)
      });
    });
    /* ברירת מחדל: לפי דחיפות, ואז הוותיק ביותר קודם */
    out.sort(function (a, b) { return a.rank - b.rank || new Date(a.since) - new Date(b.since); });
    return out;
  }

  /* C26: סדר ידני. כרטיסים שלא סודרו (חדשים) מופיעים למעלה לפי דחיפות, ואז הסדר הידני. */
  function sortWithOrder(cards, ids) {
    ids = ids || [];
    var pos = {};
    ids.forEach(function (id, i) { pos[id] = i; });
    var fresh = cards.filter(function (c) { return pos[c.id] == null; });
    var placed = cards.filter(function (c) { return pos[c.id] != null; })
      .sort(function (a, b) { return pos[a.id] - pos[b.id]; });
    return fresh.concat(placed);
  }

  data.reminders = { compute: compute, sortWithOrder: sortWithOrder, safeText: safeText, LEVEL_RANK: LEVEL_RANK };
})(window);
