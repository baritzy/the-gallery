/* =============================================================================
 * reminder-popup.js  -  תזכורת "קופצת" (סבב 4, B6). נטען בשני התפקידים.
 * -----------------------------------------------------------------------------
 * כשתזכורת נדלקת (כלל עבר את הסף, דגל חדש, איחור חדש) קופץ באנר בראש המסך,
 * בכל טאב שפתוח: "תזכורת: הזמנה 1012, 3 ימים למועד המסירה" + "פתח" / "הבנתי".
 * - כל תזכורת קופצת פעם אחת למכשיר (localStorage: gallery:dev:reminderSeen).
 * - בדיקה בטעינה, כל דקה, ובכל שינוי בהזמנות או בכללים.
 * - יותר מ-3 חדשות בבת אחת = באנר מסכם אחד שמוביל לטאב התזכורות.
 * - דגל שסומן במכשיר הזה לא קופץ בו (מי שסימן כבר יודע).
 * - Notification API: רק אם כבר יש הרשאה והחלון ברקע. לא מבקשים הרשאה.
 * - תגובת לקוח (reason 'response') לא קופצת, רק מוצגת.
 * בסדנה: בלי טלפונים ובלי סכומים (reminders.safeText).
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var D = Gallery.data;
  var S = Gallery.store;
  var esc = U.esc;

  var SEEN_KEY = 'reminderSeen';
  var KEEP_MS = 60 * 86400000;
  var MAX_SINGLE = 3;
  var host = null, timer = null, started = false;

  function seenMap() {
    try { return JSON.parse(S.deviceGet(SEEN_KEY) || '{}') || {}; } catch (e) { return {}; }
  }
  function saveSeen(m) {
    var now = Date.now();
    Object.keys(m).forEach(function (k) { if (now - Number(m[k] || 0) > KEEP_MS) delete m[k]; });
    S.deviceSet(SEEN_KEY, JSON.stringify(m));
  }
  function markSeen(keys) {
    if (!keys.length) return;
    var m = seenMap(), now = Date.now();
    keys.forEach(function (k) { m[k] = now; });
    saveSeen(m);
  }

  function dayKey(iso) { var d = new Date(iso); return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }

  /* מפתח יציב לכל תזכורת: ruleId:orderId:<מועד ההפעלה>, flag:orderId:<since>, overdue:orderId:<מועד> */
  function keyOf(r, o) {
    if (r.kind === 'flag') return 'flag:' + o.id + ':' + (o.blocked && o.blocked.since || '');
    if (r.kind === 'overdue') return 'overdue:' + o.id + ':' + dayKey(o.dueDate);
    return r.ruleId + ':' + o.id + ':' + String(r.since || '').slice(0, 16);
  }

  function textOf(r, o) {
    var safe = D.reminders.safeText;
    if (r.kind === 'flag') return (U.BLOCK_KIND_LABEL[r.flagKind] || 'דגל אדום') + (r.text ? ': ' + safe(r.text) : '');
    if (r.kind === 'overdue') return safe(r.text);
    var rule = D.reminderRules.peekOne(r.ruleId);
    if (rule && rule.anchor === 'due' && Number(rule.offset && rule.offset.value || 0) <= 0 && o.dueDate) {
      var n = U.daysUntil(o.dueDate);
      if (n === 0) return 'היום מועד המסירה';
      if (n === 1) return 'מחר מועד המסירה';
      if (n > 1) return n + ' ימים למועד המסירה';
    }
    return safe(r.text);
  }

  function pending() {
    var seen = seenMap(), out = [];
    D.reminders.compute().forEach(function (c) {
      c.reasons.forEach(function (r) {
        if (r.kind === 'response') return;
        var k = keyOf(r, c.order);
        if (seen[k]) return;
        out.push({ key: k, order: c.order, level: r.level, text: 'תזכורת: הזמנה ' + c.order.number + ', ' + textOf(r, c.order) });
      });
    });
    return out;
  }

  function ensureHost() {
    if (host && document.body.contains(host)) return host;
    host = document.createElement('div');
    host.className = 'rem-pop-host';
    host.setAttribute('aria-live', 'assertive');
    document.body.appendChild(host);
    host.addEventListener('click', onHostClick);
    return host;
  }

  function bannerHTML(p) {
    return '<div class="rem-pop rem-pop--' + esc(p.level || 'blue') + '" role="alert" data-pop' + (p.orderId ? ' data-order="' + esc(p.orderId) + '"' : '') + '>' +
      '<span class="rem-pop__icon">' + (I.reminders || I.clock || '') + '</span>' +
      '<div class="rem-pop__text">' + esc(p.text) + '</div>' +
      '<div class="rem-pop__acts">' +
        '<button type="button" class="btn btn--primary rem-pop__open" data-pop-open>פתח</button>' +
        '<button type="button" class="btn btn--secondary rem-pop__ok" data-pop-ok>הבנתי</button>' +
      '</div></div>';
  }

  function show(list) {
    if (!list.length) return;
    var h = ensureHost();
    var items;
    if (list.length > MAX_SINGLE) {
      items = [{ text: 'יש ' + list.length + ' תזכורות חדשות. כדאי להציץ בטאב התזכורות.', level: list.some(function (p) { return p.level === 'red'; }) ? 'red' : 'orange' }];
    } else {
      items = list.map(function (p) { return { text: p.text, level: p.level, orderId: p.order.id }; });
    }
    items.forEach(function (p) {
      if (p.orderId && h.querySelector('[data-order="' + p.orderId + '"]')) {
        var old = h.querySelector('[data-order="' + p.orderId + '"]');
        old.parentNode.removeChild(old);
      }
      h.insertAdjacentHTML('beforeend', bannerHTML(p));
    });
    markSeen(list.map(function (p) { return p.key; }));
    notify(items);
  }

  function notify(items) {
    try {
      if (!('Notification' in global) || global.Notification.permission !== 'granted' || !document.hidden) return;
      items.forEach(function (p) { new global.Notification('הגלריה', { body: p.text, tag: 'gallery-' + (p.orderId || 'sum'), lang: 'he', dir: 'rtl' }); });
    } catch (e) {}
  }

  function onHostClick(e) {
    var pop = e.target.closest('[data-pop]');
    if (!pop) return;
    var orderId = pop.getAttribute('data-order');
    if (e.target.closest('[data-pop-open]')) {
      pop.parentNode.removeChild(pop);
      if (orderId && D.orders.peekOne(orderId) && Gallery.role === 'admin') { Gallery.openOrder(orderId); return; }
      if (Gallery.hasView('reminders')) Gallery.switchTab('reminders');
      if (orderId && Gallery.role === 'workshop') Gallery.openOrder(orderId);
      return;
    }
    if (e.target.closest('[data-pop-ok]')) pop.parentNode.removeChild(pop);
  }

  function check() {
    timer = null;
    if (!started || !D.reminders) return;
    try { show(pending()); } catch (err) { if (global.console) global.console.error('[gallery] reminder popup', err); }
  }
  function queue() {
    if (timer) return;
    timer = global.setTimeout(check, 600);
  }

  /* דגל שסומן במכשיר הזה: מסמנים כנראה, כדי שלא יקפוץ למי שסימן אותו */
  var origSetBlocked = D.orders.setBlocked;
  D.orders.setBlocked = function () {
    return origSetBlocked.apply(this, arguments).then(function (o) {
      if (o && o.blocked && !o.blocked.resolvedAt) markSeen(['flag:' + o.id + ':' + (o.blocked.since || '')]);
      return o;
    });
  };

  Gallery.reminderPopup = { check: check, pending: pending, seen: seenMap, reset: function () { S.deviceSet(SEEN_KEY, '{}'); } };

  Gallery.onReady(function () {
    started = true;
    queue();
    global.setInterval(check, 60000);
    D.orders.subscribe(queue);
    D.reminderRules.subscribe(queue);
  });

})(window);
