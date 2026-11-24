/* =============================================================================
 * reminders.js  -  תזכורות ותיעדוף (C26, C27, C28). נטען גם ב-admin וגם ב-workshop.
 * OWNER: agent C (wave 3). חוזה: P-projects/The-Gallery/context/v2-contract.md
 * -----------------------------------------------------------------------------
 * - רשימה אחת: כרטיס לכל הזמנה שדורשת תשומת לב (דגל, איחור, כללי תזכורת).
 *   הנתונים: Gallery.data.reminders.compute() (data-ext-reminders.js).
 * - סדר ידני (C26 / D7): ידית גרירה ב-pointer events (עובד באייפד) + חצים.
 *   נשמר ב-Gallery.data.reminderOrder.
 * - "הגדרות תזכורות" (C27): הוספה, עריכה, מחיקה והפעלה של כללים.
 * - דגל "ליצור קשר עם הלקוח" (C28): מחליף את Gallery.openBlockedFlag (אותה חתימה),
 *   תגובת לקוח חובה בהסרה, ובחנות כפתור התקשר / וואטסאפ.
 * בסדנה: בלי כסף, בלי שמות לקוחות ובלי טלפונים.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var D = Gallery.data;
  var esc = U.esc;
  var ADMIN = Gallery.role === 'admin';

  var ARROW_UP = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 15 6-6 6 6"/></svg>';
  var ARROW_DOWN = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
  var PHONE = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>';

  var LEVEL_TXT = { red: 'דחוף', orange: 'בקרוב', blue: 'לתשומת לב' };

  var root = null, listEl = null, countEl = null;
  var orderIds = [];
  var drag = null, pendingRender = false;

  /* ------------------------------------------------------------------ עזרים */
  function ageText(iso) {
    if (!iso) return '';
    var ms = Date.now() - new Date(iso).getTime();
    if (ms < 0) return '';
    var h = Math.floor(ms / 3600000);
    if (h < 1) return 'עכשיו';
    if (h < 24) return 'מזה ' + (h === 1 ? 'שעה' : h + ' שעות');
    var d = Math.floor(h / 24);
    return 'מזה ' + (d === 1 ? 'יום' : d + ' ימים');
  }
  function reasonText(r) {
    if (r.kind === 'flag') return (U.BLOCK_KIND_LABEL[r.flagKind] || 'תקועה') + (r.text ? ': ' + r.text : '');
    return r.text;
  }
  function customerOf(o) { return ADMIN && D.customers ? (D.customers.peekOne(o.customerId) || {}) : {}; }
  function followupMsg(o) {
    var c = customerOf(o), s = D.settings.peek().shop;
    if (o.status === 'ready') return U.msgReady(o);
    if (U.isBlocked(o) && o.blocked.kind === 'contact_client') {
      return 'שלום ' + (c.name || '') + ', כאן ' + (s.name || 'הגלריה') + '. רצינו לדבר איתך לגבי ההזמנה שלך (מס\' ' + o.number + '). ' +
        'אפשר לחזור אלינו או לקפוץ לחנות? תודה. ' + (s.phone || '');
    }
    return 'שלום ' + (c.name || '') + ', כאן ' + (s.name || 'הגלריה') + '. עדכון קטן על ההזמנה שלך (מס\' ' + o.number + '): ' +
      'היא בעבודה ומתעכבת מעט, סליחה על ההמתנה. נעדכן ברגע שתהיה מוכנה. תודה על הסבלנות.';
  }

  /* ------------------------------------------------------------------ mount */
  function mount(el) {
    root = el;
    el.innerHTML =
      '<div class="view__head">' +
        '<div><h1 class="view__title">תזכורות <span class="rem-count" data-count></span></h1>' +
        '<p class="view__subtitle">מה דורש טיפול. אפשר לסדר לפי העדיפות שלכם: לגרור מהידית או ללחוץ על החצים.</p></div>' +
        '<div class="rem-head-actions">' +
          '<button class="btn btn--ghost" data-reset>סדר לפי דחיפות</button>' +
          '<button class="btn btn--secondary btn--lg" data-rules>' + I.gear + 'הגדרות תזכורות</button>' +
        '</div>' +
      '</div>' +
      '<div class="rem-list" data-list role="list"></div>';
    listEl = el.querySelector('[data-list]');
    countEl = el.querySelector('[data-count]');
    el.addEventListener('click', onClick);
    listEl.addEventListener('pointerdown', onPointerDown);

    D.orders.subscribe(render);
    D.reminderRules.subscribe(render);
    if (ADMIN) D.customers.subscribe(render);
    D.reminderOrder.subscribe(function (ids) { orderIds = ids || []; render(); });
    global.addEventListener('gallery:resp-hidden', render);
    global.setInterval(render, 5 * 60000); /* כללי זמן נדלקים גם בלי שינוי בנתונים */
  }

  function cards() { return D.reminders.sortWithOrder(D.reminders.compute(), orderIds); }

  /* ------------------------------------------------------------------ render */
  function render() {
    if (!listEl) return;
    if (drag) { pendingRender = true; return; }
    var list = cards();
    countEl.textContent = list.length ? String(list.length) : '';
    Gallery.updateBadge('reminders', list.length);
    if (!list.length) {
      listEl.innerHTML = '<div class="empty"><h3>אין תזכורות פעילות</h3><p>כל העבודות בזמן. כללים חדשים אפשר להוסיף ב"הגדרות תזכורות".</p></div>';
      return;
    }
    listEl.innerHTML = list.map(function (c, i) { return cardHTML(c, i, list.length); }).join('');
  }

  function cardHTML(c, i, n) {
    var o = c.order, look = U.orderLook(o), main = c.reasons[0];
    var more = c.reasons.slice(1).map(function (r) {
      return '<li class="rem-item__more rem-lv-' + r.level + (r.kind === 'response' ? ' rem-resp' : '') + '">' + esc(reasonText(r)) + '</li>';
    }).join('');
    var hasResp = c.reasons.some(function (r) { return r.kind === 'response'; });
    var cust = '';
    if (ADMIN) {
      var cu = customerOf(o);
      if (cu.name) cust = '<span class="rem-item__cust">' + esc(cu.name) + '</span>';
    }
    var acts = [];
    if (c.flag) {
      acts.push('<button class="btn btn--primary" data-resolve="' + o.id + '">' + I.check +
        (o.blocked.kind === 'contact_client' ? 'תגובת הלקוח' : 'נפתר') + '</button>');
    } else {
      acts.push('<button class="btn btn--warn" data-contact="' + o.id + '">' + I.flag + 'ליצור קשר עם הלקוח</button>');
    }
    if (hasResp) acts.push('<button class="btn btn--ghost" data-hide-resp="' + o.id + '">' + I.check + 'הבנתי, להסתיר את התגובה</button>');
    if (ADMIN) {
      var ph = customerOf(o).phone;
      if (ph) acts.push('<button class="btn btn--wa" data-wa="' + o.id + '">' + I.wa + 'וואטסאפ</button>' +
        '<a class="btn btn--secondary" href="tel:' + esc(String(ph).replace(/[^\d+]/g, '')) + '">' + PHONE + 'התקשר</a>');
      if (o.status === 'ready') acts.push('<button class="btn btn--secondary" data-delivered="' + o.id + '">' + I.check + 'נאספה</button>');
    }
    return '<div class="rem-item rem-lv-' + c.level + '" role="listitem" data-id="' + esc(c.id) + '">' +
      '<button type="button" class="rem-item__handle" data-drag aria-label="גרירה לשינוי הסדר" title="גרירה לשינוי הסדר">' + I.grip + '</button>' +
      '<div class="rem-item__body">' +
        '<div class="rem-item__top">' +
          '<button type="button" class="rem-item__num mono" data-open="' + o.id + '" title="פתח את ההזמנה">' + esc(o.number) + '</button>' +
          '<span class="pill is-' + U.STATUS_COLOR[o.status] + '">' + esc(U.STATUS_LABEL[o.status] || '') + '</span>' +
          '<span class="rem-item__level rem-lv-' + c.level + '">' + esc(LEVEL_TXT[c.level]) + '</span>' +
          '<span class="rem-item__age">' + esc(ageText(main.since)) + '</span>' + cust +
        '</div>' +
        '<div class="rem-item__reason' + (main.kind === 'response' ? ' rem-resp' : '') + '">' + (main.kind === 'flag' ? I.flag : '') + esc(reasonText(main)) + '</div>' +
        (more ? '<ul class="rem-item__mores">' + more + '</ul>' : '') +
        '<div class="rem-item__actions">' + acts.join('') + '</div>' +
      '</div>' +
      '<div class="rem-item__move">' +
        '<button type="button" class="rem-item__arrow" data-up aria-label="למעלה"' + (i === 0 ? ' disabled' : '') + '>' + ARROW_UP + '</button>' +
        '<button type="button" class="rem-item__arrow" data-down aria-label="למטה"' + (i === n - 1 ? ' disabled' : '') + '>' + ARROW_DOWN + '</button>' +
      '</div>' +
    '</div>';
  }

  /* ------------------------------------------------------------------ סדר ידני */
  function domIds() {
    return Array.prototype.map.call(listEl.querySelectorAll('.rem-item'), function (x) { return x.getAttribute('data-id'); });
  }
  function saveOrder(ids) { orderIds = ids.slice(); return D.reminderOrder.set(ids); }

  function move(id, delta) {
    var ids = cards().map(function (c) { return c.id; });
    var i = ids.indexOf(id), j = i + delta;
    if (i < 0 || j < 0 || j >= ids.length) return;
    ids.splice(j, 0, ids.splice(i, 1)[0]);
    saveOrder(ids);
  }

  /* גרירה ב-pointer events: הכרטיס נשאר בזרימה, מוחלף עם השכן כשעוברים את האמצע,
     ו-translateY מצמיד אותו לאצבע. עובד גם כשיש transform על אב קדמון. */
  function onPointerDown(e) {
    var h = e.target.closest('[data-drag]');
    if (!h || (e.button != null && e.button > 0)) return;
    var card = h.closest('.rem-item');
    e.preventDefault();
    var r = card.getBoundingClientRect();
    drag = { card: card, handle: h, id: e.pointerId, grab: e.clientY - r.top, h: r.height, moved: false };
    card.classList.add('is-dragging');
    try { h.setPointerCapture(e.pointerId); } catch (err) {}
    h.addEventListener('pointermove', onPointerMove);
    h.addEventListener('pointerup', onPointerUp);
    h.addEventListener('pointercancel', onPointerUp);
  }
  function mid(el) { var r = el.getBoundingClientRect(); return r.top + r.height / 2; }
  function onPointerMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var card = drag.card;
    card.style.transform = '';
    var cy = e.clientY - drag.grab + drag.h / 2;
    var prev = card.previousElementSibling, next = card.nextElementSibling;
    if (prev && prev.classList.contains('rem-item') && cy < mid(prev)) { listEl.insertBefore(card, prev); drag.moved = true; }
    else if (next && next.classList.contains('rem-item') && cy > mid(next)) { listEl.insertBefore(next, card); drag.moved = true; }
    var natural = card.getBoundingClientRect().top;
    card.style.transform = 'translateY(' + (e.clientY - drag.grab - natural) + 'px)';
    if (e.clientY < 80) global.scrollBy(0, -14);
    else if (e.clientY > global.innerHeight - 80) global.scrollBy(0, 14);
  }
  function onPointerUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    var d = drag;
    d.handle.removeEventListener('pointermove', onPointerMove);
    d.handle.removeEventListener('pointerup', onPointerUp);
    d.handle.removeEventListener('pointercancel', onPointerUp);
    d.card.style.transform = '';
    d.card.classList.remove('is-dragging');
    drag = null;
    if (d.moved) { saveOrder(domIds()); Gallery.toast('הסדר נשמר'); }
    if (pendingRender || d.moved) { pendingRender = false; render(); }
  }

  /* ------------------------------------------------------------------ אירועים */
  function onClick(e) {
    var t = e.target, el;
    if (t.closest('[data-rules]')) { openRules(); return; }
    if (t.closest('[data-reset]')) { saveOrder([]); Gallery.toast('הסדר חזר לפי דחיפות'); return; }
    var card = t.closest('.rem-item');
    if (t.closest('[data-up]')) { move(card.getAttribute('data-id'), -1); return; }
    if (t.closest('[data-down]')) { move(card.getAttribute('data-id'), 1); return; }
    if ((el = t.closest('[data-open]'))) { Gallery.openOrder(el.getAttribute('data-open')); return; }
    if ((el = t.closest('[data-hide-resp]'))) {
      var ro = D.orders.peekOne(el.getAttribute('data-hide-resp'));
      if (ro) { D.orders.hideResponse(ro); Gallery.toast('התגובה הוסתרה במכשיר הזה'); }
      return;
    }
    if ((el = t.closest('[data-resolve]'))) { Gallery.openBlockedFlag(el.getAttribute('data-resolve')); return; }
    if ((el = t.closest('[data-contact]'))) { Gallery.openBlockedFlag(el.getAttribute('data-contact'), { kind: 'contact_client' }); return; }
    if ((el = t.closest('[data-wa]'))) {
      var o = D.orders.peekOne(el.getAttribute('data-wa'));
      if (o) Gallery.whatsapp(customerOf(o).phone, followupMsg(o));
      return;
    }
    if ((el = t.closest('[data-delivered]'))) { D.orders.setStatus(el.getAttribute('data-delivered'), 'delivered'); Gallery.toast('סומנה כנמסרה'); }
  }

  /* =========================================================================
   * C27: הגדרות תזכורות
   * ======================================================================= */
  var STATUS_OPTS = [['new', 'חדשה'], ['in_progress', 'בעבודה'], ['open', 'פתוחה'], ['ready', 'מוכנה שלא נאספה']];
  var ANCHOR_OPTS = [['created', 'מיום הקבלה'], ['due-before', 'לפני מועד המסירה'], ['due-after', 'אחרי מועד המסירה']];

  function openRules() {
    var node = Gallery.modalNode({ title: I.gear + 'הגדרות תזכורות', body: '<div data-rbody></div>', foot: '<div data-rfoot class="rem-rfoot"></div>' });
    node.classList.add('rem-rules');
    var bodyEl = node.querySelector('[data-rbody]'), footEl = node.querySelector('[data-rfoot]');
    var editing = null, unsub = null;

    function listView() {
      editing = null;
      var rules = D.reminderRules.peek();
      bodyEl.innerHTML = '<p class="rem-rules__note">כל כלל קובע מתי קופצת תזכורת על הזמנה. השינויים נכנסים לתוקף מיד.</p>' +
        (rules.length ? rules.map(function (r) {
          var cnt = D.orders.peek().filter(function (o) { return D.reminderRules.matches(r, o); }).length;
          return '<div class="rem-rule' + (r.active ? '' : ' is-off') + '" data-rid="' + esc(r.id) + '">' +
            '<label class="bigcheck" title="פעיל"><input type="checkbox" data-ractive' + (r.active ? ' checked' : '') + ' aria-label="כלל פעיל"><span></span></label>' +
            '<div class="rem-rule__txt"><b>' + esc(r.label || D.reminderRules.describe(r)) + '</b>' +
              '<small>' + esc(D.reminderRules.describe(r)) + (r.active ? ' · עכשיו על ' + (cnt === 1 ? 'הזמנה אחת' : cnt + ' הזמנות') : ' · כבוי') + '</small></div>' +
            '<button class="btn btn--secondary" data-redit>' + I.edit + 'עריכה</button>' +
            '<button class="iconbtn" data-rdel aria-label="מחיקת כלל" title="מחיקה">' + I.trash + '</button>' +
          '</div>';
        }).join('') : '<div class="empty"><p>אין כללים. אפשר להוסיף כלל חדש.</p></div>');
      footEl.innerHTML = '<button class="btn btn--primary btn--lg" data-radd>' + I.plus + 'הוסף כלל</button>' +
        '<button class="btn btn--ghost" data-close-rules>סגירה</button>';
    }

    function segHTML(name, opts, cur) {
      return '<div class="seg rem-seg" role="radiogroup" data-seg="' + name + '">' + opts.map(function (o) {
        return '<button type="button" role="radio" data-v="' + o[0] + '" aria-checked="' + (o[0] === cur) + '">' + esc(o[1]) + '</button>';
      }).join('') + '</div>';
    }

    function editView(rule) {
      var r = rule ? Gallery.store.clone(rule) : { label: '', status: 'open', anchor: 'due', offset: { value: -3, unit: 'days' }, active: true };
      editing = r;
      var v = Number(r.offset.value || 0);
      var anchor = r.anchor === 'due' ? (v < 0 ? 'due-before' : 'due-after') : 'created';
      bodyEl.innerHTML =
        '<div class="form-field"><label for="rr-label">שם הכלל</label>' +
          '<input id="rr-label" data-f="label" type="text" value="' + esc(r.label) + '" placeholder="למשל: 3 ימים לפני מסירה"></div>' +
        '<div class="rem-fld"><div class="rem-fld__k">לאיזה סטטוס</div>' + segHTML('status', STATUS_OPTS, r.status) + '</div>' +
        '<div class="rem-fld"><div class="rem-fld__k">מתי לספור</div>' + segHTML('anchor', ANCHOR_OPTS, anchor) + '</div>' +
        '<div class="rem-fld"><div class="rem-fld__k">כמה זמן</div><div class="rem-offset">' +
          '<input class="rem-offset__n" data-f="value" type="number" inputmode="numeric" min="0" step="1" value="' + Math.abs(v) + '" aria-label="כמות">' +
          segHTML('unit', [['hours', 'שעות'], ['days', 'ימים']], r.offset.unit) + '</div></div>' +
        '<label class="rem-active"><span class="bigcheck"><input type="checkbox" data-f="active"' + (r.active ? ' checked' : '') + '><span></span></span>כלל פעיל</label>' +
        '<p class="rem-preview" data-preview></p>';
      footEl.innerHTML = '<button class="btn btn--primary btn--lg" data-rsave>' + I.check + 'שמור</button>' +
        '<button class="btn btn--ghost" data-rback>ביטול</button>';
      preview();
    }

    function readForm() {
      var r = editing;
      var seg = function (n) { var b = bodyEl.querySelector('[data-seg="' + n + '"] [aria-checked="true"]'); return b ? b.getAttribute('data-v') : null; };
      var anchor = seg('anchor') || 'created';
      var n = Math.max(0, Math.round(Number(bodyEl.querySelector('[data-f="value"]').value) || 0));
      r.status = seg('status') || 'open';
      r.anchor = anchor === 'created' ? 'created' : 'due';
      r.offset = { value: anchor === 'due-before' ? -n : n, unit: seg('unit') || 'days' };
      r.active = bodyEl.querySelector('[data-f="active"]').checked;
      r.label = bodyEl.querySelector('[data-f="label"]').value.trim();
      return r;
    }
    function preview() {
      var r = readForm();
      var cnt = D.orders.peek().filter(function (o) { return D.reminderRules.matches(Object.assign({}, r, { active: true }), o); }).length;
      bodyEl.querySelector('[data-preview]').textContent = D.reminderRules.describe(r) + '. כרגע זה חל על ' + (cnt === 1 ? 'הזמנה אחת' : cnt + ' הזמנות') + '.';
    }

    node.addEventListener('click', function (e) {
      var t = e.target, row = t.closest('[data-rid]');
      var segBtn = t.closest('[data-seg] [data-v]');
      if (segBtn) {
        Array.prototype.forEach.call(segBtn.parentNode.children, function (b) { b.setAttribute('aria-checked', String(b === segBtn)); });
        preview(); return;
      }
      if (t.closest('[data-close-rules]')) { Gallery.closeModal(); return; }
      if (t.closest('[data-radd]')) { editView(null); return; }
      if (t.closest('[data-rback]')) { listView(); return; }
      if (row && t.closest('[data-redit]')) { editView(D.reminderRules.peekOne(row.getAttribute('data-rid'))); return; }
      if (row && t.closest('[data-rdel]')) {
        var rr = D.reminderRules.peekOne(row.getAttribute('data-rid'));
        if (rr) Gallery.deleteRecord({ collection: 'reminderRules', id: rr.id, label: 'הכלל "' + (rr.label || D.reminderRules.describe(rr)) + '"' });
        return;
      }
      if (t.closest('[data-rsave]')) {
        var r = readForm();
        if (!r.label) r.label = D.reminderRules.describe(r);
        D.reminderRules.save(r).then(function () { Gallery.toast('הכלל נשמר'); listView(); });
      }
    });
    node.addEventListener('change', function (e) {
      var cb = e.target.closest('[data-ractive]');
      if (cb) {
        var r = D.reminderRules.peekOne(cb.closest('[data-rid]').getAttribute('data-rid'));
        if (r) { r.active = cb.checked; D.reminderRules.save(r); }
        return;
      }
      if (editing) preview();
    });
    node.addEventListener('input', function () { if (editing) preview(); });

    listView();
    unsub = D.reminderRules.subscribe(function () { if (!editing) listView(); });
    Gallery.openModal(node, { wide: true, focus: false, onClose: function () { if (unsub) unsub(); } });
  }

  /* =========================================================================
   * C28: דגל אדום / ליצור קשר עם הלקוח. מחליף את ברירת המחדל של flag.js
   * (אותה חתימה: openBlockedFlag(orderId, { onClose?, onDone?, kind? })).
   * ======================================================================= */
  var QUICK = {
    stuck: ['ממתינים לתמונה מהלקוח', 'חסר חומר, ממתינים לספק', 'ממתינים לאישור מידות'],
    contact_client: ['לא לגעת בעבודה עד שהלקוח יגיע', 'המסגרת לא מתאימה', 'בעיה בפספרטו']
  };

  Gallery.openBlockedFlag = function (orderId, opts) {
    opts = opts || {};
    var o = D.orders.peekOne(orderId);
    if (!o) return;
    var active = U.isBlocked(o);
    var kind = active ? o.blocked.kind : (opts.kind || 'stuck');
    var cu = customerOf(o);
    var contactBtns = (ADMIN && cu.phone) ?
      '<div class="rem-flag__contact">' +
        '<button type="button" class="btn btn--wa btn--lg" data-fwa>' + I.wa + 'וואטסאפ ל' + esc(cu.name || 'לקוח') + '</button>' +
        '<a class="btn btn--secondary btn--lg" href="tel:' + esc(String(cu.phone).replace(/[^\d+]/g, '')) + '">' + PHONE + 'התקשר ' + esc(cu.phone) + '</a>' +
      '</div>' : '';

    function kindBtn(k, label) {
      return '<button type="button" class="flag-kind" role="radio" data-kind="' + k + '" aria-checked="' + (k === kind) + '">' + I.flag + esc(label) + '</button>';
    }
    function quickHTML() {
      return (QUICK[kind] || []).map(function (q) { return '<button type="button" class="fchip" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('');
    }
    var body, foot;
    if (active) {
      var needResp = o.blocked.kind === 'contact_client';
      body = '<div class="flag-current">' +
          '<div class="flag-current__kind">' + I.flag + esc(U.BLOCK_KIND_LABEL[o.blocked.kind] || 'תקועה') + '</div>' +
          '<div class="flag-current__reason">' + esc(o.blocked.reason || 'ללא הערה') + '</div>' +
          '<div class="flag-current__since">מאז ' + U.fmtDate(o.blocked.since) + ' (' + esc(ageText(o.blocked.since)) + ')</div>' +
        '</div>' + contactBtns +
        '<div class="form-field"><label for="flag-resp">' + (needResp ? 'תגובת הלקוח (חובה)' : 'מה קרה? (הפתרון)') + '</label>' +
          '<textarea id="flag-resp" data-resp rows="3" placeholder="' + (needResp ? 'למשל: הלקוח הגיע ובחר מסגרת אחרת' : 'למשל: הלקוח הביא את התמונה') + '"></textarea></div>';
      foot = '<button class="btn btn--primary btn--lg" data-resolve-flag>' + I.check + (needResp ? 'נרשמה תגובה, להסיר את הדגל' : 'נפתר, להסיר את הדגל') + '</button>' +
        '<button class="btn btn--ghost" data-close>ביטול</button>';
    } else {
      body = '<div class="flag-kinds" role="radiogroup" aria-label="סוג הדגל">' +
          kindBtn('stuck', 'תקועה / ממתינה') + kindBtn('contact_client', 'ליצור קשר עם הלקוח') +
        '</div>' +
        '<div class="form-field"><label for="flag-reason">הערה (חובה)</label>' +
          '<textarea id="flag-reason" data-reason rows="3" placeholder="למשל: לא לגעת בעבודה עד שהלקוח יגיע">' +
          (kind === 'contact_client' ? esc(QUICK.contact_client[0]) : '') + '</textarea></div>' +
        '<div class="flag-quick" data-quick>' + quickHTML() + '</div>' +
        '<p class="field-note rem-flag__note">הדגל נשאר פעיל (גם בטבלת העבודה) עד שנרשמת תגובה.</p>' + contactBtns;
      foot = '<button class="btn btn--danger-solid btn--lg" data-set-flag>' + I.flag + 'לסמן באדום</button>' +
        '<button class="btn btn--ghost" data-close>ביטול</button>';
    }

    var node = Gallery.modalNode({
      title: (active ? 'דגל פעיל' : 'סימון בדגל אדום') + ' · הזמנה <span class="mono">' + esc(o.number) + '</span>',
      body: body, foot: foot
    });
    node.classList.add('modal--flag');

    node.addEventListener('click', function (e) {
      var t = e.target;
      var k = t.closest('[data-kind]');
      if (k) {
        kind = k.getAttribute('data-kind');
        Array.prototype.forEach.call(node.querySelectorAll('[data-kind]'), function (b) { b.setAttribute('aria-checked', String(b === k)); });
        node.querySelector('[data-quick]').innerHTML = quickHTML();
        return;
      }
      var q = t.closest('[data-q]');
      if (q) { var ta = node.querySelector('[data-reason]'); ta.value = q.getAttribute('data-q'); ta.focus(); return; }
      if (t.closest('[data-fwa]')) { Gallery.whatsapp(cu.phone, followupMsg(Object.assign({}, o, { blocked: { kind: 'contact_client' } }))); return; }
      if (t.closest('[data-set-flag]')) {
        var reason = node.querySelector('[data-reason]').value.trim();
        if (!reason) { node.querySelector('[data-reason]').focus(); Gallery.toast('צריך לכתוב הערה: למה מחכים'); return; }
        D.orders.setBlocked(o.id, { kind: kind, reason: reason }).then(function () { Gallery.closeModal(); if (opts.onDone) opts.onDone(); });
        return;
      }
      if (t.closest('[data-resolve-flag]')) {
        var resp = node.querySelector('[data-resp]').value.trim();
        if (!resp && o.blocked.kind === 'contact_client') { node.querySelector('[data-resp]').focus(); Gallery.toast('צריך לרשום מה הלקוח ענה'); return; }
        D.orders.resolveBlocked(o.id, resp).then(function () { Gallery.closeModal(); Gallery.toast('הדגל הוסר'); if (opts.onDone) opts.onDone(); });
      }
    });

    Gallery.openModal(node, { onClose: opts.onClose, focus: false });
  };

  Gallery.Reminders = { mount: mount, onShow: render, render: render };
  Gallery.registerView('reminders', Gallery.Reminders);

})(window);
