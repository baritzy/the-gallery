/* =============================================================================
 * print.js  -  הדפסה / PDF לרשימת ספק (C25 / D6)
 * OWNER: agent A (wave 3). רק הבעלים עורך את הקובץ הזה.
 * חוזה: P-projects/The-Gallery/context/v2-contract.md
 * נטען גם ב-admin וגם ב-workshop. גיליון הדפסה עם לוגו ופרטי הגלריה, בלי מחירים.
 * -----------------------------------------------------------------------------
 * Gallery.printSupplierList(supplierId, opts?) -> פותח גיליון מעל המסך ואז window.print()
 *   ("שמירה כ-PDF" בדיאלוג ההדפסה, ואז שליחה ידנית בוואטסאפ).
 *   opts.auto === false -> רק תצוגה, בלי לפתוח את דיאלוג ההדפסה מיד.
 * Gallery.supplierListText(supplierId) -> טקסט פשוט לוואטסאפ (גיבוי ל-PDF).
 *
 * למה לא iframe: באייפד (Safari) הדפסת iframe מדפיסה לפעמים את הדף שמאחור.
 * לכן הגיליון נבנה בתוך המסמך (.prn-root) ו-print.css מסתיר כל השאר בזמן הדפסה.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;
  var D = Gallery.data;

  /* פרטי העסק כמו בפנקס. ההגדרות גוברות אם מולאו. */
  var SHOP_FALLBACK = {
    name: 'הגלריה',
    address: "רח' רוטשילד 64/2 כפר-סבא",
    phone: '09-7674829',
    vatId: '050598721'
  };

  function shop() {
    var s = (D.settings && D.settings.peek().shop) || {};
    return {
      name: s.name || SHOP_FALLBACK.name,
      address: s.address || SHOP_FALLBACK.address,
      phone: s.phone || SHOP_FALLBACK.phone,
      vatId: s.vatId || SHOP_FALLBACK.vatId
    };
  }

  function linesOf(supplierId) {
    return D.supplierOrderLines.pending(supplierId).sort(function (a, b) {
      if (a.itemType !== b.itemType) return a.itemType === 'frame' ? -1 : 1;
      return String(a.label || '').localeCompare(String(b.label || ''), 'he');
    });
  }

  function qtyOf(l) { return Number(l.itemType === 'frame' ? l.qtyRods : l.qty) || 0; }
  function unitOf(l) {
    return D.supplierOrderLines.unitOf ? D.supplierOrderLines.unitOf(l) : (l.itemType === 'frame' ? 'מוטות' : "יח'");
  }

  /* ---------------------------------------------------------------------------
   * טקסט לוואטסאפ
   * ------------------------------------------------------------------------- */
  Gallery.supplierListText = function (supplierId) {
    var s = D.suppliers.peekOne(supplierId) || {};
    var sh = shop();
    var lines = linesOf(supplierId);
    var out = ['שלום' + (s.contactName ? ' ' + s.contactName : '') + ',',
      'כאן ' + sh.name + '. הזמנה ל' + (s.name || 'ספק') + ' מתאריך ' + U.fmtDate(new Date().toISOString()) + ':', ''];
    lines.forEach(function (l) { out.push('• ' + qtyOf(l) + ' ' + unitOf(l) + ' · ' + (l.label || '')); });
    if (!lines.length) out.push('(אין שורות פתוחות)');
    out.push('', 'תודה,', sh.name + ' · ' + sh.phone);
    return out.join('\n');
  };

  /* ---------------------------------------------------------------------------
   * הגיליון
   * ------------------------------------------------------------------------- */
  function sheetHTML(s, lines) {
    var sh = shop();
    var today = U.fmtDate(new Date().toISOString());
    var rows = lines.map(function (l, i) {
      var item = D.supplierOrderLines.itemOf ? D.supplierOrderLines.itemOf(l) : null;
      var sku = l.itemType === 'frame' && item ? item.sku : '';
      var name = l.label || '';
      if (sku && name.indexOf(sku) === 0) name = name.slice(sku.length).trim();
      return '<tr><td class="prn-c">' + (i + 1) + '</td>' +
        '<td class="prn-sku">' + esc(sku || '') + '</td>' +
        '<td>' + esc(name) + '</td>' +
        '<td class="prn-c prn-qty">' + esc(qtyOf(l)) + '</td>' +
        '<td class="prn-c">' + esc(unitOf(l)) + '</td>' +
        '<td class="prn-c"><span class="prn-box"></span></td></tr>';
    }).join('');
    var total = lines.filter(function (l) { return l.itemType === 'frame'; }).reduce(function (n, l) { return n + qtyOf(l); }, 0);

    return '<div class="prn-sheet" dir="rtl">' +
      '<header class="prn-head">' +
        '<img class="prn-logo" src="assets/logo.png?v=' + Gallery.VERSION + '" alt="' + esc(sh.name) + '">' +
        '<div class="prn-shop">' +
          '<div class="prn-shop__name">' + esc(sh.name) + '</div>' +
          '<div>' + esc(sh.address) + '</div>' +
          '<div>טלפקס ' + esc(sh.phone) + '</div>' +
          '<div>עוסק מורשה ' + esc(sh.vatId) + '</div>' +
        '</div>' +
      '</header>' +
      '<div class="prn-title">' +
        '<div><div class="prn-title__k">הזמנה לספק</div><div class="prn-title__v">' + esc(s.name || '') + '</div>' +
          (s.contactName || s.phone ? '<div class="prn-title__c">' + esc([s.contactName, s.phone].filter(Boolean).join(' · ')) + '</div>' : '') + '</div>' +
        '<div class="prn-title__date"><div class="prn-title__k">תאריך</div><div class="prn-title__v">' + esc(today) + '</div></div>' +
      '</div>' +
      '<table class="prn-table"><thead><tr>' +
        '<th class="prn-c">#</th><th>מק"ט</th><th>פריט</th><th class="prn-c">כמות</th><th class="prn-c">יחידה</th><th class="prn-c">התקבל</th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>' +
      '<div class="prn-sum">' + U.plural(lines.length, 'שורה אחת', 'שורות') + (total ? ' · סה"כ ' + total + ' מוטות' : '') + '</div>' +
      '<footer class="prn-foot">תודה! לשאלות: ' + esc(sh.name) + ' · ' + esc(sh.phone) + '</footer>' +
    '</div>';
  }

  var host = null;

  function close() {
    if (!host) return;
    host.remove();
    host = null;
    document.body.classList.remove('prn-active');
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e) { if (e.key === 'Escape') close(); }

  function doPrint() {
    try { global.print(); } catch (e) { Gallery.toast('לא הצלחנו לפתוח הדפסה. אפשר לצלם מסך ולשלוח.'); }
  }

  Gallery.printSupplierList = function (supplierId, opts) {
    opts = opts || {};
    var s = D.suppliers.peekOne(supplierId);
    if (!s) { Gallery.toast('הספק לא נמצא'); return; }
    var lines = linesOf(supplierId);
    if (!lines.length) { Gallery.toast('אין שורות פתוחות ל' + s.name); return; }

    close();
    if (Gallery.isModalOpen && Gallery.isModalOpen()) Gallery.closeModal();
    host = document.createElement('div');
    host.className = 'prn-root';
    host.setAttribute('role', 'dialog');
    host.setAttribute('aria-modal', 'true');
    host.setAttribute('aria-label', 'רשימת הזמנה ל' + s.name);
    host.innerHTML =
      '<div class="prn-bar">' +
        '<button type="button" class="btn btn--primary btn--lg" data-prn-print>' + I.printer + 'הדפס / שמור PDF</button>' +
        '<button type="button" class="btn btn--wa btn--lg" data-prn-wa>' + I.wa + 'שלח בוואטסאפ</button>' +
        '<button type="button" class="btn btn--secondary btn--lg" data-prn-close>סגור</button>' +
        '<div class="prn-bar__hint">בדיאלוג ההדפסה בוחרים "שמירה כ-PDF", ואז שולחים את הקובץ לספק בוואטסאפ.</div>' +
      '</div>' +
      '<div class="prn-paper">' + sheetHTML(s, lines) + '</div>';
    document.body.appendChild(host);
    document.body.classList.add('prn-active');
    document.addEventListener('keydown', onKey);

    host.addEventListener('click', function (e) {
      if (e.target.closest('[data-prn-print]')) { doPrint(); return; }
      if (e.target.closest('[data-prn-wa]')) { Gallery.whatsapp(s.phone || '', Gallery.supplierListText(s.id)); return; }
      if (e.target.closest('[data-prn-close]')) close();
    });

    if (opts.auto === false) return;
    /* מחכים ללוגו כדי שיופיע ב-PDF */
    var img = host.querySelector('.prn-logo');
    var fired = false;
    function go() { if (fired || !host) return; fired = true; global.setTimeout(doPrint, 60); }
    if (img.complete) go();
    else { img.addEventListener('load', go); img.addEventListener('error', go); global.setTimeout(go, 1500); }
  };

  Gallery.closeSupplierPrint = close;

})(window);
