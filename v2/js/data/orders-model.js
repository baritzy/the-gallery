/* =============================================================================
 * data/orders-model.js  -  Gallery.data.orders (הזמנות + שורות תמונה + תשלומים)
 * OWNER: foundation (wave 2). ב-wave 3 לא עורכים (הרחבות: js/data-ext-<module>.js).
 * -----------------------------------------------------------------------------
 * order {
 *   id, number (רץ, 1001+), customerId, createdAt, updatedAt, dueDate (ISO),
 *   status: 'new'|'in_progress'|'ready'|'delivered',
 *   blocked: null | { kind:'stuck'|'contact_client', reason, since, resolvedAt?, response? }   (D2)
 *     פעיל = blocked && !blocked.resolvedAt. אדום מעל הסטטוס, לא משנה אותו.
 *   items: [ item ],  notes, price,
 *   payments: [ { id, amount, type:'deposit'|'final', at, receiptId|null } ]    (C9, בלי אמצעי)
 *   readyAt?, deliveredAt?
 * }
 * item { id, idx (1..n), mount (הדבקה) bool, mat (מט) bool, desc, material: null|'V'|'X',
 *        widthCm, heightCm, profileSku, done bool, note }
 *
 * סטטוס נגזר (deriveStatus, סבב 4 / A2): "מוכנה" רק בפעולה מפורשת (setStatus('ready')).
 * כל השורות בוצעו = עדיין in_progress (עבודה שיורדת לתיקון פינות לא נהיית ירוקה).
 * שורה אחת או יותר בוצעה = in_progress. ready שבוטל בה "בוצע" = חוזר ל-in_progress.
 * אף אחת = נשאר new או in_progress. delivered נשאר delivered.
 * הנגזרת מופעלת אוטומטית רק בפונקציות שמשנות שורות (setItemDone / updateItem).
 * "מגע ראשון" (setItemDone, או updateItem עם { start:true }) מעביר new ל-in_progress.
 * save() רגיל לא משנה סטטוס. setStatus() הוא המעבר הידני.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var S = Gallery.store;
  var data = Gallery.data;

  var ORDER_START = 1001;
  var STATUSES = ['new', 'in_progress', 'ready', 'delivered'];
  var PAYMENT_TYPES = { deposit: 'מקדמה', 'final': 'תשלום סופי' };

  function now() { return new Date().toISOString(); }
  function addDays(d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; }

  function newItem(partial) {
    return Object.assign({
      id: S.uid(), idx: 1, mount: false, mat: false, desc: '', material: null,
      widthCm: null, heightCm: null, profileSku: '', done: false, note: ''
    }, partial || {});
  }

  function reindex(items) {
    return (items || []).map(function (it, i) { var x = newItem(it); x.idx = i + 1; return x; });
  }

  function allDone(order) {
    var items = (order && order.items) || [];
    return items.length > 0 && items.every(function (i) { return i.done; });
  }

  /* A2: כל השורות בוצעו לא הופך ל-ready. ready נקבע רק ב-setStatus('ready'). */
  function deriveStatus(order) {
    if (!order) return 'new';
    if (order.status === 'delivered') return 'delivered';
    var items = order.items || [];
    var done = items.filter(function (i) { return i.done; }).length;
    if (order.status === 'ready') return allDone(order) ? 'ready' : 'in_progress';
    if (done > 0) return 'in_progress';
    if (order.status === 'in_progress') return 'in_progress';
    return 'new';
  }

  function applyDerived(o) {
    o.status = deriveStatus(o);
    if (o.status !== 'ready' && o.status !== 'delivered') o.readyAt = null;
    return o;
  }

  /* מגע ראשון בשורות (מתג, V/X, הערה, בוצע) = ההזמנה בעבודה */
  function startWork(o) {
    if (o.status === 'new') { o.status = 'in_progress'; o.readyAt = null; }
    return o;
  }

  /* B2: התגובה האחרונה לדגל שנפתר (מתוך blockedLog). { kind, reason, response, since, resolvedAt } | null */
  function lastResponse(o) {
    if (!o) return null;
    var log = (o.blockedLog || []).slice();
    if (o.blocked && o.blocked.resolvedAt) log.push(o.blocked);
    var best = null;
    log.forEach(function (b) {
      if (!b || !b.resolvedAt || !String(b.response || '').trim()) return;
      if (!best || String(b.resolvedAt) > String(best.resolvedAt)) best = b;
    });
    return best ? { kind: best.kind, reason: best.reason || '', response: String(best.response).trim(), since: best.since, resolvedAt: best.resolvedAt } : null;
  }

  function isBlocked(o) { return !!(o && o.blocked && !o.blocked.resolvedAt); }

  function paid(o) {
    return (o && o.payments || []).reduce(function (s, p) { return s + Number(p.amount || 0); }, 0);
  }
  function balance(o) { return Number(o && o.price || 0) - paid(o); }

  /* "1-2" = תמונה 1 מתוך 2 (כמו בדף העבודה הפיזי) */
  function itemLabel(item, order) {
    var n = (order && order.items) ? order.items.length : 1;
    return (item.idx || 1) + '-' + n;
  }

  /* כתיבת הזמנה + צריכת מלאי אוטומטית (C38): שורה שעברה ל"בוצע" מורידה מהפרופיל,
     שורה שבוטל לה "בוצע" מחזירה. הלוגיקה ב-data-ext-inventory.js (data.frameUsage.sync). */
  function commit(o) {
    var prev = o.id ? S.find('orders', o.id) : null;
    if (data.frameUsage) {
      try { data.frameUsage.sync(prev, o); } catch (e) { if (global.console) global.console.error('[gallery] frame usage sync failed', e); }
    }
    return S.put('orders', o);
  }

  /* עדכון אטומי של הזמנה לפי מזהה: mutator(o) משנה ומחזיר כלום */
  function mutate(orderId, mutator) {
    return S.ready.then(function () {
      var o = S.find('orders', orderId);
      if (!o) return null;
      o.items = o.items || [];
      o.payments = o.payments || [];
      mutator(o);
      return commit(o);
    });
  }

  var orders = data.makeCollection('orders', {
    STATUSES: STATUSES,
    PAYMENT_TYPES: PAYMENT_TYPES,
    newItem: newItem,
    reindex: reindex,
    deriveStatus: deriveStatus,
    allDone: allDone,
    lastResponse: lastResponse,
    isBlocked: isBlocked,
    paid: paid,
    balance: balance,
    itemLabel: itemLabel,

    /* save() עובר דרך commit, כדי שסימון "בוצע" בטופס העריכה יוריד / יחזיר מלאי (C38). */
    save: function (rec) { return S.ready.then(function () { return commit(S.clone(rec) || {}); }); },

    /* מספר ההזמנה הבא, להצגה בטופס (לא שומר). */
    peekNextNumber: function () { return S.peekNumber('orders', ORDER_START); },
    setNextNumber: function (n) { return S.ready.then(function () { return S.setNextNumber('orders', n); }); },

    /* יצירת הזמנה חדשה: מספר רץ, סטטוס new, dueDate ברירת מחדל +slaDays. */
    create: function (draft) {
      return S.ready.then(function () {
        var sla = data.settings.peek().slaDays || 10;
        var o = Object.assign({
          customerId: null, notes: '', price: 0, payments: [], blocked: null,
          dueDate: addDays(new Date(), sla).toISOString()
        }, draft || {});
        o.items = reindex(o.items && o.items.length ? o.items : [newItem()]);
        // מספר ייחודי בין המכשירים (Firestore: טרנזקציה). ב-local זה מיידי.
        return S.nextNumberAsync('orders', ORDER_START).then(function (n) {
          o.number = n;
          o.status = 'new';
          o.createdAt = o.createdAt || now();
          return S.put('orders', o);
        });
      });
    },

    /* ---- שורות תמונה ---- */
    /* סימון "בוצע" הוא תמיד מגע בעבודה: new -> in_progress. גם השורה האחרונה לא הופכת ל-ready (A2). */
    setItemDone: function (orderId, itemId, done) {
      return mutate(orderId, function (o) {
        o.items.forEach(function (it) { if (it.id === itemId) it.done = !!done; });
        applyDerived(o);
        startWork(o);
      });
    },
    /* עדכון חלקי לשורה (חומר V/X, הערה, מידות...). אם done בתוך patch, הסטטוס נגזר מחדש.
       opts.start = מגע מטבלת העבודה: new -> in_progress. */
    updateItem: function (orderId, itemId, patch, opts) {
      return mutate(orderId, function (o) {
        o.items.forEach(function (it, i) { if (it.id === itemId) o.items[i] = Object.assign({}, it, patch, { id: it.id }); });
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'done')) applyDerived(o);
        if (opts && opts.start) startWork(o);
      });
    },

    /* ---- סטטוס ידני ----
       ready: מסמן את כל השורות כבוצעו.  new: מנקה את כל ה"בוצע".
       in_progress: לא נוגע בשורות (למשל עבודה שירדה לתיקון פינות).
       delivered: חותם deliveredAt. */
    setStatus: function (orderId, status) {
      if (STATUSES.indexOf(status) === -1) return Promise.reject(new Error('bad status ' + status));
      return mutate(orderId, function (o) {
        if (status === 'ready') { o.items.forEach(function (it) { it.done = true; }); if (o.status !== 'ready') o.readyAt = now(); }
        if (status === 'new') { o.items.forEach(function (it) { it.done = false; }); o.readyAt = null; }
        if (status === 'in_progress') o.readyAt = null;
        if (status === 'delivered' && !o.deliveredAt) o.deliveredAt = now();
        if (status !== 'delivered') o.deliveredAt = null;
        o.status = status;
      });
    },

    /* ---- דגל אדום (D2 / C7 / C28) ---- */
    setBlocked: function (orderId, flag) {
      return mutate(orderId, function (o) {
        var prev = isBlocked(o) ? o.blocked : null;
        o.blocked = {
          kind: (flag && flag.kind) || 'stuck',
          reason: (flag && flag.reason) || '',
          since: prev ? prev.since : now(),
          resolvedAt: null, response: null
        };
      });
    },
    resolveBlocked: function (orderId, response) {
      return mutate(orderId, function (o) {
        if (!o.blocked) return;
        o.blocked.resolvedAt = now();
        o.blocked.response = response || '';
        o.blockedLog = (o.blockedLog || []).concat([o.blocked]);
      });
    },

    /* ---- תשלומים (C9) ----
       מחזיר Promise<{ order, payment }>. הקבלה מונפקת אחר כך:
       Gallery.receipts.issueReceipt({ source:'order', refId: order.id, paymentId: payment.id, ... }) */
    addPayment: function (orderId, p) {
      var payment = { id: S.uid(), amount: Math.round(Number(p.amount || 0)), type: p.type === 'final' ? 'final' : 'deposit', at: p.at || now(), receiptId: null };
      return mutate(orderId, function (o) { o.payments.push(payment); })
        .then(function (order) { return { order: order, payment: payment }; });
    },
    removePayment: function (orderId, paymentId) {
      return mutate(orderId, function (o) { o.payments = o.payments.filter(function (p) { return p.id !== paymentId; }); });
    },

    /* כל ההזמנות של לקוח */
    byCustomer: function (customerId) {
      return S.all('orders').filter(function (o) { return o.customerId === customerId; });
    }
  });

  data.orders = orders;

})(window);
