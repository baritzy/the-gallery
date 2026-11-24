/* =============================================================================
 * order-status-ui.js  -  סטטוס הזמנה מהמסך (סבב 5). נטען בשני התפקידים.
 * -----------------------------------------------------------------------------
 * 5 סטטוסים אמיתיים: חדשה (כחול), בעבודה (צהוב), תקועה (אדום), מוכנה (ירוק), נמסרה (אפור).
 *
 * Gallery.statusPillHTML(o, { lg?, reason? })
 *   כפתור אחד לכל הזמנה, בצבע הסטטוס: "סטטוס: בעבודה ▾". לחיצה פותחת תפריט של 5 הסטטוסים.
 *   reason (ברירת מחדל true): בתקועה מוצגת הסיבה ליד הכפתור, ולחיצה עליה עורכת אותה.
 *   אותו רכיב בכרטיס ההזמנה, בטבלת העבודה וברשימת ההזמנות. הלחיצה מטופלת כאן (document).
 * Gallery.changeOrderStatus(orderId, status, { onDone? })
 *   בלי שאלת אישור. "תקועה" שואלת "למה תקועה?" (חובה). אחרי השינוי: טוסט "הזמנה N עברה ל: X".
 * Gallery.askOrderReady(orderId, { onClose? })
 *   רק כשהשורה האחרונה סומנה "בוצע": "כל התמונות בוצעו. לסמן את ההזמנה כמוכנה?" כן / לא.
 * Gallery.layerPrompt(cfg)
 *   חלון טקסט קטן מעל מודל פתוח (לא סוגר אותו): סיבת תקועה, הערת יצירת קשר, תגובת לקוח.
 * Gallery.flagHistoryHTML(o)
 *   היסטוריה מתוך blockedLog: תקועה (הסיבה ולאן יצאה) ויצירת קשר (כולל תגובת הלקוח).
 * בלי כסף ובלי פרטי לקוח (נטען גם בסדנה). טקסט חופשי בסדנה עובר reminders.safeText.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var D = Gallery.data;
  var esc = U.esc;

  var STUCK_QUICK = ['ממתינים לתמונה מהלקוח', 'חסר חומר, ממתינים לספק', 'ממתינים לאישור מידות'];

  function safe(t) { return D.reminders && D.reminders.safeText ? D.reminders.safeText(t) : String(t || ''); }

  /* ------------------------------------------------------------------ pill */
  Gallery.statusPillHTML = function (o, opts) {
    opts = opts || {};
    if (!o) return '';
    var color = U.STATUS_COLOR[o.status] || 'grey';
    var label = U.STATUS_LABEL[o.status] || '';
    var reason = o.status === 'stuck' && o.stuck ? String(o.stuck.reason || '') : '';
    var showReason = opts.reason !== false && o.status === 'stuck';
    return '<span class="spill-wrap' + (opts.lg ? ' spill-wrap--lg' : '') + '">' +
      '<button type="button" class="spill spill--' + color + (opts.lg ? ' spill--lg' : '') + '" data-spill="' + esc(o.id) + '"' +
        ' aria-haspopup="menu" aria-expanded="false" aria-label="סטטוס הזמנה ' + esc(o.number) + ': ' + esc(label) + '. לחיצה לשינוי">' +
        '<span class="spill__k">סטטוס:</span><b class="spill__v">' + esc(label) + '</b><span class="spill__caret" aria-hidden="true">▾</span>' +
      '</button>' +
      (showReason ? '<button type="button" class="spill-reason" data-stuck-edit="' + esc(o.id) + '" title="עריכת הסיבה">' +
        '<span class="spill-reason__k">למה:</span> ' + (reason ? esc(safe(reason)) : '<i>לא נכתבה סיבה</i>') + I.edit + '</button>' : '') +
    '</span>';
  };

  /* ------------------------------------------------------------------ menu */
  var menu = null;
  function closeMenu() {
    if (!menu) return;
    var m = menu; menu = null;
    if (m.btn) m.btn.setAttribute('aria-expanded', 'false');
    if (m.el.parentNode) m.el.parentNode.removeChild(m.el);
    global.removeEventListener('keydown', m.onKey, true);
    global.removeEventListener('resize', closeMenu);
    global.removeEventListener('scroll', m.onScroll, true);
  }

  function openMenu(btn) {
    var id = btn.getAttribute('data-spill');
    var o = D.orders.peekOne(id);
    if (!o) return;
    if (menu && menu.btn === btn) { closeMenu(); return; }
    closeMenu();
    var el = document.createElement('div');
    el.className = 'spill-menu';
    el.setAttribute('role', 'menu');
    el.setAttribute('aria-label', 'שינוי סטטוס להזמנה ' + o.number);
    el.innerHTML = '<div class="spill-menu__head">הזמנה <b class="mono">' + esc(o.number) + '</b>: לבחור סטטוס</div>' +
      U.STATUS_LIST.map(function (s) {
        var on = o.status === s;
        return '<button type="button" role="menuitemradio" aria-checked="' + on + '" class="spill-menu__item spill-menu__item--' + U.STATUS_COLOR[s] +
          (on ? ' is-on' : '') + '" data-spill-set="' + s + '"><span class="spill-menu__dot"></span><span class="spill-menu__lbl">' + esc(U.STATUS_LABEL[s]) + '</span>' +
          (on ? '<span class="spill-menu__now">עכשיו</span>' : '') + '</button>';
      }).join('');
    document.body.appendChild(el);
    var r = btn.getBoundingClientRect();
    var w = el.offsetWidth, h = el.offsetHeight;
    var vw = document.documentElement.clientWidth, vh = global.innerHeight;
    var right = Math.max(8, vw - r.right);
    if (vw - right - w < 8) right = Math.max(8, vw - w - 8);
    var top = r.bottom + 6;
    if (top + h > vh - 8) top = Math.max(8, r.top - h - 6);
    el.style.right = right + 'px';
    el.style.top = top + 'px';
    btn.setAttribute('aria-expanded', 'true');
    menu = {
      el: el, btn: btn, id: id,
      onKey: function (e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); closeMenu(); try { btn.focus(); } catch (x) {} } },
      /* גלילה אמיתית (הכפתור זז) סוגרת. אירוע גלילה בלי תזוזה (למשל אחרי הקשה) לא סוגר */
      onScroll: function (e) {
        if (el.contains(e.target)) return;
        var nr = btn.getBoundingClientRect();
        if (!document.body.contains(btn) || Math.abs(nr.top - r.top) > 4 || Math.abs(nr.left - r.left) > 4) closeMenu();
      }
    };
    global.addEventListener('keydown', menu.onKey, true);
    global.addEventListener('resize', closeMenu);
    global.addEventListener('scroll', menu.onScroll, true);
    el.addEventListener('click', function (e) {
      var it = e.target.closest('[data-spill-set]');
      if (!it) return;
      var st = it.getAttribute('data-spill-set');
      closeMenu();
      Gallery.changeOrderStatus(id, st);
    });
    var cur = el.querySelector('.is-on') || el.querySelector('[data-spill-set]');
    if (cur) { try { cur.focus({ preventScroll: true }); } catch (x) { cur.focus(); } }
  }

  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('[data-spill]');
    if (b) { e.preventDefault(); openMenu(b); return; }
    var r = e.target.closest && e.target.closest('[data-stuck-edit]');
    if (r) { e.preventDefault(); closeMenu(); askStuck(r.getAttribute('data-stuck-edit')); return; }
    if (menu && !menu.el.contains(e.target)) closeMenu();
  });

  /* ------------------------------------------------------------------ layer prompt */
  var layer = null;
  function closeLayer() {
    if (!layer) return;
    global.removeEventListener('keydown', layer._onKey, true);
    if (layer.parentNode) layer.parentNode.removeChild(layer);
    layer = null;
  }
  Gallery.closeLayerPrompt = closeLayer;

  /* cfg: { title, label, value, placeholder, quick:[], yes, tone:'red'|'primary', required, requiredMsg, above, below, onSave(text) -> Promise } */
  Gallery.layerPrompt = function (cfg) {
    closeLayer();
    closeMenu();
    layer = document.createElement('div');
    layer.className = 'modal-backdrop lprompt-layer';
    layer.innerHTML =
      '<div class="modal lprompt" role="dialog" aria-modal="true" aria-labelledby="lprompt-t">' +
        '<div class="modal__head"><h2 class="modal__title" id="lprompt-t">' + cfg.title + '</h2>' +
          '<button type="button" class="modal__close" data-lp-no aria-label="סגירה">×</button></div>' +
        '<div class="modal__body">' + (cfg.above || '') +
          '<div class="form-field"><label for="lprompt-ta">' + esc(cfg.label || '') + '</label>' +
            '<textarea id="lprompt-ta" rows="3" data-lp-text placeholder="' + esc(cfg.placeholder || '') + '">' + esc(cfg.value || '') + '</textarea></div>' +
          ((cfg.quick || []).length ? '<div class="lprompt__quick">' + cfg.quick.map(function (q) {
            return '<button type="button" class="fchip" data-lp-q="' + esc(q) + '">' + esc(q) + '</button>';
          }).join('') + '</div>' : '') + (cfg.below || '') +
        '</div>' +
        '<div class="modal__foot">' +
          '<button type="button" class="btn btn--lg ' + (cfg.tone === 'red' ? 'btn--danger-solid' : 'btn--primary') + '" data-lp-yes>' + I.check + esc(cfg.yes || 'שמור') + '</button>' +
          '<button type="button" class="btn btn--ghost btn--lg" data-lp-no>ביטול</button>' +
        '</div>' +
      '</div>';
    var ta = layer.querySelector('[data-lp-text]');
    function cancel() { closeLayer(); if (cfg.onCancel) { try { cfg.onCancel(); } catch (x) {} } }
    layer._onKey = function (e) { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); cancel(); } };
    global.addEventListener('keydown', layer._onKey, true);
    layer.addEventListener('mousedown', function (e) { if (e.target === layer) cancel(); });
    layer.addEventListener('click', function (e) {
      var q = e.target.closest('[data-lp-q]');
      if (q) { ta.value = q.getAttribute('data-lp-q'); ta.focus(); return; }
      if (e.target.closest('[data-lp-no]')) { cancel(); return; }
      var y = e.target.closest('[data-lp-yes]');
      if (y) {
        var v = ta.value.trim();
        if (cfg.required && !v) { ta.focus(); Gallery.toast(cfg.requiredMsg || 'צריך לכתוב משהו'); return; }
        y.disabled = true;
        Promise.resolve(cfg.onSave(v, layer)).then(function () { closeLayer(); }, function (err) {
          y.disabled = false;
          Gallery.toast('השמירה נכשלה: ' + (err && err.message ? err.message : err));
        });
      }
    });
    if (cfg.onOpen) cfg.onOpen(layer);
    document.body.appendChild(layer);
    try { ta.focus({ preventScroll: true }); } catch (x) { ta.focus(); }
    return layer;
  };

  /* "למה תקועה?" (חדש או עריכה). אם ההזמנה כבר תקועה, רק מעדכן את הסיבה. */
  function askStuck(orderId, opts) {
    opts = opts || {};
    var o = D.orders.peekOne(orderId);
    if (!o) return;
    var editing = o.status === 'stuck';
    Gallery.layerPrompt({
      title: (editing ? 'למה ההזמנה תקועה?' : 'למה תקועה?') + ' · הזמנה <span class="mono">' + esc(o.number) + '</span>',
      label: 'הסיבה (מופיעה ליד הסטטוס, בחנות ובסדנה)',
      value: editing && o.stuck ? o.stuck.reason : '',
      placeholder: 'למשל: ביום שני הלקוח מביא את התמונה השנייה',
      quick: STUCK_QUICK, yes: editing ? 'שמור סיבה' : 'סמן כתקועה', tone: 'red',
      required: true, requiredMsg: 'צריך לכתוב למה ההזמנה תקועה',
      onSave: function (text) {
        var p = editing ? D.orders.setStuckReason(o.id, text) : D.orders.setStatus(o.id, 'stuck', { reason: text });
        return p.then(function () {
          Gallery.toast(editing ? 'הסיבה עודכנה' : 'הזמנה ' + o.number + ' עברה ל: תקועה');
          if (opts.onDone) opts.onDone();
        });
      }
    });
  }
  Gallery.askStuckReason = askStuck;

  /* ------------------------------------------------------------------ change */
  Gallery.changeOrderStatus = function (orderId, status, opts) {
    opts = opts || {};
    var o = D.orders.peekOne(orderId);
    if (!o || !U.STATUS_LABEL[status] || U.STATUS_LIST.indexOf(status) === -1) return Promise.resolve(o);
    if (status === 'stuck') { askStuck(orderId, opts); return Promise.resolve(o); }
    if (o.status === status) return Promise.resolve(o);
    return D.orders.setStatus(o.id, status).then(function (next) {
      Gallery.toast('הזמנה ' + o.number + ' עברה ל: ' + U.STATUS_LABEL[status]);
      if (opts.onDone) opts.onDone(next);
      return next;
    });
  };

  /* ------------------------------------------------------------------ last item done */
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

  Gallery.askOrderReady = function (orderId, opts) {
    opts = opts || {};
    var o = D.orders.peekOne(orderId);
    if (!o || o.status === 'ready' || o.status === 'delivered' || !D.orders.allDone(o)) {
      if (opts.onClose) opts.onClose();
      return null;
    }
    return ask(o, {
      title: 'כל התמונות בוצעו',
      question: 'כל התמונות בוצעו. לסמן את ההזמנה כמוכנה?',
      sub: 'אם העבודה יורדת לתיקון פינות או לגימור, בוחרים "לא" וההזמנה נשארת ' + (o.status === 'stuck' ? 'תקועה' : 'בעבודה') + '.',
      yes: 'כן, מוכנה',
      no: 'לא, עדיין לא',
      onYes: function () {
        return D.orders.setStatus(o.id, 'ready').then(function () { Gallery.toast('הזמנה ' + o.number + ' עברה ל: מוכנה'); });
      },
      onNo: function () { Gallery.toast('הזמנה ' + o.number + ' נשארת ' + (U.STATUS_LABEL[o.status] || 'בעבודה')); },
      onClose: opts.onClose
    });
  };

  /* ------------------------------------------------------------------ history */
  Gallery.flagHistoryHTML = function (o) {
    var log = ((o && o.blockedLog) || []).filter(function (b) { return b && b.resolvedAt; })
      .sort(function (a, b) { return String(b.resolvedAt).localeCompare(String(a.resolvedAt)); });
    if (!log.length) return '';
    return '<div class="ocard__section wt-fhist"><div class="ocard__sechead">היסטוריה: תקועה ויצירת קשר</div><ul class="wt-fhist__list">' +
      log.map(function (b) {
        var contact = b.kind === 'contact_client';
        var tail;
        if (contact) {
          tail = String(b.response || '').trim() ? '<div class="wt-fhist__resp">תגובת הלקוח: ' + esc(safe(b.response)) + '</div>' :
            '<div class="wt-fhist__resp is-empty">נסגר בלי תגובה</div>';
        } else {
          tail = '<div class="wt-fhist__resp is-empty">' + (b.to && U.STATUS_LABEL[b.to] ? 'יצאה מתקועה ל: ' + esc(U.STATUS_LABEL[b.to]) :
            (String(b.response || '').trim() ? esc(safe(b.response)) : 'יצאה מתקועה')) + '</div>';
        }
        return '<li class="wt-fhist__item wt-fhist__item--' + (contact ? 'contact' : 'stuck') + '">' +
          '<div class="wt-fhist__top"><b>' + esc(contact ? 'ליצור קשר עם הלקוח' : 'תקועה') + ':</b> ' + esc(safe(b.reason || 'ללא הערה')) +
            ' <span class="wt-fhist__date">(' + esc(U.fmtDateShort(b.since)) + ' עד ' + esc(U.fmtDateShort(b.resolvedAt)) + ')</span></div>' +
          tail + '</li>';
      }).join('') + '</ul></div>';
  };

})(window);
