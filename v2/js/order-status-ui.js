/* =============================================================================
 * order-status-ui.js  -  שינוי סטטוס הזמנה מהמסך (סבב 4, A2). נטען בשני התפקידים.
 * -----------------------------------------------------------------------------
 * Gallery.askOrderReady(orderId, { onClose? })
 *   כשהשורה האחרונה בהזמנה סומנה "בוצע": שואלים אם לסמן מוכנה.
 *   "כן, מוכנה" = setStatus('ready'). "לא" = נשאר בעבודה (למשל תיקון פינות).
 *   לא עושה כלום אם ההזמנה כבר מוכנה / נמסרה או שלא כל השורות בוצעו.
 * Gallery.changeOrderStatus(orderId, status, { onClose? })
 *   בורר הסטטוס בטבלת העבודה: חדשה / בעבודה / מוכנה.
 *   "חדשה" כשיש שורות שבוצעו, ו"מוכנה" כשלא הכל בוצע, מבקשים אישור קודם.
 * Gallery.flagHistoryHTML(o) (B2): היסטוריית הדגלים שנפתרו מתוך blockedLog, החדש קודם,
 *   כולל תגובת הלקוח. בסדנה טלפונים וסכומים בטקסט מוסתרים (reminders.safeText).
 * בלי כסף ובלי פרטי לקוח (נטען גם בסדנה).
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var D = Gallery.data;
  var esc = U.esc;

  var LABEL = { 'new': 'חדשה', in_progress: 'בעבודה', ready: 'מוכנה' };

  function doneCount(o) { return (o.items || []).filter(function (i) { return i.done; }).length; }

  /* מודל שאלה עם שני כפתורים גדולים. yes() מחזיר Promise (או כלום). */
  function ask(o, cfg) {
    var node = Gallery.modalNode({
      title: esc(cfg.title) + ' · הזמנה <span class="mono">' + esc(o.number) + '</span>',
      body: '<p class="wt-ask__q">' + esc(cfg.question) + '</p>' + (cfg.sub ? '<p class="wt-ask__sub">' + esc(cfg.sub) + '</p>' : ''),
      foot: '<button type="button" class="btn btn--lg wt-ask__yes wt-ask__yes--' + (cfg.tone || 'green') + '" data-yes>' + I.check + esc(cfg.yes) + '</button>' +
        '<button type="button" class="btn btn--secondary btn--lg wt-ask__no" data-no>' + esc(cfg.no) + '</button>'
    });
    node.classList.add('wt-modal', 'wt-ask');
    node.addEventListener('click', function (e) {
      var y = e.target.closest('[data-yes]');
      if (y) {
        y.disabled = true;
        Promise.resolve(cfg.onYes()).then(function () { Gallery.closeModal(); });
        return;
      }
      if (e.target.closest('[data-no]')) {
        Gallery.closeModal();
        if (cfg.onNo) cfg.onNo();
      }
    });
    Gallery.openModal(node, { focus: false, onClose: cfg.onClose });
    return node;
  }

  Gallery.flagHistoryHTML = function (o) {
    var log = ((o && o.blockedLog) || []).filter(function (b) { return b && b.resolvedAt; })
      .sort(function (a, b) { return String(b.resolvedAt).localeCompare(String(a.resolvedAt)); });
    if (!log.length) return '';
    var safe = D.reminders && D.reminders.safeText ? D.reminders.safeText : function (t) { return t; };
    return '<div class="ocard__section wt-fhist"><div class="ocard__sechead">היסטוריית דגלים ותגובות</div><ul class="wt-fhist__list">' +
      log.map(function (b) {
        return '<li class="wt-fhist__item">' +
          '<div class="wt-fhist__top"><b>' + esc(U.BLOCK_KIND_LABEL[b.kind] || 'תקועה') + ':</b> ' + esc(safe(b.reason || 'ללא הערה')) +
            ' <span class="wt-fhist__date">(' + esc(U.fmtDateShort(b.since)) + ' עד ' + esc(U.fmtDateShort(b.resolvedAt)) + ')</span></div>' +
          (String(b.response || '').trim() ? '<div class="wt-fhist__resp">תגובת הלקוח: ' + esc(safe(b.response)) + '</div>' :
            '<div class="wt-fhist__resp is-empty">נפתר בלי תגובה</div>') +
        '</li>';
      }).join('') + '</ul></div>';
  };

  Gallery.askOrderReady = function (orderId, opts) {
    opts = opts || {};
    var o = D.orders.peekOne(orderId);
    if (!o || o.status === 'ready' || o.status === 'delivered' || !D.orders.allDone(o)) {
      if (opts.onClose) opts.onClose();
      return null;
    }
    return ask(o, {
      title: 'כל התמונות בוצעו',
      question: 'כל התמונות בהזמנה ' + o.number + ' בוצעו. לסמן את ההזמנה כמוכנה?',
      sub: 'אם העבודה יורדת לתיקון פינות או לגימור, בוחרים "לא" וההזמנה נשארת בעבודה (צהוב).',
      yes: 'כן, מוכנה',
      no: 'לא, עדיין בעבודה (למשל תיקון פינות)',
      onYes: function () {
        return D.orders.setStatus(o.id, 'ready').then(function () { Gallery.toast('הזמנה ' + o.number + ' מוכנה'); });
      },
      onNo: function () { Gallery.toast('הזמנה ' + o.number + ' נשארת בעבודה'); },
      onClose: opts.onClose
    });
  };

  function apply(o, status) {
    return D.orders.setStatus(o.id, status).then(function () {
      Gallery.toast(status === 'new' ? 'הזמנה ' + o.number + ' חזרה ל"חדשה"' : 'הזמנה ' + o.number + ': ' + LABEL[status]);
    });
  }

  Gallery.changeOrderStatus = function (orderId, status, opts) {
    opts = opts || {};
    var o = D.orders.peekOne(orderId);
    if (!o || !LABEL[status] || o.status === status) return Promise.resolve(o);
    var done = doneCount(o);
    var total = (o.items || []).length;
    if (status === 'new' && done > 0) {
      ask(o, {
        title: 'להחזיר ל"חדשה"?', tone: 'blue',
        question: 'בהזמנה ' + o.number + ' ' + (done === 1 ? 'תמונה אחת סומנה' : done + ' תמונות סומנו') + ' "בוצע". להחזיר ל"חדשה"?',
        sub: 'סימוני "בוצע" יתבטלו, והחומר שירד למלאי יחזור.',
        yes: 'כן, להחזיר ל"חדשה"', no: 'ביטול',
        onYes: function () { return apply(o, 'new'); },
        onClose: opts.onClose
      });
      return Promise.resolve(o);
    }
    if (status === 'ready' && done < total) {
      ask(o, {
        title: 'לסמן מוכנה?',
        question: 'בהזמנה ' + o.number + ' בוצעו ' + done + ' מתוך ' + total + '. לסמן את כל התמונות כבוצעו ואת ההזמנה כמוכנה?',
        yes: 'כן, הכל מוכן', no: 'ביטול',
        onYes: function () { return apply(o, 'ready'); },
        onClose: opts.onClose
      });
      return Promise.resolve(o);
    }
    return apply(o, status);
  };

})(window);
