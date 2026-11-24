/* =============================================================================
 * reminder-popup.js  -  תזכורת "קופצת" (סבב 4, B6). נטען בשני התפקידים.
 * -----------------------------------------------------------------------------
 * כשתזכורת נדלקת (כלל עבר את הסף, הערת "ליצור קשר" חדשה, הזמנה שעברה לתקועה, איחור חדש)
 * קופץ באנר: "תזכורת: הזמנה 1012, 3 ימים למועד המסירה" + "פתח" / "הבנתי".
 * סבב 5: הבאנר לא מכסה תוכן. בלי מודל: למטה במרכז, מעל הבר התחתון (ובמסך רחב בתחתית).
 *   כשמודל פתוח: הבאנר עובר לתוך שכבת המודל, מתחת למודל (בזרימה, לא מעליו).
 *   באנר אחד בכל פעם. הבא בתור מופיע אחרי "הבנתי" / "פתח" ("עוד N בתור").
 * - כל תזכורת קופצת פעם אחת למכשיר (localStorage: gallery:dev:reminderSeen).
 * - בדיקה בטעינה, כל דקה, ובכל שינוי בהזמנות או בכללים.
 * - יותר מ-3 חדשות בבת אחת = באנר מסכם אחד שמוביל לטאב התזכורות.
 * - הערת "ליצור קשר" / "תקועה" שנוצרו במכשיר הזה לא קופצות בו (מי שסימן כבר יודע).
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

  /* מפתח יציב לכל תזכורת: ruleId:orderId:<מועד ההפעלה>, flag:orderId:<since> (ליצור קשר / תקועה,
     אותו מפתח כמו הדגל הישן כדי שמה שכבר נראה לא יקפוץ שוב אחרי המיגרציה), overdue:orderId:<מועד> */
  function keyOf(r, o) {
    if (r.kind === 'contact') return 'flag:' + o.id + ':' + (o.contact && o.contact.since || '');
    if (r.kind === 'stuck') return 'flag:' + o.id + ':' + (o.stuck && o.stuck.since || '');
    if (r.kind === 'overdue') return 'overdue:' + o.id + ':' + dayKey(o.dueDate);
    return r.ruleId + ':' + o.id + ':' + String(r.since || '').slice(0, 16);
  }

  function textOf(r, o) {
    var safe = D.reminders.safeText;
    if (r.kind === 'contact') return 'ליצור קשר עם הלקוח' + (r.text ? ': ' + safe(r.text) : '');
    if (r.kind === 'stuck') return 'תקועה' + (r.text ? ': ' + safe(r.text) : '');
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

  /* ---- מיקום: בלי מודל = קבוע למטה. עם מודל = בתוך שכבת המודל, מתחת למודל ---- */
  var queueList = [];
  function backdrop() {
    var all = document.querySelectorAll('.modal-backdrop');
    return all.length ? all[all.length - 1] : null;
  }
  function placeHost() {
    if (!host) return;
    var bd = backdrop();
    if (bd && host.childNodes.length) {
      if (host.parentNode !== bd) { bd.appendChild(host); }
      bd.classList.add('has-rem-pop');
      host.classList.add('rem-pop-host--inmodal');
    } else {
      if (host.parentNode !== document.body) document.body.appendChild(host);
      host.classList.remove('rem-pop-host--inmodal');
    }
    var h = (!host.classList.contains('rem-pop-host--inmodal') && host.childNodes.length) ? host.offsetHeight : 0;
    document.documentElement.style.setProperty('--rem-pop-h', h + 'px');
    document.body.classList.toggle('has-rem-pop', h > 0);
  }

  function ensureHost() {
    if (host) { if (!host.parentNode) placeHost(); return host; }
    host = document.createElement('div');
    host.className = 'rem-pop-host';
    host.setAttribute('aria-live', 'assertive');
    document.body.appendChild(host);
    host.addEventListener('click', onHostClick);
    /* מודל נפתח / נסגר: מזיזים את הבאנר (וכשהשכבה נמחקת, מחזירים אותו ל-body) */
    try {
      new MutationObserver(function () { placeHost(); }).observe(document.body, { childList: true });
    } catch (e) {}
    return host;
  }

  function bannerHTML(p, more) {
    return '<div class="rem-pop rem-pop--' + esc(p.level || 'blue') + '" role="alert" data-pop' + (p.orderId ? ' data-order="' + esc(p.orderId) + '"' : '') + '>' +
      '<span class="rem-pop__icon">' + (I.reminders || I.clock || '') + '</span>' +
      '<div class="rem-pop__text">' + esc(p.text) + (more ? '<small class="rem-pop__more">עוד ' + more + ' בתור</small>' : '') + '</div>' +
      '<div class="rem-pop__acts">' +
        '<button type="button" class="btn btn--primary rem-pop__open" data-pop-open>פתח</button>' +
        '<button type="button" class="btn btn--secondary rem-pop__ok" data-pop-ok>הבנתי</button>' +
      '</div></div>';
  }

  /* מקסימום באנר אחד על המסך */
  function renderQueue() {
    var h = ensureHost();
    h.innerHTML = queueList.length ? bannerHTML(queueList[0], queueList.length - 1) : '';
    placeHost();
  }

  function show(list) {
    if (!list.length) return;
    var items = list.map(function (p) { return { text: p.text, level: p.level, orderId: p.order.id }; });
    items.forEach(function (p) {
      queueList = queueList.filter(function (q) { return !(q.orderId && q.orderId === p.orderId); });
      queueList.push(p);
    });
    if (queueList.length > MAX_SINGLE) {
      queueList = [{ text: 'יש ' + queueList.length + ' תזכורות חדשות. כדאי להציץ בטאב התזכורות.', level: queueList.some(function (p) { return p.level === 'red'; }) ? 'red' : 'orange' }];
    }
    renderQueue();
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
    e.stopPropagation();
    var orderId = pop.getAttribute('data-order');
    if (e.target.closest('[data-pop-open]')) {
      queueList.shift(); renderQueue();
      if (orderId && D.orders.peekOne(orderId) && Gallery.role === 'admin') { Gallery.openOrder(orderId); return; }
      if (Gallery.hasView('reminders')) Gallery.switchTab('reminders');
      if (orderId && Gallery.role === 'workshop') Gallery.openOrder(orderId);
      return;
    }
    if (e.target.closest('[data-pop-ok]')) { queueList.shift(); renderQueue(); }
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

  /* הערת "ליצור קשר" / "תקועה" שנוצרו במכשיר הזה: מסמנים כנראו, כדי שלא יקפצו למי שסימן */
  var origSetContact = D.orders.setContact;
  D.orders.setContact = function () {
    return origSetContact.apply(this, arguments).then(function (o) {
      if (o && o.contact && !o.contact.resolvedAt) markSeen(['flag:' + o.id + ':' + (o.contact.since || '')]);
      return o;
    });
  };
  var origSetStatus = D.orders.setStatus;
  D.orders.setStatus = function () {
    return origSetStatus.apply(this, arguments).then(function (o) {
      if (o && o.status === 'stuck' && o.stuck) markSeen(['flag:' + o.id + ':' + (o.stuck.since || '')]);
      return o;
    });
  };

  Gallery.reminderPopup = { check: check, pending: pending, seen: seenMap, queue: function () { return queueList.slice(); },
    clear: function () { queueList = []; if (host) renderQueue(); }, reset: function () { S.deviceSet(SEEN_KEY, '{}'); } };

  Gallery.onReady(function () {
    started = true;
    queue();
    global.setInterval(check, 60000);
    D.orders.subscribe(queue);
    D.reminderRules.subscribe(queue);
  });

})(window);
