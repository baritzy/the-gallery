/* =============================================================================
 * data/seed.js  -  נתוני דמו ל"הגלריה" v2
 * OWNER: foundation (wave 2).
 * נזרע פעם אחת בלבד (meta.seededAt). אחרי "נקה נתוני דמו" לא נזרע שוב.
 * כל השמות והטלפונים מזויפים (050-0000xxx). תאריכים יחסיים ל"היום".
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var S = Gallery.store;

  function daysAgo(n, hour) {
    var d = new Date();
    d.setHours(hour == null ? 10 : hour, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d;
  }
  function iso(d) { return d.toISOString(); }
  function plusDays(d, n) { var x = new Date(d.getTime()); x.setDate(x.getDate() + n); return x; }

  var SUP = { avraham: 'sup-avraham', silver: 'sup-silver', yoni: 'sup-yoni' };

  function seedSuppliers() {
    if (S.all('suppliers').length) return;
    [
      { id: SUP.avraham, name: 'פרופילי אברהם', contactName: 'אברהם', phone: '050-0000901', email: '', note: 'פרופילי עץ. מזמינים במוטות.' },
      { id: SUP.silver, name: 'סילבר', contactName: 'משרד סילבר', phone: '050-0000902', email: '', note: 'פרופילים מוזהבים וכסופים.' },
      { id: SUP.yoni, name: 'יוני', contactName: 'יוני', phone: '050-0000903', email: '', note: 'קרטונים, זכוכית, טייפים וחומרים מתכלים.' }
    ].forEach(function (s) { S.put('suppliers', s); });
  }

  function seedDemo() {
    /* ---------------- מסגרות (פרופילים). מלאי בס"מ, מוט = 290 ס"מ ---------------- */
    var COST = { 'אלון': 1.4, 'אשור': 1.1, 'ליבנה': 0.9, 'אורן': 0.8, 'אגוז': 2.1, 'מייפל': 1.6, 'אלומיניום': 1.2 };
    var frameBySku = {};
    function frame(sku, wood, color, sup, stock, min, note) {
      var f = S.put('frames', {
        sku: sku, woodType: wood, color: color, supplierId: sup,
        stockUnits: stock, minThreshold: min, unit: 'ס"מ אורך', rodLengthCm: 290,
        costPerCm: COST[wood] || 1, photo: null, note: note || ''
      });
      frameBySku[sku] = f;
      return f;
    }
    frame('2323-55', 'אלון', 'טבעי בהיר', SUP.avraham, 640, 300);
    frame('2323-11', 'אלון', 'שחור מט', SUP.avraham, 720, 300, 'מהחומר הזה מזמינים 10 מוטות, יותר זול.');
    frame('1320-10', 'אשור', 'דבש', SUP.avraham, 50, 250);
    frame('1328-1', 'אלון', 'לבן מושחל', SUP.avraham, 380, 250);
    frame('3511', 'אגוז', 'אגוז אמריקאי', SUP.avraham, 140, 300);
    frame('4805-77', 'מייפל', 'טבעי מבריק', SUP.avraham, 600, 250);
    frame('130', 'אורן', 'לבן קרם', SUP.avraham, 95, 200);
    frame('5322-225', 'ליבנה', 'מוזהב עתיק', SUP.silver, 90, 250);
    frame('5322-18', 'ליבנה', 'כסף מבריק', SUP.silver, 260, 200);
    frame('5322-60', 'אורן', 'שמפניה', SUP.silver, 430, 200);
    frame('5322-33', 'אורן', 'ברונזה', SUP.silver, 75, 200);
    frame('7010', 'אלומיניום', 'כסף מוברש', SUP.silver, 510, 250);
    frame('7012', 'אלומיניום', 'שחור', SUP.silver, 330, 250);

    /* ---------------- חומרי גלם (C20) ---------------- */
    [
      ['סיכות למהדק V-nails', 'קופסאות', 3, 2, SUP.yoni, ''],
      ['קרטון גב (backing board)', 'גיליונות', 6, 10, SUP.yoni, 'גודל 70x100'],
      ['טייפ חום', 'גלילים', 4, 3, SUP.yoni, ''],
      ['מסקינג טייפ', 'גלילים', 1, 3, SUP.yoni, ''],
      ['גומיות', 'שקיות', 5, 2, SUP.yoni, ''],
      ['זכוכית 2 מ"מ', 'גיליונות', 12, 8, SUP.yoni, ''],
      ['פספרטו לבן', 'גיליונות', 9, 5, SUP.yoni, ''],
      ['תליות ווים', 'חבילות', 2, 2, SUP.yoni, '']
    ].forEach(function (r) {
      S.put('rawMaterials', { name: r[0], unit: r[1], qty: r[2], minQty: r[3], supplierId: r[4], note: r[5] });
    });

    /* ---------------- מוצרים למכירה (C20) ---------------- */
    var prods = [
      ['הדפס ון גוך, ליל כוכבים', 450, '50x70', 'print', 'אלון שחור מט', 1, '114', 'המדבקה הירוקה'],
      ['ציור שמן, נוף גליל', 1800, '60x80', 'oil', 'ליבנה מוזהב עתיק', 1, '101', ''],
      ['ציור מקורי, פרחים בכחול', 950, '40x50', 'original', 'אלון טבעי בהיר', 1, '102', ''],
      ['הדפס מונה, נימפאות', 380, '40x60', 'print', 'אורן שמפניה', 2, '115', ''],
      ['ציור שמן, חוף הים', 2200, '70x100', 'oil', 'אגוז אמריקאי', 1, '103', ''],
      ['הדפס קליימט, הנשיקה', 520, '50x70', 'print', 'ליבנה מוזהב עתיק', 0, '116', ''],
      ['ציור מקורי, ירושלים', 1400, '50x60', 'original', 'אלון לבן מושחל', 0, '104', ''],
      ['מראה ממוסגרת', 600, '60x90', 'other', 'אלומיניום כסף מוברש', 1, '120', '']
    ].map(function (p) {
      return S.put('products', { name: p[0], price: p[1], size: p[2], kind: p[3], frame: p[4], qty: p[5], sticker: p[6], note: p[7], soldAt: null });
    });

    /* ---------------- לקוחות ---------------- */
    var custByKey = {};
    var names = ['דנה כהן', 'יוסי לוי', 'מרים אברהם', 'אבי שרון', 'נועה פרידמן', 'רון גבאי', 'טל בן דוד',
      'ליאת מזרחי', 'עדן כרמל', 'שירה גולן', 'גדעון אורן', 'רחל דגן', 'משה עטר', 'ענת בר', 'עומר שלו', 'הילה נחום'];
    names.forEach(function (n, i) {
      custByKey[n] = S.put('customers', { name: n, phone: '050-0000' + (101 + i), notes: '' });
    });

    /* ---------------- הזמנות ----------------
       it(desc, w, h, sku, opts) -> שורת תמונה. pays: [type, amount, daysAgo, method|null]
       method null = תשלום בלי קבלה (מזין התראת "חסרה קבלה" בסוף יום, C30). */
    function it(desc, w, h, sku, o) {
      return Object.assign({ desc: desc, widthCm: w, heightCm: h, profileSku: sku, mount: false, mat: false, material: null, done: false, note: '' }, o || {});
    }
    var cfgs = [
      // ---- היסטוריה (נמסרו), מזינה סטטיסטיקה ולקוחות חוזרים ----
      { c: 'דנה כהן', ago: 70, status: 'delivered', price: 380, items: [it('הדפס בוטני', 40, 50, '3511', { mat: true })], pays: [['deposit', 200, 70, 'cash'], ['final', 180, 61, 'credit']] },
      { c: 'גדעון אורן', ago: 63, status: 'delivered', price: 520, items: [it('נוף ים', 50, 60, '3511')], pays: [['deposit', 520, 63, 'credit']] },
      { c: 'ליאת מזרחי', ago: 56, status: 'delivered', price: 300, items: [it('פורטרט משפחתי', 50, 60, '1328-1', { mount: true })], pays: [['deposit', 100, 56, 'cash'], ['final', 200, 47, 'cash']] },
      { c: 'רחל דגן', ago: 49, status: 'delivered', price: 600, items: [it('פוסטר קולנוע', 60, 80, '2323-11', { mount: true }), it('פוסטר קטן', 30, 40, '2323-11', { mount: true })], pays: [['deposit', 600, 49, 'credit']] },
      { c: 'יוסי לוי', ago: 42, status: 'delivered', price: 420, items: [it('איור', 40, 50, '4805-77', { mat: true })], pays: [['deposit', 150, 42, 'cash'], ['final', 270, 33, 'other']] },
      { c: 'דנה כהן', ago: 35, status: 'delivered', price: 210, items: [it('תעודה', 30, 40, '1328-1')], pays: [['deposit', 210, 35, 'cash']] },
      { c: 'משה עטר', ago: 28, status: 'delivered', price: 700, items: [it('מפה עתיקה', 70, 90, '3511', { mat: true })], pays: [['deposit', 300, 28, 'credit'], ['final', 400, 18, 'credit']] },
      { c: 'ענת בר', ago: 21, status: 'delivered', price: 300, items: [it('צילום שחור לבן', 30, 40, '2323-11', { mat: true })], pays: [['deposit', 300, 21, 'cash']] },
      { c: 'טל בן דוד', ago: 16, status: 'delivered', price: 280, items: [it('קולאז׳ טיול', 25, 35, '5322-60')], pays: [['deposit', 100, 16, 'cash'], ['final', 180, 7, 'cash']] },
      // ---- פעילות ----
      { c: 'רון גבאי', ago: 13, status: 'in_progress', price: 420, items: [it('תמונת חתונה', 40, 50, '4805-77', { mat: true, material: 'V', done: true }), it('תמונת חתונה קטנה', 20, 30, '4805-77', { material: 'V' })], pays: [['deposit', 150, 13, 'credit']] },
      { c: 'מרים אברהם', ago: 11, status: 'in_progress', price: 260, items: [it('תעודת הוקרה', 21, 30, '3511', { material: 'V', note: 'צריך לתקן פינות' })], pays: [['deposit', 100, 11, 'cash']],
        blocked: { kind: 'stuck', reason: 'ביום שני הלקוחה מביאה את התמונה השנייה', sinceAgo: 2 } },
      { c: 'יוסי לוי', ago: 9, status: 'in_progress', price: 480, items: [it('ציור שמן, נוף גליל', 50, 70, '5322-225', { material: 'X', note: 'חסר חומר, הוזמנו 2 מוטות' })], pays: [['deposit', 200, 9, 'cash']] },
      { c: 'עדן כרמל', ago: 8, status: 'in_progress', price: 390, items: [it('קולאז׳ משפחה', 50, 50, '1328-1', { mat: true, material: 'V' }), it('תמונה זוגית', 30, 40, '1328-1', { material: 'V', done: true }), it('תמונת ילדים', 30, 40, '1328-1', { material: 'V', done: true })], pays: [['deposit', 150, 8, 'credit']] },
      { c: 'טל בן דוד', ago: 7, status: 'ready', price: 650, items: [it('מפת עולם וינטג׳', 70, 100, '5322-33', { mount: true, material: 'V', done: true })], pays: [['deposit', 300, 7, 'cash']] },
      { c: 'דנה כהן', ago: 6, status: 'ready', price: 320, items: [it('צילום משפחתי', 30, 40, '2323-55', { mat: true, material: 'V', done: true }), it('צילום משפחתי 2', 30, 40, '2323-55', { mat: true, material: 'V', done: true })], pays: [['deposit', 200, 6, 'credit'], ['final', 120, 0, null]] },
      { c: 'נועה פרידמן', ago: 4, status: 'in_progress', price: 300, items: [it('איור בצבעי מים', 25, 35, '5322-60', { mat: true, material: 'V' })], pays: [['deposit', 150, 4, 'cash']] },
      { c: 'שירה גולן', ago: 3, status: 'new', price: 190, items: [it('תעודת בגרות', 21, 30, '5322-18')], pays: [['deposit', 90, 3, 'cash']],
        blocked: { kind: 'contact_client', reason: 'המסגרת שנבחרה צרה מדי לתעודה. לא לגעת בעבודה עד שהלקוחה מגיעה', sinceAgo: 1 } },
      { c: 'אבי שרון', ago: 1, status: 'new', price: 540, items: [it('פוסטר קונצרט', 60, 90, '2323-11', { mount: true })], pays: [['deposit', 250, 1, 'credit']] },
      { c: 'עומר שלו', ago: 0, status: 'new', price: 360, items: [it('רקמה', 40, 40, '1320-10', { mat: true }), it('רקמה קטנה', 20, 20, '1320-10')], pays: [['deposit', 150, 0, 'cash']] }
    ];

    // מספור רץ לפי סדר הפתיחה
    cfgs.sort(function (a, b) { return b.ago - a.ago; });
    var orderNo = 1000;
    var allPays = [];   // לקבלות, לפי סדר כרונולוגי
    var usage = [];
    var savedOrders = [];
    cfgs.forEach(function (cfg) {
      orderNo += 1;
      var created = daysAgo(cfg.ago, 9 + (orderNo % 7));
      var cust = custByKey[cfg.c];
      var items = cfg.items.map(function (x, i) { var y = Gallery.data.orders.newItem(x); y.idx = i + 1; return y; });
      if (cfg.status === 'delivered') items.forEach(function (x) { x.done = true; x.material = 'V'; });
      var o = {
        number: orderNo, customerId: cust.id, createdAt: iso(created),
        dueDate: iso(plusDays(created, 10)), status: cfg.status,
        blocked: null, items: items, notes: '', price: cfg.price, payments: []
      };
      if (cfg.status === 'ready') o.readyAt = iso(daysAgo(Math.max(0, cfg.ago - 5)));
      if (cfg.status === 'delivered') { o.readyAt = iso(plusDays(created, 7)); o.deliveredAt = iso(plusDays(created, 8)); }
      if (cfg.blocked) {
        o.blocked = { kind: cfg.blocked.kind, reason: cfg.blocked.reason, since: iso(daysAgo(cfg.blocked.sinceAgo)), resolvedAt: null, response: null };
      }
      cfg.pays.forEach(function (p) {
        var pay = { id: S.uid(), amount: p[1], type: p[0], at: iso(daysAgo(p[2], 12 + (orderNo % 5))), receiptId: null };
        o.payments.push(pay);
        allPays.push({ order: o, pay: pay, method: p[3] });
      });
      savedOrders.push(o);
      // צריכת מלאי היסטורית לשורות שבוצעו
      items.forEach(function (x) {
        if (!x.done || !x.profileSku) return;
        var f = frameBySku[x.profileSku];
        usage.push({ profileId: f ? f.id : null, profileSku: x.profileSku, orderId: null, orderNo: String(orderNo),
          amount: (Number(x.widthCm) + Number(x.heightCm)) * 2, date: o.createdAt, _order: o });
      });
    });

    // שמירה ראשונה כדי לקבל id להזמנות
    savedOrders = savedOrders.map(function (o) { var s = S.put('orders', o); o.id = s.id; return o; });
    usage.forEach(function (u) { u.orderId = u._order.id; delete u._order; S.put('usage', u); });

    /* ---------------- מכירות מוצרים (2 נמכרו) ---------------- */
    var sold = [
      { p: prods[5], c: 'ליאת מזרחי', ago: 12, method: 'credit' },
      { p: prods[6], c: 'טל בן דוד', ago: 5, method: 'cash' }
    ];
    var salePays = [];
    sold.forEach(function (x) {
      var at = iso(daysAgo(x.ago, 15));
      var sale = S.put('sales', { productId: x.p.id, customerId: custByKey[x.c].id, price: x.p.price, at: at, receiptId: null });
      x.p.soldAt = at;
      S.put('products', x.p);
      salePays.push({ sale: sale, method: x.method, at: at });
    });

    /* ---------------- קבלות: מספור רץ כרונולוגי ---------------- */
    var events = [];
    allPays.forEach(function (x) { if (x.method) events.push({ at: x.pay.at, kind: 'order', x: x }); });
    salePays.forEach(function (x) { events.push({ at: x.at, kind: 'sale', x: x }); });
    events.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
    var receiptNo = 1000;
    var ordersById = {};
    savedOrders.forEach(function (o) { ordersById[o.id] = o; });
    events.forEach(function (ev) {
      receiptNo += 1;
      if (ev.kind === 'order') {
        var o = ev.x.order, pay = ev.x.pay;
        var r = S.put('receipts', { number: receiptNo, at: pay.at, customerId: o.customerId, amount: pay.amount, method: ev.x.method,
          source: 'order', refId: o.id, paymentId: pay.id, sentToCustomer: receiptNo % 3 !== 0, url: '', provider: 'simulated' });
        pay.receiptId = r.id;
      } else {
        var s = ev.x.sale;
        var r2 = S.put('receipts', { number: receiptNo, at: ev.at, customerId: s.customerId, amount: s.price, method: ev.x.method,
          source: 'sale', refId: s.id, paymentId: null, sentToCustomer: true, url: '', provider: 'simulated' });
        s.receiptId = r2.id;
        S.put('sales', s);
      }
    });
    savedOrders.forEach(function (o) { S.put('orders', o); });

    /* ---------------- רשימות הזמנה לספקים (C24) ---------------- */
    var yossiOrder = savedOrders.filter(function (o) { return o.items[0].profileSku === '5322-225'; })[0];
    S.put('supplierOrderLines', { supplierId: SUP.silver, itemType: 'frame', itemId: frameBySku['5322-225'].id, label: '5322-225 ליבנה מוזהב עתיק',
      qtyRods: 2, source: 'worktable', orderId: yossiOrder ? yossiOrder.id : null, itemRowId: yossiOrder ? yossiOrder.items[0].id : null, sentAt: null });
    S.put('supplierOrderLines', { supplierId: SUP.avraham, itemType: 'frame', itemId: frameBySku['1320-10'].id, label: '1320-10 אשור דבש',
      qtyRods: 3, source: 'low_stock', orderId: null, sentAt: null });
    var masking = S.all('rawMaterials').filter(function (r) { return r.name === 'מסקינג טייפ'; })[0];
    if (masking) S.put('supplierOrderLines', { supplierId: SUP.yoni, itemType: 'raw', itemId: masking.id, label: masking.name, qty: 5, source: 'manual', orderId: null, sentAt: null });

    /* ---------------- הוצאות (C34, ללא שינוי) ---------------- */
    [
      [3200, 'שכירות', 'שכירות החנות', 4, null], [3200, 'שכירות', 'שכירות החנות', 35, null], [3200, 'שכירות', 'שכירות החנות', 66, null],
      [1450, 'חומרי גלם', 'הזמנת פרופילים', 7, SUP.avraham], [980, 'חומרי גלם', 'פרופילים מוזהבים', 19, SUP.silver],
      [640, 'חומרי גלם', 'קרטון גב וטייפים', 28, SUP.yoni], [540, 'ציוד', 'להבי חיתוך', 14, null], [210, 'אחר', 'חומרי ניקיון ומשרד', 11, null]
    ].forEach(function (e) {
      S.put('expenses', { amount: e[0], category: e[1], note: e[2], date: iso(daysAgo(e[3])), supplierId: e[4] });
    });

    /* ---------------- מונים ---------------- */
    var counters = S.getDoc('counters') || {};
    counters.orders = orderNo;
    counters.receipts = receiptNo;
    S.setDoc('counters', counters);
  }

  S.onBeforeReady(function () {
    var meta = S.getDoc('meta') || {};
    seedSuppliers();              // הספקים אמיתיים (C23), נזרעים גם אחרי ניקוי
    if (meta.seededAt) return;
    seedDemo();
    meta = S.getDoc('meta') || {};
    meta.seededAt = new Date().toISOString();
    S.setDoc('meta', meta);
  });

})(window);
