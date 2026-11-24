/* =============================================================================
 * data/collections.js  -  ה-API הציבורי של הנתונים: Gallery.data.<collection>
 * OWNER: foundation (wave 2). ב-wave 3 לא עורכים. פונקציה חסרה? קובץ חדש
 * js/data-ext-<module>.js שמוסיף ל-Gallery.data.<collection> (ראו v2-contract.md).
 * -----------------------------------------------------------------------------
 * כל קולקשן חושף את אותו בסיס:
 *   list() -> Promise<Array>        get(id) -> Promise<rec|null>
 *   save(rec) -> Promise<rec>       remove(id) -> Promise<true>
 *   subscribe(cb) -> unsubscribe    (cb(array) מיד אחרי ready ובכל שינוי, גם מלשונית אחרת)
 *   peek() -> Array (סינכרוני)       peekOne(id) -> rec|null (סינכרוני)
 * ועוד פונקציות דומיין לפי הקולקשן. orders מוגדר בקובץ נפרד: data/orders-model.js
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var S = Gallery.store;
  var P = function (v) { return Promise.resolve(v); };

  function makeCollection(name, extras) {
    var api = {
      name: name,
      list: function () { return S.ready.then(function () { return S.all(name); }); },
      get: function (id) { return S.ready.then(function () { return S.find(name, id); }); },
      save: function (rec) { return S.ready.then(function () { return S.put(name, rec); }); },
      remove: function (id) { return S.ready.then(function () { return S.del(name, id); }); },
      subscribe: function (cb) { return S.subscribe(name, cb); },
      peek: function () { return S.all(name); },
      peekOne: function (id) { return S.find(name, id); }
    };
    return Object.assign(api, extras || {});
  }

  function digits(phone) { return String(phone || '').replace(/\D/g, ''); }
  function normPhone(phone) {
    var d = digits(phone);
    if (d.indexOf('972') === 0) d = '0' + d.slice(3);
    return d;
  }

  var data = Gallery.data = Gallery.data || {};
  data.makeCollection = makeCollection;
  data.ready = S.ready;

  /* =========================================================================
   * customers  { id, name, phone, notes }
   * ======================================================================= */
  data.customers = makeCollection('customers', {
    findByPhone: function (phone) {
      var n = normPhone(phone);
      if (!n) return null;
      return S.all('customers').filter(function (c) { return normPhone(c.phone) === n; })[0] || null;
    },
    /* מוצא לקוח לפי טלפון (או id) ומעדכן שם, אחרת יוצר חדש. לא דורס notes. */
    upsert: function (c) {
      return S.ready.then(function () {
        var existing = (c.id && S.find('customers', c.id)) || data.customers.findByPhone(c.phone);
        var rec = Object.assign({ notes: '' }, existing || {}, c);
        if (existing) rec.id = existing.id;
        return S.put('customers', rec);
      });
    },
    nameOf: function (id) { var c = S.find('customers', id); return c ? c.name : ''; },
    /* C37: ביקור = הזמנה או קניית מוצר. */
    visitCount: function (customerId) {
      if (!customerId) return 0;
      var o = S.all('orders').filter(function (x) { return x.customerId === customerId; }).length;
      var s = S.all('sales').filter(function (x) { return x.customerId === customerId; }).length;
      return o + s;
    }
  });

  /* =========================================================================
   * מלאי
   * frames        { id, sku, woodType, color, supplierId, stockUnits (ס"מ), minThreshold (ס"מ),
   *                 unit, costPerCm, rodLengthCm, photo, note }
   * rawMaterials  { id, name, unit, qty, minQty, supplierId, note }
   * products      { id, name, price, size, kind:'oil'|'original'|'print'|'other', frame, qty, sticker, note, soldAt? }
   * ======================================================================= */
  data.frames = makeCollection('frames', {
    findBySku: function (sku) {
      var s = String(sku || '').trim();
      if (!s) return null;
      return S.all('frames').filter(function (f) { return f.sku === s; })[0] || null;
    },
    isLow: function (f) { return Number(f.stockUnits || 0) < Number(f.minThreshold || 0); },
    lowStock: function () { return S.all('frames').filter(data.frames.isLow); },
    remainingMeters: function (f) { return Math.round(Number(f.stockUnits || 0)) / 100; },
    /* שינוי מלאי בס"מ (שלילי = צריכה). */
    adjust: function (frameId, deltaCm) {
      return S.ready.then(function () {
        var f = S.find('frames', frameId);
        if (!f) return null;
        f.stockUnits = Math.max(0, Number(f.stockUnits || 0) + Number(deltaCm || 0));
        return S.put('frames', f);
      });
    }
  });

  data.rawMaterials = makeCollection('rawMaterials', {
    isLow: function (r) { return Number(r.qty || 0) < Number(r.minQty || 0); },
    lowStock: function () { return S.all('rawMaterials').filter(data.rawMaterials.isLow); }
  });

  data.PRODUCT_KINDS = { oil: 'ציור שמן', original: 'ציור מקורי', print: 'הדפס', other: 'אחר' };
  data.products = makeCollection('products', {
    available: function () { return S.all('products').filter(function (p) { return Number(p.qty || 0) > 0; }); }
  });

  /* =========================================================================
   * ספקים  { id, name, contactName, phone, email, note, kind:'frames'|'raw' }
   * supplierOrderLines { id, supplierId, itemType:'frame'|'raw', itemId, label,
   *                      qtyRods (מסגרות) | qty (חומרי גלם), source:'worktable'|'low_stock'|'manual',
   *                      orderId?, itemRowId?, createdAt, sentAt? }
   * ======================================================================= */
  /* R3: לספק יש סוג. kind: 'frames' (ספקי מסגרות: פרופילי אברהם, סילבר, יוני) | 'raw' (ספקי חומרי גלם).
     רשומות ישנות בלי kind לא נכתבות מחדש (מיגרציה בקריאה בלבד): שלושת המזהים הקבועים = frames,
     ספק אחר = raw אם רק חומרי גלם מפנים אליו, אחרת frames. */
  var FRAME_SUPPLIER_IDS = ['sup-avraham', 'sup-silver', 'sup-yoni'];
  data.SUPPLIER_KINDS = { frames: 'ספקי מסגרות', raw: 'ספקי חומרי גלם' };
  data.suppliers = makeCollection('suppliers', {
    FRAME_IDS: FRAME_SUPPLIER_IDS,
    kindOf: function (s) {
      if (!s) return null;
      if (s.kind === 'frames' || s.kind === 'raw') return s.kind;
      if (FRAME_SUPPLIER_IDS.indexOf(s.id) !== -1) return 'frames';
      var usedByFrames = S.all('frames').some(function (f) { return f.supplierId === s.id; });
      var usedByRaw = S.all('rawMaterials').some(function (r) { return r.supplierId === s.id; });
      return (usedByRaw && !usedByFrames) ? 'raw' : 'frames';
    },
    ofKind: function (kind) {
      return S.all('suppliers').filter(function (s) { return data.suppliers.kindOf(s) === kind; });
    },
    frameSuppliers: function () { return data.suppliers.ofKind('frames'); },
    rawSuppliers: function () { return data.suppliers.ofKind('raw'); },
    /* ספק חומרי גלם חדש (טופס חומר גלם / טאב ספקים) */
    createRaw: function (p) {
      return S.ready.then(function () {
        return S.put('suppliers', { name: String(p.name || '').trim(), contactName: String(p.contactName || '').trim(),
          phone: String(p.phone || '').trim(), email: String(p.email || '').trim(), note: String(p.note || '').trim(), kind: 'raw' });
      });
    }
  });

  function itemOf(type, id) { return type === 'raw' ? S.find('rawMaterials', id) : S.find('frames', id); }

  data.supplierOrderLines = makeCollection('supplierOrderLines', {
    /* הוספה חכמה (גם Gallery.addSupplierLine):
       - supplierId ו-label נגזרים מהפריט אם לא נמסרו.
       - אם קיימת שורה שלא נשלחה עם אותו itemType+itemId+source+orderId, הכמות שלה
         מוחלפת (לא מצטברת). כך לחיצה חוזרת על X לא מכפילה הזמנה. */
    add: function (line) {
      return S.ready.then(function () {
        var l = Object.assign({ itemType: 'frame', source: 'manual', orderId: null }, line);
        var item = itemOf(l.itemType, l.itemId);
        if (!l.supplierId && item) l.supplierId = item.supplierId || null;
        if (!l.label && item) l.label = l.itemType === 'raw' ? item.name : (item.sku + ' ' + (item.woodType || '') + ' ' + (item.color || '')).trim();
        if (l.itemType === 'frame' && l.qtyRods == null) l.qtyRods = Number(l.qty || 1);
        if (l.itemType === 'raw' && l.qty == null) l.qty = 1;
        var same = S.all('supplierOrderLines').filter(function (x) {
          return !x.sentAt && x.itemType === l.itemType && x.itemId === l.itemId &&
            x.source === l.source && (x.orderId || null) === (l.orderId || null) &&
            (x.itemRowId || null) === (l.itemRowId || null);
        })[0];
        if (same) l = Object.assign(same, l, { id: same.id });
        return S.put('supplierOrderLines', l);
      });
    },
    pending: function (supplierId) {
      return S.all('supplierOrderLines').filter(function (x) {
        return !x.sentAt && (!supplierId || x.supplierId === supplierId);
      });
    },
    markSent: function (supplierId) {
      return S.ready.then(function () {
        var now = new Date().toISOString();
        data.supplierOrderLines.pending(supplierId).forEach(function (x) { x.sentAt = now; S.put('supplierOrderLines', x); });
        return true;
      });
    }
  });

  /* =========================================================================
   * מכירות מוצרים  { id, productId, customerId, price, at, receiptId }
   * ======================================================================= */
  data.sales = makeCollection('sales', {
    /* יוצר מכירה ומוריד כמות מהמוצר (soldAt נחתם כשהכמות מגיעה ל-0).
       הקבלה מונפקת בנפרד: Gallery.receipts.issueReceipt({source:'sale', refId: sale.id, ...}) */
    create: function (p) {
      return S.ready.then(function () {
        var now = new Date().toISOString();
        var sale = S.put('sales', { productId: p.productId, customerId: p.customerId || null, price: Number(p.price || 0), at: p.at || now, receiptId: null });
        var prod = S.find('products', p.productId);
        if (prod) {
          prod.qty = Math.max(0, Number(prod.qty || 0) - 1);
          if (prod.qty === 0) prod.soldAt = now;
          S.put('products', prod);
        }
        return sale;
      });
    }
  });

  /* =========================================================================
   * קבלות (D9, קבלה מדומה עד Paperless)
   * receipts { id, number, at, customerId, amount, method:'cash'|'credit'|'other'|null,
   *            source:'order'|'sale', refId, paymentId?, sentToCustomer, url, provider }
   * ======================================================================= */
  data.RECEIPT_METHODS = { cash: 'מזומן', credit: 'אשראי', other: 'אחר' };
  data.receipts = makeCollection('receipts', {
    byRef: function (refId) { return S.all('receipts').filter(function (r) { return r.refId === refId; }); }
  });

  /* ספק קבלות מדומה. Paperless אמיתי = להחליף את Gallery.receipts.provider
     באובייקט עם issue(payload) -> Promise<{number, url}>. */
  var SimulatedProvider = {
    name: 'simulated',
    issue: function (payload) {
      return S.nextNumberAsync('receipts', 1001).then(function (number) { return { number: number, url: '' }; });
    }
  };

  Gallery.receipts = {
    provider: SimulatedProvider,
    METHODS: data.RECEIPT_METHODS,
    /* נקודת ההחלפה היחידה. payload:
       { source:'order'|'sale', refId, paymentId?, customerId, amount, method:'cash'|'credit'|'other'|null }
       מחזיר Promise<receipt>. מקשר את הקבלה חזרה לתשלום בהזמנה או למכירה. */
    issueReceipt: function (payload) {
      return S.ready.then(function () {
        return Promise.resolve(Gallery.receipts.provider.issue(payload));
      }).then(function (res) {
        var rec = S.put('receipts', {
          number: res.number, at: new Date().toISOString(),
          customerId: payload.customerId || null, amount: Number(payload.amount || 0),
          method: payload.method || null, source: payload.source, refId: payload.refId,
          paymentId: payload.paymentId || null, sentToCustomer: false,
          url: res.url || '', provider: Gallery.receipts.provider.name
        });
        if (payload.source === 'order' && payload.paymentId) {
          var o = S.find('orders', payload.refId);
          if (o) {
            (o.payments || []).forEach(function (p) { if (p.id === payload.paymentId) p.receiptId = rec.id; });
            S.put('orders', o);
          }
        } else if (payload.source === 'sale') {
          var s = S.find('sales', payload.refId);
          if (s) { s.receiptId = rec.id; S.put('sales', s); }
        }
        return rec;
      });
    },
    markSent: function (receiptId) {
      return S.ready.then(function () {
        var r = S.find('receipts', receiptId);
        if (!r) return null;
        r.sentToCustomer = true;
        return S.put('receipts', r);
      });
    },
    methodLabel: function (m) { return data.RECEIPT_METHODS[m] || 'לא צוין'; }
  };

  /* =========================================================================
   * הוצאות (C34, ללא שינוי) { id, amount, category, note, supplierId?, date }
   * צריכה (היסטוריית מלאי) { id, profileId, profileSku, orderId, orderNo, amount (ס"מ), date }
   * ======================================================================= */
  data.expenses = makeCollection('expenses');
  data.usage = makeCollection('usage');

  /* =========================================================================
   * כללי תזכורות (C27)
   * { id, label, status:'new'|'in_progress'|'ready'|'open', anchor:'created'|'due',
   *   offset:{ value (חתום: שלילי = לפני העוגן, חיובי = אחרי), unit:'hours'|'days' }, active }
   * status 'open' = חדשה או בעבודה (לא מוכנה ולא נמסרה).
   * ======================================================================= */
  data.reminderRules = makeCollection('reminderRules', {
    defaults: function () {
      return [
        { id: 'rule-due-3d', label: '3 ימים לפני מועד המסירה', status: 'open', anchor: 'due', offset: { value: -3, unit: 'days' }, active: true },
        { id: 'rule-open-7d', label: 'שבוע מהפתיחה ועדיין לא מוכנה', status: 'open', anchor: 'created', offset: { value: 7, unit: 'days' }, active: true },
        { id: 'rule-new-48h', label: 'עבודה חדשה שלא התחילה 48 שעות', status: 'new', anchor: 'created', offset: { value: 48, unit: 'hours' }, active: true },
        { id: 'rule-ready-2d', label: 'מוכנה ולא נאספה יומיים אחרי מועד המסירה', status: 'ready', anchor: 'due', offset: { value: 2, unit: 'days' }, active: true }
      ];
    },
    /* מתי הכלל "נדלק" עבור הזמנה (Date) */
    fireAt: function (rule, order) {
      var base = rule.anchor === 'due' ? order.dueDate : order.createdAt;
      if (!base) return null;
      var ms = Number(rule.offset && rule.offset.value || 0) * (rule.offset && rule.offset.unit === 'hours' ? 3600000 : 86400000);
      return new Date(new Date(base).getTime() + ms);
    },
    statusMatches: function (rule, order) {
      if (order.status === 'delivered') return false;
      if (rule.status === 'open') return order.status === 'new' || order.status === 'in_progress';
      return order.status === rule.status;
    },
    /* האם הכלל פעיל כרגע על ההזמנה */
    matches: function (rule, order, now) {
      if (!rule.active || !data.reminderRules.statusMatches(rule, order)) return false;
      var at = data.reminderRules.fireAt(rule, order);
      return !!at && at.getTime() <= (now || Date.now());
    }
  });

  /* =========================================================================
   * reminderOrder (C26): סדר עדיפות ידני. מסמך יחיד { ids: [reminderId...] }
   * מזהה תזכורת מוצע: '<ruleId>:<orderId>' או 'flag:<orderId>'.
   * ======================================================================= */
  data.reminderOrder = {
    get: function () { return S.ready.then(function () { return (S.getDoc('reminderOrder') || { ids: [] }).ids || []; }); },
    peek: function () { return ((S.getDoc('reminderOrder') || {}).ids || []).slice(); },
    set: function (ids) { return S.ready.then(function () { S.setDoc('reminderOrder', { ids: (ids || []).slice() }); return ids; }); },
    subscribe: function (cb) { return S.subscribe('reminderOrder', function (doc) { cb((doc && doc.ids) || []); }); }
  };

  /* =========================================================================
   * settings: מסמך יחיד
   * ======================================================================= */
  data.SETTINGS_DEFAULTS = {
    shop: {
      name: 'הגלריה',
      owner: 'אסף',
      address: "רח' רוטשילד 64/2 כפר-סבא (מול השופרסל)",
      phone: '09-7674829',
      vatId: '050598721',
      hours: 'ימים א׳ עד ה׳ 9:00 עד 18:00, ו׳ 9:00 עד 13:00'
    },
    // R3: whatsappMode הוסר. הפתיחה אוטומטית תמיד (util.js). שדה ישן במסמך נשאר ולא נקרא.
    adminPin: '1234',
    slaDays: 10,
    lastBackupAt: null
  };
  function mergedSettings() {
    var s = S.getDoc('settings') || {};
    var d = data.SETTINGS_DEFAULTS;
    return Object.assign({}, S.clone(d), s, { shop: Object.assign({}, d.shop, s.shop || {}) });
  }
  data.settings = {
    get: function () { return S.ready.then(mergedSettings); },
    peek: mergedSettings,
    update: function (patch) {
      return S.ready.then(function () {
        var cur = mergedSettings();
        var next = Object.assign({}, cur, patch || {});
        if (patch && patch.shop) next.shop = Object.assign({}, cur.shop, patch.shop);
        S.setDoc('settings', next);
        return next;
      });
    },
    subscribe: function (cb) { return S.subscribe('settings', function () { cb(mergedSettings()); }); }
  };

  /* =========================================================================
   * גיבוי / ניקוי: עטיפות נוחות
   * ======================================================================= */
  data.KEEP_ON_WIPE = ['suppliers', 'reminderRules'];
  data.exportAll = function () { return S.ready.then(S.exportAll); };
  data.importAll = function (dump) { return S.ready.then(function () { return S.importAll(dump); }); };
  data.wipeDemo = function () {
    return S.ready.then(function () {
      S.wipeAll(data.KEEP_ON_WIPE);
      // R3: ספקי דוגמה (חומרי גלם) לא נשארים אחרי איפוס מלא
      S.all('suppliers').forEach(function (s) { if (s.demo) S.del('suppliers', s.id); });
      return true;
    });
  };

  /* hook נתונים גלובלי (חוזה): הוספת שורה לרשימת ההזמנה של ספק */
  Gallery.addSupplierLine = function (line) { return data.supplierOrderLines.add(line); };

  /* ברירות מחדל שנכתבות פעם אחת (לא דמו): כללי תזכורות */
  S.onBeforeReady(function () {
    var meta = S.getDoc('meta') || {};
    if (!meta.rulesInit) {
      if (S.all('reminderRules').length === 0) data.reminderRules.defaults().forEach(function (r) { S.put('reminderRules', r); });
      meta.rulesInit = true;
      S.setDoc('meta', meta);
    }
  });

})(window);
