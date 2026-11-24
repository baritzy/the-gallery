/* =============================================================================
 * data/demo.js  -  נתוני דוגמה לפי דרישה (R3): Gallery.data.demo
 * -----------------------------------------------------------------------------
 * load()  -> Promise<{ loaded, already, count }>
 *   כל רשומה מקבלת demo: true ומזהה קבוע 'demo-...'. טעינה שנייה (גם ממכשיר אחר) לא משכפלת:
 *   אם יש כבר רשומת דוגמה כלשהי, לא נטען כלום. הכל עובר דרך ה-store, כך שבענן זה מסתנכרן
 *   לשני האייפדים. לא נוגעים ברשומות אמיתיות (לא frameUsage.sync, מלאי הדוגמה נכתב ישירות).
 * clear() -> Promise<{ removed, kept }>
 *   מחיקה קשה (לא לסל המחזור) של כל מה שמסומן demo: true, ועוד "ילדים" שנוצרו מהן
 *   (צריכה / שורות ספק / קבלות / מכירות של רשומות דוגמה, רשומות סל מחזור של דוגמה).
 *   רשומת דוגמה שרשומה אמיתית מפנה אליה (למשל הזמנה אמיתית ללקוח דוגמה) נשארת, כדי שלא
 *   יישארו הפניות שבורות. המונים לא מתאפסים.
 * count() -> מספר רשומות הדוגמה כרגע.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var S = Gallery.store;
  var data = Gallery.data;

  var REF_FIELDS = ['customerId', 'orderId', 'profileId', 'productId', 'supplierId', 'refId', 'itemId', 'parentId'];

  function daysAgo(n, hour) {
    var d = new Date();
    d.setHours(hour == null ? 10 : hour, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d.toISOString();
  }
  function plusDays(iso, n) { var d = new Date(iso); d.setDate(d.getDate() + n); return d.toISOString(); }

  function demoRecords() {
    var out = [];
    S.COLLECTIONS.forEach(function (c) {
      S.all(c).forEach(function (r) { if (r && (r.demo === true || (c === 'trash' && r.record && r.record.demo === true))) out.push({ col: c, rec: r }); });
    });
    return out;
  }
  function count() { return demoRecords().length; }

  var busy = false;

  /* ------------------------------------------------------------------ load */
  function load() {
    if (busy) return Promise.resolve({ loaded: false, busy: true, count: 0 });
    busy = true;
    return S.ready.then(function () {
      if (count() > 0) return { loaded: false, already: true, count: count() };
      return build().then(function (n) { return { loaded: true, count: n }; });
    }).then(function (res) { busy = false; return res; }, function (err) { busy = false; throw err; });
  }

  function build() {
    var n = 0;
    function put(col, rec) { rec.demo = true; n++; return S.put(col, rec); }

    /* ספקי מסגרות: שלושת הקבועים (נזרעים בכל חנות). אם חסר אחד, נופלים לראשון שיש. */
    var frameSups = data.suppliers.frameSuppliers();
    function sup(id) {
      if (S.find('suppliers', id)) return id;
      return frameSups.length ? frameSups[0].id : null;
    }
    var AV = sup('sup-avraham'), SI = sup('sup-silver'), YO = sup('sup-yoni');

    /* ספקי חומרי גלם (דוגמה) */
    put('suppliers', { id: 'demo-sup-sharon', kind: 'raw', name: 'אריזות השרון', contactName: 'רונית', phone: '050-0000911', email: '', note: 'קרטון גב, טייפים ואריזה.' });
    put('suppliers', { id: 'demo-sup-merkaz', kind: 'raw', name: 'כלי עבודה מרכז', contactName: 'שמעון', phone: '050-0000912', email: '', note: 'סיכות, ווים ותליות.' });

    /* מסגרות: מק"ט שכבר קיים אצל רשומה אמיתית מקבל סיומת, כדי שהזמנות הדוגמה לא יורידו מלאי אמיתי */
    var realSkus = {};
    S.all('frames').forEach(function (f) { if (!f.demo) realSkus[String(f.sku)] = 1; });
    var SKU = {};
    function frame(key, sku, wood, color, supId, stock, min, cost, note) {
      var s = sku;
      while (realSkus[s]) s = s + '-ד';
      SKU[key] = s;
      put('frames', { id: 'demo-fr-' + key, sku: s, woodType: wood, color: color, supplierId: supId,
        stockUnits: stock, minThreshold: min, unit: 'ס"מ אורך', rodLengthCm: 290, costPerCm: cost, photo: null, note: note || '' });
    }
    frame('1', '2323-55', 'אלון', 'טבעי בהיר', AV, 440, 300, 1.4);
    frame('2', '2323-11', 'אלון', 'שחור מט', AV, 400, 300, 1.4, 'מהחומר הזה מזמינים 10 מוטות, יותר זול.');
    frame('3', '1320-10', 'אשור', 'דבש', AV, 50, 250, 1.1);
    frame('4', '5322-225', 'ליבנה', 'מוזהב עתיק', SI, 90, 250, 0.9);
    frame('5', '5322-18', 'ליבנה', 'כסף מבריק', SI, 260, 200, 0.9);
    frame('6', '7012', 'אלומיניום', 'שחור', SI, 330, 250, 1.2);
    frame('7', '4805-77', 'מייפל', 'טבעי מבריק', YO, 340, 250, 1.6);
    frame('8', '130', 'אורן', 'לבן קרם', YO, 95, 200, 0.8);

    /* חומרי גלם */
    var RAW = {};
    [
      ['1', 'קרטון גב', 'גיליונות', 6, 10, 'demo-sup-sharon', 'גודל 70x100'],
      ['2', 'טייפ חום', 'גלילים', 4, 3, 'demo-sup-sharon', ''],
      ['3', 'מסקינג טייפ', 'גלילים', 1, 3, 'demo-sup-sharon', ''],
      ['4', 'סיכות V-nails', 'קופסאות', 3, 2, 'demo-sup-merkaz', ''],
      ['5', 'תליות ווים', 'חבילות', 2, 2, 'demo-sup-merkaz', '']
    ].forEach(function (r) {
      RAW[r[0]] = put('rawMaterials', { id: 'demo-raw-' + r[0], name: r[1], unit: r[2], qty: r[3], minQty: r[4], supplierId: r[5], note: r[6] });
    });

    /* מוצרים (אחד נמכר לדנה) */
    put('products', { id: 'demo-pr-1', name: 'הדפס ון גוך, ליל כוכבים', description: '', price: 450, size: '50x70', kind: 'print', frame: 'אלון שחור מט', qty: 1, sticker: '114', note: '', soldAt: null });
    put('products', { id: 'demo-pr-2', name: 'ציור שמן, נוף גליל', description: 'שמן על בד', price: 1800, size: '60x80', kind: 'oil', frame: 'ליבנה מוזהב עתיק', qty: 1, sticker: '101', note: '', soldAt: null });
    put('products', { id: 'demo-pr-3', name: 'ציור מקורי, פרחים בכחול', description: '', price: 950, size: '40x50', kind: 'original', frame: 'אלון טבעי בהיר', qty: 1, sticker: '', note: '', soldAt: null });
    var soldAt = daysAgo(15, 15);
    put('products', { id: 'demo-pr-4', name: 'הדפס קלימט, הנשיקה', description: '', price: 520, size: '50x70', kind: 'print', frame: 'ליבנה מוזהב עתיק', qty: 0, sticker: '116', note: '', soldAt: soldAt });

    /* לקוחות: דנה 4 ביקורים (ירוק), יוסי 2 (צהוב), מיכל 1 */
    put('customers', { id: 'demo-cu-dana', name: 'דנה לוי', phone: '050-0000101', notes: 'אוהבת מסגרות עץ טבעי.' });
    put('customers', { id: 'demo-cu-yossi', name: 'יוסי כהן', phone: '050-0000102', notes: '' });
    put('customers', { id: 'demo-cu-michal', name: 'מיכל אברהם', phone: '050-0000103', notes: '' });

    function item(id, idx, desc, w, h, skuKey, o) {
      return Object.assign({ id: id, idx: idx, mount: false, mat: false, desc: desc, material: null,
        widthCm: w, heightCm: h, profileSku: SKU[skuKey], done: false, note: '' }, o || {});
    }
    /* pays: [id, type, amount, daysAgo, method|null] (null = בלי קבלה) */
    var cfgs = [
      { id: 'demo-or-1', c: 'demo-cu-dana', ago: 40, status: 'delivered', price: 380,
        items: [item('demo-it-1a', 1, 'הדפס בוטני', 40, 50, '1', { mat: true, material: 'V', done: true })],
        pays: [['demo-pay-1a', 'deposit', 200, 40, 'cash'], ['demo-pay-1b', 'final', 180, 32, 'credit']] },
      { id: 'demo-or-2', c: 'demo-cu-dana', ago: 6, status: 'ready', price: 320,
        items: [item('demo-it-2a', 1, 'צילום משפחתי', 30, 40, '2', { mat: true, material: 'V', done: true }),
                item('demo-it-2b', 2, 'צילום משפחתי 2', 30, 40, '2', { mat: true, material: 'V', done: true })],
        pays: [['demo-pay-2a', 'deposit', 200, 6, 'credit']] },
      { id: 'demo-or-3', c: 'demo-cu-dana', ago: 1, status: 'new', price: 190,
        items: [item('demo-it-3a', 1, 'תעודת בגרות', 21, 30, '5')],
        pays: [['demo-pay-3a', 'deposit', 90, 1, 'cash']],
        contact: { text: 'המסגרת שנבחרה צרה מדי לתעודה. לא לגעת בעבודה עד שהלקוחה מגיעה', sinceAgo: 1 } },
      { id: 'demo-or-4', c: 'demo-cu-yossi', ago: 8, status: 'in_progress', price: 540,
        items: [item('demo-it-4a', 1, 'תמונת חתונה', 50, 70, '7', { mat: true, material: 'V', done: true }),
                item('demo-it-4b', 2, 'תמונת חתונה קטנה', 20, 30, '7', { material: 'V' }),
                item('demo-it-4c', 3, 'ציור שמן קטן', 30, 40, '4', { material: 'X', note: 'חסר חומר, הוזמנו 2 מוטות' })],
        pays: [['demo-pay-4a', 'deposit', 200, 8, 'cash']] },
      { id: 'demo-or-5', c: 'demo-cu-yossi', ago: 11, status: 'stuck', price: 260,
        items: [item('demo-it-5a', 1, 'תעודת הוקרה', 21, 30, '3', { material: 'V', note: 'צריך לתקן פינות' }),
                item('demo-it-5b', 2, 'תעודה שנייה', 21, 30, '3', { material: 'V' })],
        pays: [['demo-pay-5a', 'deposit', 100, 11, 'credit']],
        stuck: { reason: 'ביום שני הלקוח מביא את התמונה השנייה', sinceAgo: 2 } },
      { id: 'demo-or-6', c: 'demo-cu-michal', ago: 0, status: 'new', price: 360,
        items: [item('demo-it-6a', 1, 'פוסטר קונצרט', 50, 70, '6', { mount: true }),
                item('demo-it-6b', 2, 'פוסטר קטן', 30, 40, '6', { mount: true })],
        pays: [] }
    ];
    cfgs.sort(function (a, b) { return b.ago - a.ago; });

    var orders = [];
    var chain = Promise.resolve();
    cfgs.forEach(function (cfg) {
      chain = chain.then(function () { return S.nextNumberAsync('orders', 1001); }).then(function (num) {
        var created = daysAgo(cfg.ago, 9 + (orders.length % 6));
        var o = {
          id: cfg.id, number: num, customerId: cfg.c, createdAt: created, dueDate: plusDays(created, 10),
          status: cfg.status, stuck: null, contact: null, items: cfg.items, notes: '', price: cfg.price, payments: []
        };
        if (cfg.status === 'ready') o.readyAt = daysAgo(1);
        if (cfg.status === 'delivered') { o.readyAt = plusDays(created, 7); o.deliveredAt = plusDays(created, 8); }
        /* סבב 5: "תקועה" = סטטוס עם סיבה, "ליצור קשר" = הערה עם תזכורת (לא דגל) */
        if (cfg.stuck) o.stuck = { reason: cfg.stuck.reason, since: daysAgo(cfg.stuck.sinceAgo), from: 'in_progress' };
        if (cfg.contact) o.contact = { text: cfg.contact.text, since: daysAgo(cfg.contact.sinceAgo), itemId: null, resolvedAt: null, response: null };
        cfg.pays.forEach(function (p) {
          o.payments.push({ id: p[0], amount: p[2], type: p[1], at: daysAgo(p[3], 12), receiptId: null, _method: p[4] });
        });
        orders.push(o);
      });
    });

    return chain.then(function () {
      /* צריכה לשורות שבוצעו (עקבית עם המלאי שנכתב למעלה) */
      orders.forEach(function (o) {
        o.items.forEach(function (it) {
          if (!it.done) return;
          var f = data.frames.findBySku(it.profileSku);
          var cm = data.frames.neededCm ? data.frames.neededCm(it.widthCm, it.heightCm) : (it.widthCm + it.heightCm) * 2;
          it.consumedCm = cm;
          put('usage', { id: 'use-' + it.id, profileId: f ? f.id : null, profileSku: it.profileSku, orderId: o.id,
            orderNo: String(o.number), itemId: it.id, amount: cm, deductedCm: cm, date: o.createdAt, source: 'auto' });
        });
      });

      /* מכירה: מוצר 4 לדנה */
      var sale = { id: 'demo-sale-1', productId: 'demo-pr-4', customerId: 'demo-cu-dana', price: 520, at: soldAt, receiptId: null };

      /* קבלות מדומות בסדר כרונולוגי */
      var events = [];
      orders.forEach(function (o) { o.payments.forEach(function (p) { if (p._method) events.push({ at: p.at, o: o, p: p }); }); });
      events.push({ at: sale.at, sale: sale, method: 'credit' });
      events.sort(function (a, b) { return new Date(a.at) - new Date(b.at); });

      var chain2 = Promise.resolve();
      events.forEach(function (ev, i) {
        chain2 = chain2.then(function () { return S.nextNumberAsync('receipts', 1001); }).then(function (num) {
          var rid = 'demo-rc-' + (i + 1);
          if (ev.sale) {
            put('receipts', { id: rid, number: num, at: ev.at, customerId: ev.sale.customerId, amount: ev.sale.price, method: ev.method,
              source: 'sale', refId: ev.sale.id, paymentId: null, sentToCustomer: true, url: '', provider: 'simulated' });
            ev.sale.receiptId = rid;
          } else {
            put('receipts', { id: rid, number: num, at: ev.at, customerId: ev.o.customerId, amount: ev.p.amount, method: ev.p._method,
              source: 'order', refId: ev.o.id, paymentId: ev.p.id, sentToCustomer: i % 3 !== 2, url: '', provider: 'simulated' });
            ev.p.receiptId = rid;
          }
        });
      });
      return chain2.then(function () {
        put('sales', sale);
        orders.forEach(function (o) {
          o.payments.forEach(function (p) { delete p._method; });
          put('orders', o);   // S.put ישירות: בלי frameUsage.sync (הצריכה כבר נכתבה)
        });

        /* רשימות ספק: X מטבלת העבודה + מלאי נמוך (מסגרת וחומר גלם) */
        put('supplierOrderLines', { id: 'demo-sl-1', supplierId: SI, itemType: 'frame', itemId: 'demo-fr-4',
          label: (SKU['4'] + ' ליבנה מוזהב עתיק'), qtyRods: 2, source: 'worktable', orderId: 'demo-or-4', itemRowId: 'demo-it-4c', sentAt: null });
        put('supplierOrderLines', { id: 'demo-sl-2', supplierId: AV, itemType: 'frame', itemId: 'demo-fr-3',
          label: (SKU['3'] + ' אשור דבש'), qtyRods: 3, source: 'low_stock', orderId: null, sentAt: null });
        put('supplierOrderLines', { id: 'demo-sl-3', supplierId: 'demo-sup-sharon', itemType: 'raw', itemId: 'demo-raw-3',
          label: 'מסקינג טייפ', qty: 5, source: 'low_stock', orderId: null, sentAt: null });

        /* הוצאות */
        put('expenses', { id: 'demo-ex-1', amount: 640, category: 'חומרי גלם', note: 'קרטון גב וטייפים', date: daysAgo(12), supplierId: 'demo-sup-sharon' });
        put('expenses', { id: 'demo-ex-2', amount: 540, category: 'ציוד', note: 'להבי חיתוך', date: daysAgo(20), supplierId: null });

        var meta = S.getDoc('meta') || {};
        meta.demoLoadedAt = new Date().toISOString();
        S.setDoc('meta', meta);
        return n;
      });
    });
  }

  /* ----------------------------------------------------------------- clear */
  function clear() {
    if (busy) return Promise.resolve({ removed: 0, kept: 0, busy: true });
    busy = true;
    return S.ready.then(function () {
      var del = {};   // col -> {id:1}
      function mark(col, id) { (del[col] = del[col] || {})[id] = 1; }
      function marked(col, id) { return !!(del[col] && del[col][id]); }
      demoRecords().forEach(function (x) { mark(x.col, x.rec.id); });

      var ids = {};
      function refreshIds() {
        ids = {};
        Object.keys(del).forEach(function (c) { Object.keys(del[c]).forEach(function (id) { ids[id] = c; }); });
      }
      refreshIds();
      /* ילדים שנוצרו מרשומות דוגמה (למשל "בוצע" שסומן על הזמנת דוגמה אחרי הטעינה) */
      var CHILD = { usage: ['orderId', 'profileId'], supplierOrderLines: ['orderId', 'itemId', 'supplierId'],
        receipts: ['refId'], sales: ['productId'], trash: ['parentId'] };
      Object.keys(CHILD).forEach(function (col) {
        S.all(col).forEach(function (r) {
          if (marked(col, r.id)) return;
          var hit = CHILD[col].some(function (k) { return r[k] && ids[r[k]]; });
          if (!hit && col === 'trash' && r.record && r.record.id && ids[r.record.id]) hit = true;
          if (hit) mark(col, r.id);
        });
      });
      refreshIds();

      /* הגנה: רשומה אמיתית שמפנה לרשומת דוגמה = רשומת הדוגמה נשארת (בלי הפניות שבורות) */
      var keptIds = {}, changed = true;
      while (changed) {
        changed = false;
        S.COLLECTIONS.forEach(function (col) {
          S.all(col).forEach(function (r) {
            if (marked(col, r.id)) return;
            REF_FIELDS.forEach(function (k) {
              var target = r[k] && ids[r[k]];
              if (!target) return;
              delete del[target][r[k]];
              keptIds[r[k]] = 1; changed = true;
              refreshIds();
            });
          });
        });
      }

      var removed = 0;
      Object.keys(del).forEach(function (col) {
        Object.keys(del[col]).forEach(function (id) { S.del(col, id); removed++; });
      });
      var meta = S.getDoc('meta') || {};
      meta.demoClearedAt = new Date().toISOString();
      delete meta.demoLoadedAt;
      S.setDoc('meta', meta);
      return { removed: removed, kept: Object.keys(keptIds).length };
    }).then(function (res) { busy = false; return res; }, function (err) { busy = false; throw err; });
  }

  data.demo = { load: load, clear: clear, count: count };

})(window);
