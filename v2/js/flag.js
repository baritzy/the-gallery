/* =============================================================================
 * flag.js  -  הערת "ליצור קשר עם הלקוח" (סבב 5, במקום הדגל האדום). נטען בשני התפקידים.
 * -----------------------------------------------------------------------------
 * "ליצור קשר עם הלקוח" הוא לא סטטוס ולא דגל: זו הערה על ההזמנה (אפשר גם משורת תמונה
 * בטבלת העבודה). הערה פעילה = תזכורת פעילה, עד שמישהו רושם את תגובת הלקוח.
 *   Gallery.openContactNote(orderId, { itemId?, text?, onDone? })
 *     אין הערה פעילה: יוצר אחת (טקסט + קיצורים). יש: רושמים את תגובת הלקוח (חובה) וזה נסגר.
 *     נפתח כשכבה מעל המודל הפתוח (Gallery.layerPrompt), כך שכרטיס ההזמנה נשאר פתוח.
 *   Gallery.contactBoxHTML(o)  תיבה להצגה (כרטיס הזמנה / טבלת עבודה) עם "רשום תגובת לקוח".
 *   Gallery.openBlockedFlag  תאימות: מפנה ל-openContactNote.
 * לחיצות על [data-contact-resp] / [data-contact-new] מטופלות כאן (document).
 * בחנות: וואטסאפ / התקשר ללקוח. בסדנה: בלי שם, טלפון וסכומים.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var D = Gallery.data;
  var esc = U.esc;
  var ADMIN = Gallery.role === 'admin';

  var PHONE = '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>';
  I.phoneCall = I.phoneCall || PHONE;

  var QUICK = ['המסגרת לא מתאימה', 'בעיה בפספרטו', 'לא לגעת בעבודה עד שהלקוח מגיע', 'לאשר מידות עם הלקוח'];

  function safe(t) { return D.reminders && D.reminders.safeText ? D.reminders.safeText(t) : String(t || ''); }
  function customerOf(o) { return ADMIN && D.customers ? (D.customers.peekOne(o.customerId) || {}) : {}; }
  function ageText(iso) {
    var d = U.daysSince(iso);
    return d <= 0 ? 'היום' : (d === 1 ? 'מאתמול' : 'מזה ' + d + ' ימים');
  }

  function contactMsg(o) {
    var c = customerOf(o), s = (D.settings.peek() || {}).shop || {};
    return 'שלום ' + (c.name || '') + ', כאן ' + (s.name || 'הגלריה') + '. רצינו לדבר איתך לגבי ההזמנה שלך (מס\' ' + o.number + '). ' +
      'אפשר לחזור אלינו או לקפוץ לחנות? תודה. ' + (s.phone || '');
  }

  function contactBtnsHTML(o) {
    var cu = customerOf(o);
    if (!ADMIN || !cu.phone) return '';
    return '<div class="rem-flag__contact">' +
      '<button type="button" class="btn btn--wa btn--lg" data-cn-wa>' + I.wa + 'וואטסאפ ל' + esc(cu.name || 'לקוח') + '</button>' +
      '<a class="btn btn--secondary btn--lg" href="tel:' + esc(String(cu.phone).replace(/[^\d+]/g, '')) + '">' + PHONE + 'התקשר ' + esc(cu.phone) + '</a>' +
    '</div>';
  }

  function itemTag(o, itemId) {
    var it = itemId ? (o.items || []).filter(function (x) { return x.id === itemId; })[0] : null;
    return it ? ' (תמונה ' + D.orders.itemLabel(it, o) + ')' : '';
  }

  Gallery.contactBoxHTML = function (o) {
    if (!U.hasContact(o)) return '';
    var c = o.contact;
    return '<div class="cnote" data-cnote="' + esc(o.id) + '">' +
      '<span class="cnote__icon">' + PHONE + '</span>' +
      '<div class="cnote__txt"><b>ליצור קשר עם הלקוח' + esc(itemTag(o, c.itemId)) + ':</b> ' + esc(safe(c.text || 'בלי פירוט')) +
        '<small>' + esc(ageText(c.since)) + ' · תזכורת פעילה עד שנרשמת תגובה</small></div>' +
      '<button type="button" class="btn btn--primary cnote__btn" data-contact-resp="' + esc(o.id) + '">' + I.check + 'רשום תגובת לקוח</button>' +
    '</div>';
  };

  Gallery.openContactNote = function (orderId, opts) {
    opts = opts || {};
    var o = D.orders.peekOne(orderId);
    if (!o) return;
    var active = U.hasContact(o);
    function wire(layer) {
      var wa = layer.querySelector('[data-cn-wa]');
      if (wa) wa.addEventListener('click', function () { Gallery.whatsapp(customerOf(o).phone, contactMsg(o)); });
    }
    if (active) {
      Gallery.layerPrompt({
        title: 'תגובת הלקוח · הזמנה <span class="mono">' + esc(o.number) + '</span>',
        above: '<div class="flag-current cnote-current">' +
            '<div class="flag-current__kind">' + PHONE + 'ליצור קשר עם הלקוח' + esc(itemTag(o, o.contact.itemId)) + '</div>' +
            '<div class="flag-current__reason">' + esc(safe(o.contact.text || 'בלי פירוט')) + '</div>' +
            '<div class="flag-current__since">מאז ' + esc(U.fmtDate(o.contact.since)) + ' (' + esc(ageText(o.contact.since)) + ')</div>' +
          '</div>' + contactBtnsHTML(o),
        label: 'מה הלקוח ענה? (חובה)',
        placeholder: 'למשל: הלקוח הגיע ובחר מסגרת אחרת',
        yes: 'נרשמה תגובה, לסגור את התזכורת',
        required: true, requiredMsg: 'צריך לרשום מה הלקוח ענה',
        onOpen: wire,
        onSave: function (text) {
          return D.orders.resolveContact(o.id, text).then(function () {
            Gallery.toast('נרשמה תגובת הלקוח להזמנה ' + o.number);
            if (opts.onDone) opts.onDone();
          });
        }
      });
      return;
    }
    Gallery.layerPrompt({
      title: 'הערה: ליצור קשר עם הלקוח · הזמנה <span class="mono">' + esc(o.number) + '</span>',
      label: 'על מה צריך לדבר עם הלקוח?' + itemTag(o, opts.itemId),
      value: opts.text || '',
      placeholder: 'למשל: המסגרת שנבחרה צרה מדי לתעודה',
      quick: QUICK, yes: 'שמור הערה והפעל תזכורת',
      required: true, requiredMsg: 'צריך לכתוב על מה ליצור קשר',
      below: '<p class="field-note">התזכורת נשארת פעילה (גם בטבלת העבודה ובתזכורות) עד שמישהו רושם את תגובת הלקוח.</p>' + contactBtnsHTML(o),
      onOpen: wire,
      onSave: function (text) {
        return D.orders.setContact(o.id, { text: text, itemId: opts.itemId || null }).then(function () {
          Gallery.toast('נוספה הערה "ליצור קשר עם הלקוח" להזמנה ' + o.number);
          if (opts.onDone) opts.onDone();
        });
      }
    });
  };

  /* תאימות: הקריאות הישנות (דגל אדום) פותחות את הערת יצירת הקשר */
  Gallery.openBlockedFlag = function (orderId, opts) { return Gallery.openContactNote(orderId, opts); };

  document.addEventListener('click', function (e) {
    if (!e.target.closest) return;
    var r = e.target.closest('[data-contact-resp]');
    if (r) { Gallery.openContactNote(r.getAttribute('data-contact-resp')); return; }
    var n = e.target.closest('[data-contact-new]');
    if (n) Gallery.openContactNote(n.getAttribute('data-contact-new'), { itemId: n.getAttribute('data-item-id') || null });
  });

})(window);
