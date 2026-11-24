/* =============================================================================
 * data/trash.js  -  סל מחזור: מחיקה רכה לכל הקולקשנים (R3)
 * -----------------------------------------------------------------------------
 * מחיקה לא מוחקת: הרשומה עוברת לקולקשן 'trash' (מסונכרן בענן כמו כל קולקשן אחר):
 *   { id, collection, record, deletedAt, label, role, parentId?, itemId? }
 * שחזור מחזיר את הרשומה עם אותו id, כך שכל הקישורים (שורות ספק, צריכה, קבלות) חוזרים לבד.
 * אין מחיקה מדורגת (cascade): מחיקת הזמנה לא נוגעת בשורות הספק / צריכה / קבלות שלה.
 *
 * סוגים מיוחדים (לא קולקשן):
 *   collection 'payment'  = תשלום בתוך הזמנה. parentId = orderId, record = התשלום.
 *   collection 'itemNote' = הערה על שורת תמונה. parentId = orderId, itemId, record = { note }.
 *
 * API:  Gallery.data.trash.move(collection, id, label) -> Promise<entry>
 *       .movePayment(orderId, paymentId, label) / .moveItemNote(orderId, itemId, label)
 *       .restore(trashId) -> Promise<{ ok, entry, reason? }>
 *       .purge(trashId)   (מחיקה לצמיתות)      .purgeOld(days = 30)
 *       .visible(role?) -> רשומות שהתפקיד רשאי לראות ולשחזר (סדנה: רק מה שהיא יכולה למחוק)
 *       .typeLabel(entry)
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var S = Gallery.store;
  var data = Gallery.data;
  var DAYS = 30;

  var TYPE_LABEL = {
    orders: 'הזמנה', customers: 'לקוח', frames: 'מסגרת', rawMaterials: 'חומר גלם', products: 'מוצר',
    suppliers: 'ספק', supplierOrderLines: 'שורה ברשימת ספק', expenses: 'הוצאה', reminderRules: 'כלל תזכורת',
    sales: 'מכירה', receipts: 'קבלה', usage: 'צריכת מלאי',
    payment: 'תשלום', itemNote: 'הערה על תמונה'
  };
  /* מה הסדנה יכולה למחוק (ולכן גם לשחזר) */
  var WORKSHOP_TYPES = ['frames', 'rawMaterials', 'supplierOrderLines', 'reminderRules', 'itemNote'];

  function now() { return new Date().toISOString(); }
  function entryBase(collection, record, label, extra) {
    return Object.assign({
      collection: collection, record: record, deletedAt: now(),
      label: String(label || '').trim() || TYPE_LABEL[collection] || 'פריט',
      role: Gallery.role || '', demo: !!(record && record.demo)
    }, extra || {});
  }

  var trash = data.makeCollection('trash', {
    DAYS: DAYS,
    TYPE_LABEL: TYPE_LABEL,
    WORKSHOP_TYPES: WORKSHOP_TYPES,
    typeLabel: function (e) { return TYPE_LABEL[e && e.collection] || 'פריט'; },
    canHandle: function (e, role) {
      role = role || Gallery.role;
      if (role === 'admin') return true;
      return WORKSHOP_TYPES.indexOf(e && e.collection) !== -1;
    },
    visible: function (role) {
      return S.all('trash').filter(function (e) { return trash.canHandle(e, role); })
        .sort(function (a, b) { return String(b.deletedAt).localeCompare(String(a.deletedAt)); });
    },

    /* מחיקה רכה של רשומה מקולקשן */
    move: function (collection, id, label) {
      return S.ready.then(function () {
        var rec = S.find(collection, id);
        if (!rec) return null;
        var entry = S.put('trash', entryBase(collection, rec, label));
        S.del(collection, id);
        return entry;
      });
    },

    /* תשלום בתוך הזמנה */
    movePayment: function (orderId, paymentId, label) {
      return S.ready.then(function () {
        var o = S.find('orders', orderId);
        if (!o) return null;
        var pay = (o.payments || []).filter(function (p) { return p.id === paymentId; })[0];
        if (!pay) return null;
        var entry = S.put('trash', entryBase('payment', pay, label, { parentId: orderId }));
        return data.orders.removePayment(orderId, paymentId).then(function () { return entry; });
      });
    },

    /* הערה על שורת תמונה (טבלת עבודה) */
    moveItemNote: function (orderId, itemId, label) {
      return S.ready.then(function () {
        var o = S.find('orders', orderId);
        var it = o && (o.items || []).filter(function (x) { return x.id === itemId; })[0];
        if (!it || !it.note) return null;
        var entry = S.put('trash', entryBase('itemNote', { note: it.note, demo: !!o.demo }, label, { parentId: orderId, itemId: itemId }));
        return data.orders.updateItem(orderId, itemId, { note: '' }).then(function () { return entry; });
      });
    },

    /* שחזור: אותו id, אותם קישורים */
    restore: function (trashId) {
      return S.ready.then(function () {
        var e = S.find('trash', trashId);
        if (!e) return { ok: false, reason: 'הפריט כבר לא בסל המחזור' };
        if (e.collection === 'payment') {
          var o = S.find('orders', e.parentId);
          if (!o) return { ok: false, entry: e, reason: 'ההזמנה של התשלום נמחקה. קודם לשחזר את ההזמנה.' };
          var has = (o.payments || []).some(function (p) { return p.id === e.record.id; });
          var p1 = has ? Promise.resolve() : data.orders.save(Object.assign(o, { payments: (o.payments || []).concat([e.record]) }));
          return p1.then(function () { S.del('trash', e.id); return { ok: true, entry: e }; });
        }
        if (e.collection === 'itemNote') {
          var o2 = S.find('orders', e.parentId);
          var it = o2 && (o2.items || []).filter(function (x) { return x.id === e.itemId; })[0];
          if (!it) return { ok: false, entry: e, reason: 'ההזמנה או התמונה כבר לא קיימות.' };
          var text = it.note ? (it.note + ' · ' + e.record.note) : e.record.note;
          return data.orders.updateItem(e.parentId, e.itemId, { note: text }).then(function () { S.del('trash', e.id); return { ok: true, entry: e }; });
        }
        if (S.COLLECTIONS.indexOf(e.collection) === -1 || e.collection === 'trash') return { ok: false, entry: e, reason: 'סוג לא מוכר' };
        if (!S.find(e.collection, e.record.id)) S.put(e.collection, e.record);
        S.del('trash', e.id);
        return { ok: true, entry: e };
      });
    },

    /* מחיקה לצמיתות */
    purge: function (trashId) {
      return S.ready.then(function () { if (S.find('trash', trashId)) S.del('trash', trashId); return true; });
    },
    purgeOld: function (days) {
      var limit = Date.now() - (days || DAYS) * 86400000;
      var n = 0;
      S.all('trash').forEach(function (e) {
        var t = new Date(e.deletedAt || e.createdAt || 0).getTime();
        if (t && t < limit) { S.del('trash', e.id); n++; }
      });
      return n;
    }
  });
  data.trash = trash;

  /* ניקוי אוטומטי: כל טעינה מוחקת לצמיתות מה שבסל יותר מ-30 יום */
  S.onBeforeReady(function () { trash.purgeOld(DAYS); });

})(window);
