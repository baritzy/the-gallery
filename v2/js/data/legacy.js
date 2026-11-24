/* =============================================================================
 * data/legacy.js  -  שכבת תאימות זמנית: Gallery.DB + Gallery.SHOP של v1
 * OWNER: foundation (wave 2).  DEPRECATED.
 * -----------------------------------------------------------------------------
 * המודולים הישנים (inventory.js, customers.js, reminders.js, finance.js) עדיין
 * מדברים עם Gallery.DB. הקובץ הזה ממפה את הקריאות שלהם למודל v2, כדי שימשיכו
 * לעבוד עד שבעלי המודולים ב-wave 3 יעברו ל-Gallery.data. קוד חדש לא משתמש בזה.
 *
 * מיפוי עיקרי:
 *  - orders: מועשרות בשדות v1 (orderNo, customerName, phone, openedAt,
 *    deliveryTarget, imageDesc, frameDesc, profileSku, width, height).
 *  - payments: רשימה שטוחה שנגזרת מ-order.payments[] + מכירות מוצרים.
 *    method = אמצעי התשלום מהקבלה (D9), type בעברית.
 *  - profiles = frames.  usage, expenses, reorderItems = אותם קולקשנים.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var S = Gallery.store;
  var data = Gallery.data;

  /* Gallery.SHOP: אובייקט חי שמתעדכן מההגדרות (המודולים הישנים קוראים ממנו) */
  var SHOP = Gallery.SHOP = { name: 'הגלריה', owner: 'אסף', phone: '', address: '', hours: '', slaDays: 10 };
  function refreshShop() {
    var s = data.settings.peek();
    SHOP.name = s.shop.name; SHOP.owner = s.shop.owner; SHOP.phone = s.shop.phone;
    SHOP.address = s.shop.address; SHOP.hours = s.shop.hours; SHOP.vatId = s.shop.vatId;
    SHOP.slaDays = s.slaDays || 10;
  }
  S.onBeforeReady(refreshShop);
  S.subscribe('settings', refreshShop);

  var LEGACY_FIELDS = ['orderNo', 'customerName', 'phone', 'openedAt', 'deliveryTarget', 'imageDesc', 'frameDesc',
    'profileSku', 'width', 'height', 'glass', 'glassType', 'backing', 'passepartout', 'passeColor', 'deposit', 'balance'];

  function enrich(o) {
    var c = S.find('customers', o.customerId) || {};
    var items = o.items || [];
    var first = items[0] || {};
    return Object.assign({}, o, {
      orderNo: String(o.number),
      customerName: c.name || '',
      phone: c.phone || '',
      openedAt: o.createdAt,
      deliveryTarget: o.dueDate,
      imageDesc: items.map(function (i) { return i.desc; }).filter(Boolean).join(', '),
      frameDesc: items.map(function (i) { return i.profileSku; }).filter(Boolean).join(', '),
      profileSku: first.profileSku || '',
      width: first.widthCm || 0,
      height: first.heightCm || 0,
      deposit: data.orders.paid(o),
      balance: data.orders.balance(o)
    });
  }
  function strip(o) {
    var x = Object.assign({}, o);
    LEGACY_FIELDS.forEach(function (k) { delete x[k]; });
    return x;
  }
  function enrichedOrders() { return S.all('orders').map(enrich); }

  function flatPayments() {
    var receipts = {};
    S.all('receipts').forEach(function (r) { receipts[r.id] = r; });
    var out = [];
    S.all('orders').forEach(function (o) {
      (o.payments || []).forEach(function (p) {
        var r = p.receiptId ? receipts[p.receiptId] : null;
        out.push({ id: p.id, orderId: o.id, customerId: o.customerId, amount: p.amount,
          type: data.orders.PAYMENT_TYPES[p.type] || p.type,
          method: r ? Gallery.receipts.methodLabel(r.method) : 'לא צוין', date: p.at, receiptId: p.receiptId || null });
      });
    });
    S.all('sales').forEach(function (s) {
      var r = s.receiptId ? receipts[s.receiptId] : null;
      out.push({ id: 'sale-' + s.id, orderId: null, saleId: s.id, customerId: s.customerId, amount: s.price,
        type: 'מכירת מוצר', method: r ? Gallery.receipts.methodLabel(r.method) : 'לא צוין', date: s.at, receiptId: s.receiptId || null });
    });
    return out;
  }

  /* מנוי שמאזין לכמה קולקשנים ומחשב תוצאה נגזרת */
  function multiSub(keys, compute, cb) {
    var unsubs = keys.map(function (k) { return S.subscribe(k, function () { cb(compute()); }); });
    return function () { unsubs.forEach(function (u) { u(); }); };
  }

  function crud(col) {
    return {
      getAll: function () { return S.ready.then(function () { return S.all(col); }); },
      get: function (id) { return S.ready.then(function () { return S.find(col, id); }); },
      save: function (r) { return S.ready.then(function () { return S.put(col, r); }); },
      del: function (id) { return S.ready.then(function () { return S.del(col, id); }); },
      sub: function (cb) { return S.subscribe(col, cb); }
    };
  }
  var prof = crud('frames'), sup = crud('suppliers'), use = crud('usage'), exp = crud('expenses'), reo = crud('reorderItems');

  Gallery.DB = {
    /* orders */
    getOrders: function () { return S.ready.then(enrichedOrders); },
    getOrder: function (id) { return S.ready.then(function () { var o = S.find('orders', id); return o ? enrich(o) : null; }); },
    saveOrder: function (o) {
      return S.ready.then(function () {
        var cur = o.id ? S.find('orders', o.id) : null;
        if (cur && o.status && o.status !== cur.status) {
          return data.orders.setStatus(cur.id, o.status === 'in-work' ? 'in_progress' : o.status);
        }
        return S.put('orders', strip(o));
      });
    },
    deleteOrder: function (id) { return data.orders.remove(id); },
    subscribeOrders: function (cb) { return multiSub(['orders', 'customers'], enrichedOrders, cb); },
    nextOrderNumber: function () { return S.ready.then(function () { return data.orders.peekNextNumber(); }); },

    /* customers */
    getCustomers: function () { return data.customers.list(); },
    saveCustomer: function (c) {
      return S.ready.then(function () {
        var existing = c.id ? S.find('customers', c.id) : null;
        return S.put('customers', existing ? Object.assign({}, existing, c) : c);
      });
    },
    deleteCustomer: function (id) { return data.customers.remove(id); },
    subscribeCustomers: function (cb) { return data.customers.subscribe(cb); },

    /* payments (נגזר) */
    getPayments: function () { return S.ready.then(flatPayments); },
    getPayment: function (id) { return S.ready.then(function () { return flatPayments().filter(function (p) { return p.id === id; })[0] || null; }); },
    getPaymentsByOrder: function (orderId) { return S.ready.then(function () { return flatPayments().filter(function (p) { return p.orderId === orderId; }); }); },
    savePayment: function (p) {
      return data.orders.addPayment(p.orderId, { amount: p.amount, type: /סופי/.test(p.type || '') ? 'final' : 'deposit', at: p.date });
    },
    deletePayment: function (id) {
      return S.ready.then(function () {
        var hit = flatPayments().filter(function (p) { return p.id === id; })[0];
        return hit && hit.orderId ? data.orders.removePayment(hit.orderId, id) : false;
      });
    },
    subscribePayments: function (cb) { return multiSub(['orders', 'receipts', 'sales'], flatPayments, cb); },

    /* profiles = frames */
    getProfiles: prof.getAll, getProfile: prof.get, saveProfile: prof.save, deleteProfile: prof.del, subscribeProfiles: prof.sub,
    getSuppliers: sup.getAll, saveSupplier: sup.save, deleteSupplier: sup.del, subscribeSuppliers: sup.sub,
    getUsage: use.getAll, saveUsage: use.save, deleteUsage: use.del, subscribeUsage: use.sub,
    getExpenses: exp.getAll, getExpense: exp.get, saveExpense: exp.save, deleteExpense: exp.del, subscribeExpenses: exp.sub,
    getReorderItems: reo.getAll, saveReorderItem: reo.save, deleteReorderItem: reo.del, subscribeReorderItems: reo.sub
  };

})(window);
