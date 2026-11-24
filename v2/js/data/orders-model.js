/* =============================================================================
 * data/orders-model.js  -  Gallery.data.orders (הזמנות + שורות תמונה + תשלומים)
 * OWNER: foundation (wave 2). ב-wave 3 לא עורכים (הרחבות: js/data-ext-<module>.js).
 * -----------------------------------------------------------------------------
 * order {
 *   id, number (רץ, 1001+), customerId, createdAt, updatedAt, dueDate (ISO),
 *   status: 'new'|'in_progress'|'stuck'|'ready'|'delivered'          (סבב 5: 5 סטטוסים אמיתיים)
 *   stuck: null | { reason, since, from }       רק כש-status === 'stuck'. from = הסטטוס שלפני
 *   contact: null | { text, since, itemId?, resolvedAt:null, response:null }
 *     הערת "ליצור קשר עם הלקוח" פעילה = תזכורת עד שנרשמת תגובת הלקוח (resolveContact).
 *   blockedLog?: [ { kind:'stuck'|'contact_client', reason, since, resolvedAt, response, to? } ]  היסטוריה
 *   blocked: ישן (עד סבב 4). מומר בקריאה (migrateOrder): stuck פעיל -> status 'stuck',
 *     contact_client פעיל -> contact, שנפתר -> blockedLog. כל כתיבה שומרת את הצורה החדשה.
 *   items: [ item ],  notes, price,
 *   payments: [ { id, amount, type:'deposit'|'final', at, receiptId|null } ]    (C9, בלי אמצעי)
 *   readyAt?, deliveredAt?
 * }
 * item { id, idx (1..n), mount (הדבקה) bool, mat (מט) bool, desc, material: null|'V'|'X',
 *        widthCm, heightCm, profileSku, done bool, note }
 *
 * סטטוס נגזר (deriveStatus): "מוכנה" רק בפעולה מפורשת (setStatus('ready')).
 * כל השורות בוצעו = עדיין in_progress. שורה אחת או יותר בוצעה = in_progress.
 * ready שבוטל בה "בוצע" = חוזר ל-in_progress. סימון "בוצע" בהזמנה מוכנה משאיר אותה מוכנה.
 * stuck ו-delivered לא משתנים מהשורות.
 * "מגע ראשון" (setItemDone, או updateItem עם { start:true }) מעביר new ל-in_progress.
 * setStatus() ידני לא נוגע בשורות (סבב 5): "מוכנה" לא מסמנת בוצע, "חדשה" לא מנקה.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var S = Gallery.store;
  var data = Gallery.data;

  var ORDER_START = 1001;
  var STATUSES = ['new', 'in_progress', 'stuck', 'ready', 'delivered'];
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
    if (order.status === 'stuck') return 'stuck';
    var items = order.items || [];
    var done = items.filter(function (i) { return i.done; }).length;
    if (order.status === 'ready') return 'ready';   // סבב 5: מוכנה ידנית לא תלויה בסימוני השורות
    if (done > 0) return 'in_progress';
    if (order.status === 'in_progress') return 'in_progress';
    return 'new';
  }

  /* doneVal = הערך החדש של "בוצע" בשורה שהשתנתה. ביטול "בוצע" בהזמנה מוכנה = חוזרת לבעבודה (תיקון). */
  function applyDerived(o, doneVal) {
    if (o.status === 'ready' && doneVal === false) { o.status = 'in_progress'; o.readyAt = null; return o; }
    o.status = deriveStatus(o);
    if (o.status !== 'ready' && o.status !== 'delivered') o.readyAt = null;
    return o;
  }

  /* מגע ראשון בשורות (מתג, V/X, הערה, בוצע) = ההזמנה בעבודה */
  function startWork(o) {
    if (o.status === 'new') { o.status = 'in_progress'; o.readyAt = null; }
    return o;
  }

  /* ---- סבב 5: מיגרציה בקריאה מהצורה הישנה (blocked) לחדשה (status 'stuck' / contact) ---- */
  function sameEntry(a, b) { return a && b && a.since === b.since && a.resolvedAt === b.resolvedAt && a.kind === b.kind; }
  function migrateOrder(o) {
    if (!o || typeof o !== 'object') return o;
    var b = o.blocked;
    if (b && typeof b === 'object') {
      var since = b.since || o.updatedAt || o.createdAt || now();
      if (!b.resolvedAt) {
        if (b.kind === 'contact_client') {
          if (!(o.contact && !o.contact.resolvedAt)) o.contact = { text: b.reason || '', since: since, itemId: null, resolvedAt: null, response: null };
        } else if (o.status !== 'delivered') {
          if (o.status !== 'stuck') o.stuck = { reason: b.reason || '', since: since, from: o.status || 'in_progress' };
          else if (!o.stuck) o.stuck = { reason: b.reason || '', since: since, from: 'in_progress' };
          o.status = 'stuck';
          o.readyAt = null;
        } else {
          o.blockedLog = (o.blockedLog || []).concat([{ kind: 'stuck', reason: b.reason || '', since: since, resolvedAt: o.deliveredAt || since, response: '' }]);
        }
      } else {
        var log = o.blockedLog || [];
        var entry = { kind: b.kind || 'stuck', reason: b.reason || '', since: since, resolvedAt: b.resolvedAt, response: b.response || '' };
        if (!log.some(function (x) { return sameEntry(x, entry); })) o.blockedLog = log.concat([entry]);
      }
    }
    if (Object.prototype.hasOwnProperty.call(o, 'blocked')) o.blocked = null;
    if (o.status === 'stuck' && !o.stuck) o.stuck = { reason: '', since: o.updatedAt || now(), from: 'in_progress' };
    if (o.status !== 'stuck' && o.stuck) o.stuck = null;
    return o;
  }
  S.setMigrator('orders', migrateOrder);

  /* יציאה מ"תקועה": הסיבה נשמרת בהיסטוריה (blockedLog) */
  function leaveStuck(o, to) {
    var st = o.stuck || {};
    o.blockedLog = (o.blockedLog || []).concat([{ kind: 'stuck', reason: st.reason || '', since: st.since || o.updatedAt || now(), resolvedAt: now(), response: '', to: to }]);
    o.stuck = null;
  }

  /* B2: התגובה האחרונה להערת "ליצור קשר" שנרשמה (מתוך blockedLog). { kind, reason, response, since, resolvedAt } | null */
  function lastResponse(o) {
    if (!o) return null;
    var best = null;
    (o.blockedLog || []).forEach(function (b) {
      if (!b || !b.resolvedAt || !String(b.response || '').trim()) return;
      if (!best || String(b.resolvedAt) > String(best.resolvedAt)) best = b;
    });
    return best ? { kind: best.kind, reason: best.reason || '', response: String(best.response).trim(), since: best.since, resolvedAt: best.resolvedAt } : null;
  }

  function isStuck(o) { return !!(o && o.status === 'stuck'); }
  function hasContact(o) { return !!(o && o.contact && !o.contact.resolvedAt); }

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
    migrate: migrateOrder,
    isStuck: isStuck,
    isBlocked: isStuck,          // תאימות: "תקועה" היא עכשיו סטטוס
    hasContact: hasContact,
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
          customerId: null, notes: '', price: 0, payments: [], stuck: null, contact: null,
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
        applyDerived(o, !!done);
        startWork(o);
      });
    },
    /* עדכון חלקי לשורה (חומר V/X, הערה, מידות...). אם done בתוך patch, הסטטוס נגזר מחדש.
       opts.start = מגע מטבלת העבודה: new -> in_progress. */
    updateItem: function (orderId, itemId, patch, opts) {
      return mutate(orderId, function (o) {
        o.items.forEach(function (it, i) { if (it.id === itemId) o.items[i] = Object.assign({}, it, patch, { id: it.id }); });
        if (patch && Object.prototype.hasOwnProperty.call(patch, 'done')) applyDerived(o, !!patch.done);
        if (opts && opts.start) startWork(o);
      });
    },

    /* ---- סטטוס ידני (סבב 5) ----
       לא נוגע בשורות: "מוכנה" לא מסמנת בוצע, "חדשה" לא מנקה (המלאי נשאר כמו שהוא).
       stuck: opts.reason = למה תקועה (נשמר ב-o.stuck). יציאה מ-stuck = הסיבה עוברת ל-blockedLog.
       ready: חותם readyAt.  delivered: חותם deliveredAt. */
    setStatus: function (orderId, status, opts) {
      opts = opts || {};
      if (STATUSES.indexOf(status) === -1) return Promise.reject(new Error('bad status ' + status));
      return mutate(orderId, function (o) {
        var from = o.status;
        if (status === 'stuck') {
          var prev = from === 'stuck' ? (o.stuck || {}) : null;
          var reason = String(opts.reason == null ? '' : opts.reason).trim();
          o.stuck = { reason: reason || (prev && prev.reason) || '', since: (prev && prev.since) || now(), from: prev ? (prev.from || 'in_progress') : from };
          o.readyAt = null;
        } else if (from === 'stuck') {
          leaveStuck(o, status);
        }
        if (status === 'ready' && from !== 'ready') o.readyAt = now();
        if (status === 'new' || status === 'in_progress') o.readyAt = null;
        if (status === 'delivered' && !o.deliveredAt) o.deliveredAt = now();
        if (status !== 'delivered') o.deliveredAt = null;
        o.status = status;
      });
    },
    /* עריכת הסיבה של הזמנה תקועה */
    setStuckReason: function (orderId, reason) {
      return mutate(orderId, function (o) {
        if (o.status !== 'stuck') return;
        o.stuck = Object.assign({ since: now(), from: 'in_progress' }, o.stuck || {}, { reason: String(reason || '').trim() });
      });
    },

    /* ---- הערת "ליצור קשר עם הלקוח" (סבב 5, במקום הדגל האדום) ----
       פעילה = תזכורת עד שמישהו רושם את תגובת הלקוח. */
    setContact: function (orderId, c) {
      c = c || {};
      return mutate(orderId, function (o) {
        var prev = hasContact(o) ? o.contact : null;
        o.contact = { text: String(c.text || '').trim(), itemId: c.itemId || (prev && prev.itemId) || null,
          since: prev ? prev.since : now(), resolvedAt: null, response: null };
      });
    },
    resolveContact: function (orderId, response) {
      return mutate(orderId, function (o) {
        if (!hasContact(o)) return;
        var c = o.contact;
        o.blockedLog = (o.blockedLog || []).concat([{ kind: 'contact_client', reason: c.text || '', since: c.since, resolvedAt: now(),
          response: String(response || '').trim(), itemId: c.itemId || null }]);
        o.contact = null;
      });
    },

    /* ---- תאימות (עד סבב 4): setBlocked / resolveBlocked ממופים למודל החדש ---- */
    setBlocked: function (orderId, flag) {
      flag = flag || {};
      if (flag.kind === 'contact_client') return orders.setContact(orderId, { text: flag.reason });
      return orders.setStatus(orderId, 'stuck', { reason: flag.reason });
    },
    resolveBlocked: function (orderId, response) {
      var o = S.find('orders', orderId);
      if (hasContact(o)) return orders.resolveContact(orderId, response);
      if (isStuck(o)) {
        var to = o.stuck && o.stuck.from && o.stuck.from !== 'stuck' && o.stuck.from !== 'delivered' ? o.stuck.from : 'in_progress';
        return orders.setStatus(orderId, to);
      }
      return Promise.resolve(o);
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
