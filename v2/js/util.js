/* =============================================================================
 * util.js  -  עזרים משותפים: Gallery.util + Gallery.whatsapp
 * OWNER: foundation (wave 2). ב-wave 3 לא עורכים; עזר חדש = בקובץ המודול שלכם.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery = global.Gallery || {};

  function settings() { return (Gallery.data && Gallery.data.settings) ? Gallery.data.settings.peek() : { shop: {} }; }
  function role() { return document.documentElement.getAttribute('data-role') || 'admin'; }

  /* =========================================================================
   * סטטוסים וצבעים (C7)
   * ======================================================================= */
  /* סבב 5: 5 סטטוסים אמיתיים. "תקועה" היא סטטוס (אדום) עם סיבה. אין יותר דגל אדום מעל הסטטוס. */
  var STATUS_LABEL = { 'new': 'חדשה', in_progress: 'בעבודה', 'in-work': 'בעבודה', stuck: 'תקועה', ready: 'מוכנה', delivered: 'נמסרה' };
  var STATUS_LIST = ['new', 'in_progress', 'stuck', 'ready', 'delivered'];
  var STATUS_COLOR = { 'new': 'blue', in_progress: 'yellow', 'in-work': 'yellow', stuck: 'red', ready: 'green', delivered: 'grey' };
  var BLOCK_KIND_LABEL = { stuck: 'תקועה', contact_client: 'ליצור קשר עם הלקוח' };

  /* תאימות: "חסומה" = תקועה */
  function isBlocked(o) { return !!(o && o.status === 'stuck'); }
  function hasContact(o) { return !!(o && o.contact && !o.contact.resolvedAt); }

  /* מראה הזמנה: הצבע והתווית של הסטטוס. reason = למה תקועה */
  function orderLook(o) {
    var st = o && o.status;
    return { key: st, color: STATUS_COLOR[st] || 'grey', label: STATUS_LABEL[st] || '',
      reason: st === 'stuck' && o.stuck ? (o.stuck.reason || '') : '', status: st, statusLabel: STATUS_LABEL[st] || '' };
  }
  function statusVar(color) { return 'var(--st-' + color + ')'; }

  /* =========================================================================
   * תאריכים
   * ======================================================================= */
  var DAY = 86400000;
  function startOfDay(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); return x; }
  function daysSince(iso) { return iso ? Math.floor((Date.now() - new Date(iso).getTime()) / DAY) : 0; }
  /* ימים עד התאריך (0 = היום, שלילי = עבר) לפי ימים קלנדריים */
  function daysUntil(iso) {
    if (!iso) return null;
    return Math.round((startOfDay(iso) - startOfDay(new Date())) / DAY);
  }
  function isToday(iso) { return !!iso && startOfDay(iso).getTime() === startOfDay(new Date()).getTime(); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return p2(d.getDate()) + '.' + p2(d.getMonth() + 1) + '.' + d.getFullYear();
  }
  function fmtDateShort(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return p2(d.getDate()) + '.' + p2(d.getMonth() + 1);
  }
  function fmtTime(iso) { if (!iso) return ''; var d = new Date(iso); return p2(d.getHours()) + ':' + p2(d.getMinutes()); }
  function toDateInput(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate());
  }
  function fromDateInput(v) {
    if (!v) return null;
    var parts = v.split('-');
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]), 12, 0, 0);
    return d.toISOString();
  }
  /* טקסט יחסי למועד מסירה: "היום" / "מחר" / "עוד 3 ימים" / "באיחור 2 ימים" */
  function dueText(iso) {
    var n = daysUntil(iso);
    if (n == null) return '';
    if (n === 0) return 'היום';
    if (n === 1) return 'מחר';
    if (n > 1) return 'עוד ' + n + ' ימים';
    if (n === -1) return 'באיחור יום';
    return 'באיחור ' + (-n) + ' ימים';
  }

  /* =========================================================================
   * כסף. בסדנה (role=workshop) מחזיר מחרוזת ריקה: רשת ביטחון ל-D3 (אין ₪ בסדנה).
   * ======================================================================= */
  function fmtMoney(n) {
    if (role() === 'workshop') return '';
    return '₪' + Number(n || 0).toLocaleString('he-IL');
  }

  function plural(n, one, many) { n = Number(n) || 0; return n === 1 ? one : n + ' ' + many; }
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function fmtSize(w, h) { return (w || h) ? (Number(w || 0) + '×' + Number(h || 0)) : ''; }
  function consumption(w, h) { return (Number(w || 0) + Number(h || 0)) * 2; }

  /* C37: צבע שם לקוח לפי מספר ביקורים. 2 = צהוב, 3+ = ירוק. */
  function visitTone(n) { return n >= 3 ? 'green' : (n === 2 ? 'yellow' : ''); }
  /* סבב 5: שם ירוק (3+ ביקורים) מקבל תווית "לקוח חוזר" משמאלו (ב-RTL: אחריו ב-DOM). צהוב בלי תווית. */
  function returningTag(n) { return n >= 3 ? '<span class="tag-return">לקוח חוזר</span>' : ''; }

  /* =========================================================================
   * תאימות v1 (המודולים הישנים): urgency, dayNumber, תשלומים שטוחים
   * ======================================================================= */
  function openedAt(o) { return o.openedAt || o.createdAt; }
  function dueAt(o) { return o.deliveryTarget || o.dueDate; }
  function dayNumber(o) { return Math.max(1, daysSince(openedAt(o))); }
  function urgency(o) {
    var look = orderLook(o);
    if (o.status === 'delivered') return { color: 'grey', level: 'delivered' };
    if (o.status === 'ready') return { color: look.color, level: 'ready' };
    var n = daysUntil(dueAt(o));
    if (n != null && n < 0) return { color: look.color, level: 'late' };
    if (n != null && n <= 2) return { color: look.color, level: 'warn' };
    return { color: look.color, level: 'ok' };
  }
  function displayColor(o) { return orderLook(o).color; }
  function dayChipClass(o) { var lv = urgency(o).level; return lv === 'late' ? 'late' : (lv === 'warn' ? 'warn' : 'neutral'); }

  var PAY_METHODS = ['מזומן', 'אשראי', 'אחר', 'לא צוין'];
  var PAY_TYPES = ['מקדמה', 'תשלום סופי'];
  function paymentsForOrder(order, payments) { return (order && payments) ? payments.filter(function (p) { return p.orderId === order.id; }) : []; }
  function paidFor(order, payments) {
    if (order && order.payments && !payments) return Gallery.data.orders.paid(order);
    return paymentsForOrder(order, payments).reduce(function (s, p) { return s + Number(p.amount || 0); }, 0);
  }
  function balanceOf(order, payments) { return Number(order && order.price || 0) - paidFor(order, payments); }
  function paymentStatus(order, payments) {
    var price = Number(order && order.price || 0), paid = paidFor(order, payments);
    if (paid <= 0) return { key: 'unpaid', label: 'לא שולם', color: 'red' };
    if (paid < price) return { key: 'partial', label: 'שולם חלקית', color: 'orange' };
    return { key: 'paid', label: 'שולם', color: 'green' };
  }

  /* דוגמית צבע עץ (placeholder עד שיש תמונה אמיתית) */
  var WOOD_BASE = { 'אלון': '#C79A5E', 'אשור': '#D9BE93', 'ליבנה': '#E5D6B4', 'אורן': '#E6C583', 'אגוז': '#7A4A2B', 'מייפל': '#E4C7A1', 'אלומיניום': '#B9BDC4' };
  function woodSwatch(p) {
    var color = (p && p.color) || '';
    var hex = WOOD_BASE[(p && p.woodType)] || '#C9A97E';
    if (/שחור/.test(color)) hex = '#39332D';
    else if (/לבן|קרם|שנהב|שמנת/.test(color)) hex = '#EDE5D9';
    else if (/אפור|פחם|סקנדינבי/.test(color)) hex = '#B7B8BE';
    else if (/מוזהב|זהב|שמפניה/.test(color)) hex = '#E4C476';
    else if (/כסף|פלטינה/.test(color)) hex = '#D6D9DF';
    else if (/ברונזה|מוקה|ונגה|כהה/.test(color)) hex = '#6E4A2E';
    return 'linear-gradient(140deg, rgba(255,255,255,.30), rgba(255,255,255,0) 38%),' +
           'linear-gradient(140deg, ' + hex + ' 0%, ' + hex + ' 42%, rgba(20,16,12,.42) 100%)';
  }

  /* =========================================================================
   * הודעות וואטסאפ (חתומות בשם החנות)
   * ======================================================================= */
  function custOf(o) {
    var c = (Gallery.data && Gallery.data.customers) ? Gallery.data.customers.peekOne(o.customerId) : null;
    return c || { name: o.customerName || '', phone: o.phone || '' };
  }
  function shopSig() { var s = settings().shop || {}; return (s.name || 'הגלריה') + ' · ' + (s.phone || ''); }

  /* C11: עותק הזמנה (לא קבלה). אומר ללקוח מה מספר ההזמנה שלו. */
  function msgOrderCopy(o) {
    var c = custOf(o);
    var lines = ['שלום ' + (c.name || '') + ',', 'כאן ' + (settings().shop.name || 'הגלריה') + '. זה עותק ההזמנה שלך:', '',
      'מספר הזמנה: ' + o.number];
    (o.items || []).forEach(function (it) {
      var parts = [it.desc || 'תמונה'];
      if (it.widthCm || it.heightCm) parts.push(fmtSize(it.widthCm, it.heightCm) + ' ס"מ');
      if (it.profileSku) parts.push('מסגרת ' + it.profileSku);
      if (it.mat) parts.push('מט');
      if (it.mount) parts.push('הדבקה');
      lines.push('• ' + parts.join(' · '));
    });
    if (o.dueDate) lines.push('', 'מועד מסירה משוער: ' + fmtDate(o.dueDate));
    if (o.price) {
      var paid = Gallery.data.orders.paid(o);
      lines.push('מחיר: ' + fmtMoney(o.price) + ' | שולם: ' + fmtMoney(paid) + ' | ' + (o.price - paid < 0 ? 'שולם ביתר: ' + fmtMoney(paid - o.price) : 'יתרה: ' + fmtMoney(o.price - paid)));
    }
    lines.push('', 'עותק זה אינו קבלה.', shopSig());
    return lines.join('\n');
  }
  function msgReady(o) {
    var c = custOf(o);
    var s = settings().shop;
    var bal = (o.payments ? Gallery.data.orders.balance(o) : Number(o.balance || 0));
    return 'היי ' + (c.name || '') + ', כאן ' + (s.name || 'הגלריה') + '. ' +
      'ההזמנה שלך (מס\' ' + (o.number || o.orderNo) + ') מוכנה ואפשר לבוא לקחת. ' +
      (s.hours ? 'שעות הפתיחה: ' + s.hours + '. ' : '') +
      (bal > 0 ? 'נותרה יתרה לתשלום: ' + fmtMoney(bal) + '. ' : '') + 'נשמח לראותך.';
  }
  function msgReceipt(r) {
    var lines = ['קבלה מס\' ' + r.number + ' על סך ' + fmtMoney(r.amount) + ' (' + fmtDate(r.at) + ').'];
    if (r.url) lines.push('לצפייה בקבלה: ' + r.url);
    return lines.join('\n');
  }
  /* C12: בתשלום שולחים גם את ההזמנה וגם את הקבלה */
  function msgOrderAndReceipt(o, r) { return msgOrderCopy(o) + '\n\n' + msgReceipt(r); }

  /* =========================================================================
   * וואטסאפ (C14 / D8)
   * ======================================================================= */
  function phoneIntl(phone) {
    var d = String(phone || '').replace(/\D/g, '');
    if (!d) return '';
    if (d.indexOf('972') === 0) return d;
    if (d.charAt(0) === '0') return '972' + d.slice(1);
    return d;
  }
  function waLink(phone, text) {
    var p = phoneIntl(phone);
    return 'https://wa.me/' + p + '?text=' + encodeURIComponent(text || '');
  }
  function deviceKind() {
    var nav = global.navigator || {};
    var ua = nav.userAgent || '';
    var iPadOS = nav.platform === 'MacIntel' && nav.maxTouchPoints > 1;
    if (/iPad|iPhone|iPod/.test(ua) || iPadOS) return 'ios';
    if (/Android/i.test(ua)) return 'android';
    return 'desktop';
  }
  /* Gallery.whatsapp(phone, text) -> מצב שבו נפתח ('app'|'web'|'wame').
     auto: אייפד/אייפון/אנדרואיד = אפליקציה (whatsapp://), מחשב = web.whatsapp.com
     בחלון קבוע 'gallery-wa' (אותה לשונית נפתחת שוב). נפילה ל-wa.me. */
  function whatsapp(phone, text) {
    var p = phoneIntl(phone);
    var t = encodeURIComponent(text || '');
    var wame = 'https://wa.me/' + p + '?text=' + t;
    // R3: תמיד אוטומטי (אין יותר בחירה בהגדרות). אייפד/טלפון = אפליקציה, מחשב = וואטסאפ ווב בלשונית קבועה.
    var mode = deviceKind() === 'desktop' ? 'web' : 'app';

    if (mode === 'app') {
      var appUrl = 'whatsapp://send?' + (p ? 'phone=' + p + '&' : '') + 'text=' + t;
      var left = false;
      var onHide = function () { if (document.hidden) left = true; };
      document.addEventListener('visibilitychange', onHide);
      global.location.href = appUrl;
      global.setTimeout(function () {
        document.removeEventListener('visibilitychange', onHide);
        if (!left && !document.hidden) global.open(wame, '_blank');
      }, 1800);
      return 'app';
    }
    if (mode === 'web') {
      var webUrl = 'https://web.whatsapp.com/send?' + (p ? 'phone=' + p + '&' : '') + 'text=' + t;
      var w = global.open(webUrl, 'gallery-wa');
      if (w) { try { w.focus(); } catch (e) {} return 'web'; }
    }
    var w2 = global.open(wame, '_blank');
    if (!w2 && Gallery.toast) Gallery.toast('הדפדפן חסם את פתיחת וואטסאפ. צריך לאפשר חלונות קופצים.');
    return 'wame';
  }
  Gallery.whatsapp = whatsapp;

  Gallery.util = {
    STATUS_LABEL: STATUS_LABEL, STATUS_LIST: STATUS_LIST, STATUS_COLOR: STATUS_COLOR, BLOCK_KIND_LABEL: BLOCK_KIND_LABEL,
    isBlocked: isBlocked, hasContact: hasContact, orderLook: orderLook, statusVar: statusVar, returningTag: returningTag,
    daysSince: daysSince, daysUntil: daysUntil, isToday: isToday, startOfDay: startOfDay, dueText: dueText,
    fmtDate: fmtDate, fmtDateShort: fmtDateShort, fmtTime: fmtTime, toDateInput: toDateInput, fromDateInput: fromDateInput,
    fmtMoney: fmtMoney, fmtSize: fmtSize, plural: plural, esc: esc, consumption: consumption, visitTone: visitTone,
    woodSwatch: woodSwatch, phoneIntl: phoneIntl, waLink: waLink, deviceKind: deviceKind,
    msgOrderCopy: msgOrderCopy, msgReady: msgReady, msgReceipt: msgReceipt, msgOrderAndReceipt: msgOrderAndReceipt,
    msgCopy: msgOrderCopy,
    /* תאימות v1 */
    dayNumber: dayNumber, urgency: urgency, displayColor: displayColor, dayChipClass: dayChipClass,
    PAY_METHODS: PAY_METHODS, PAY_TYPES: PAY_TYPES,
    paymentsForOrder: paymentsForOrder, paidFor: paidFor, balanceOf: balanceOf, paymentStatus: paymentStatus
  };

})(window);
