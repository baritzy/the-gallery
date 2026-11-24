/* =============================================================================
 * flag.js  -  דגל אדום על הזמנה (C7 / C28 / D2): Gallery.openBlockedFlag(orderId)
 * OWNER: foundation (wave 2). מימוש ברירת מחדל עובד, נטען גם בסדנה.
 * agent C רשאי להחליף אותו מתוך reminders.js (פשוט להגדיר מחדש את הפונקציה).
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;
  var orders = Gallery.data.orders;

  var QUICK = {
    stuck: ['ממתינים לתמונה מהלקוח', 'חסר חומר, ממתינים לספק', 'ממתינים לאישור מידות'],
    contact_client: ['המסגרת לא מתאימה', 'בעיה בפספרטו', 'לא לגעת בעבודה עד שהלקוח מגיע']
  };

  Gallery.openBlockedFlag = function (orderId, opts) {
    opts = opts || {};
    var o = orders.peekOne(orderId);
    if (!o) return;
    var active = U.isBlocked(o);
    var kind = active ? o.blocked.kind : (opts.kind || 'stuck');

    function body() {
      if (active) {
        return '<div class="flag-current">' +
            '<div class="flag-current__kind">' + I.flag + esc(U.BLOCK_KIND_LABEL[o.blocked.kind] || 'תקועה') + '</div>' +
            '<div class="flag-current__reason">' + esc(o.blocked.reason || 'ללא סיבה') + '</div>' +
            '<div class="flag-current__since">מאז ' + U.fmtDate(o.blocked.since) + ' (' + U.plural(U.daysSince(o.blocked.since), 'יום אחד', 'ימים') + ')</div>' +
          '</div>' +
          '<div class="form-field"><label for="flag-resp">מה קרה? (תגובת הלקוח / הפתרון)</label>' +
            '<textarea id="flag-resp" data-resp rows="3" placeholder="למשל: הלקוח הביא את התמונה"></textarea></div>';
      }
      return '<div class="flag-kinds" role="radiogroup" aria-label="סוג הדגל">' +
          kindBtn('stuck', 'תקועה / ממתינה') + kindBtn('contact_client', 'ליצור קשר עם הלקוח') +
        '</div>' +
        '<div class="form-field"><label for="flag-reason">למה? (חובה)</label>' +
          '<textarea id="flag-reason" data-reason rows="3" placeholder="למשל: ביום שני הלקוח מביא את התמונה השנייה"></textarea></div>' +
        '<div class="flag-quick" data-quick></div>';
    }
    function kindBtn(k, label) {
      return '<button type="button" class="flag-kind" role="radio" data-kind="' + k + '" aria-checked="' + (k === kind) + '">' + I.flag + esc(label) + '</button>';
    }
    function quickHTML() {
      return (QUICK[kind] || []).map(function (q) { return '<button type="button" class="fchip" data-q="' + esc(q) + '">' + esc(q) + '</button>'; }).join('');
    }

    var node = Gallery.modalNode({
      title: (active ? 'הסרת דגל אדום' : 'סימון בדגל אדום') + ' · הזמנה <span class="mono">' + esc(o.number) + '</span>',
      body: body(),
      foot: active ?
        '<button class="btn btn--primary btn--lg" data-resolve>' + I.check + 'נפתר, להסיר את הדגל</button>' +
        '<button class="btn btn--ghost" data-close>ביטול</button>' :
        '<button class="btn btn--danger-solid btn--lg" data-set>' + I.flag + 'לסמן באדום</button>' +
        '<button class="btn btn--ghost" data-close>ביטול</button>'
    });
    node.classList.add('modal--flag');

    var quick = node.querySelector('[data-quick]');
    if (quick) quick.innerHTML = quickHTML();
    node.addEventListener('click', function (e) {
      var k = e.target.closest('[data-kind]');
      if (k) {
        kind = k.getAttribute('data-kind');
        Array.prototype.forEach.call(node.querySelectorAll('[data-kind]'), function (b) { b.setAttribute('aria-checked', String(b === k)); });
        quick.innerHTML = quickHTML();
        return;
      }
      var q = e.target.closest('[data-q]');
      if (q) { var ta = node.querySelector('[data-reason]'); ta.value = q.getAttribute('data-q'); ta.focus(); return; }
      if (e.target.closest('[data-set]')) {
        var reason = node.querySelector('[data-reason]').value.trim();
        if (!reason) { node.querySelector('[data-reason]').focus(); Gallery.toast('צריך לכתוב למה מחכים'); return; }
        orders.setBlocked(o.id, { kind: kind, reason: reason }).then(function () { Gallery.closeModal(); if (opts.onDone) opts.onDone(); });
        return;
      }
      if (e.target.closest('[data-resolve]')) {
        var resp = node.querySelector('[data-resp]').value.trim();
        orders.resolveBlocked(o.id, resp).then(function () { Gallery.closeModal(); if (opts.onDone) opts.onDone(); });
      }
    });

    Gallery.openModal(node, { onClose: opts.onClose });
  };

})(window);
