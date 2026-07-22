/* =============================================================================
 * data.js  -  שכבת נתונים (Repository)  לאפליקציית "הגלריה"
 * -----------------------------------------------------------------------------
 * זו שכבת הנתונים היחידה של האפליקציה. כל שאר הקוד אסינכרוני ומדבר רק דרך כאן.
 * כרגע מאחורי הקלעים יושב localStorage, אבל כל הפונקציות מחזירות Promise
 * (getOrders / saveOrder / deleteOrder / subscribeOrders וכו') בדיוק כמו API של ענן.
 *
 *  >>> החלפה ל-Firebase Firestore = החלפת הקובץ הזה בלבד. <<<
 *  אף שורת קוד אחרת באפליקציה לא צריכה להשתנות: החתימות זהות (Promise-based),
 *  מבנה הרשומות תואם Firestore (id, createdAt, updatedAt, schemaVersion),
 *  והמזהים כבר נוצרים בצד לקוח עם crypto.randomUUID().
 *
 * קולקשנים: orders, customers, profiles, suppliers, usage.
 * ========================================================================== */

(function (global) {
  'use strict';

  var SCHEMA_VERSION = 1;
  var NS = 'gallery:v1:'; // קידומת מפתחות ב-localStorage

  /* ---- קונפיגורציית החנות (לחתימת הודעות וואטסאפ) ---- */
  var SHOP = {
    name: 'הגלריה',
    owner: 'אסף',
    phone: '09-7674829',
    address: 'רוטשילד 64, כפר סבא',
    hours: 'ימים א׳ עד ה׳ 9:00 עד 18:00, ו׳ 9:00 עד 13:00',
    slaDays: 10 // התחייבות זמן אספקה: כלל 10 הימים
  };

  /* =========================================================================
   * שכבת אחסון גולמית: localStorage עם נפילה חכמה לזיכרון (עובד גם ב-file://)
   * ======================================================================= */
  var memFallback = {};
  var canPersist = (function () {
    try {
      var k = NS + '__t';
      global.localStorage.setItem(k, '1');
      global.localStorage.removeItem(k);
      return true;
    } catch (e) {
      return false; // Safari/file:// לפעמים חוסם. נשארים בזיכרון, האפליקציה עובדת.
    }
  })();

  function rawGet(key) {
    if (canPersist) {
      try { return global.localStorage.getItem(NS + key); } catch (e) {}
    }
    return Object.prototype.hasOwnProperty.call(memFallback, key) ? memFallback[key] : null;
  }
  function rawSet(key, value) {
    if (canPersist) {
      try { global.localStorage.setItem(NS + key, value); return; } catch (e) {}
    }
    memFallback[key] = value;
  }

  function readCollection(name) {
    var raw = rawGet(name);
    if (!raw) return [];
    try {
      var parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  }
  function writeCollection(name, arr) {
    rawSet(name, JSON.stringify(arr));
  }

  /* =========================================================================
   * מנגנון מנויים (subscribe) - מדמה onSnapshot של Firestore
   * ======================================================================= */
  var subscribers = {}; // { collectionName: [cb, cb, ...] }

  function notify(name) {
    var list = subscribers[name];
    if (!list) return;
    var data = readCollection(name);
    list.forEach(function (cb) {
      try { cb(data.slice()); } catch (e) { /* מנוי בודד לא מפיל את השאר */ }
    });
  }

  function subscribe(name, cb) {
    if (!subscribers[name]) subscribers[name] = [];
    subscribers[name].push(cb);
    // דחיפה ראשונית אסינכרונית של המצב הנוכחי
    Promise.resolve().then(function () { cb(readCollection(name).slice()); });
    return function unsubscribe() {
      subscribers[name] = (subscribers[name] || []).filter(function (fn) { return fn !== cb; });
    };
  }

  /* =========================================================================
   * עזרי CRUD גנריים - כולם מחזירים Promise
   * ======================================================================= */
  var async = function (value) { return Promise.resolve(value); };

  function getAll(name) {
    return async(readCollection(name));
  }
  function getById(name, id) {
    var found = readCollection(name).filter(function (r) { return r.id === id; })[0];
    return async(found || null);
  }
  function save(name, record) {
    var arr = readCollection(name);
    var now = new Date().toISOString();
    var rec = Object.assign({}, record);
    if (!rec.id) rec.id = global.crypto.randomUUID();
    if (!rec.schemaVersion) rec.schemaVersion = SCHEMA_VERSION;
    var idx = -1;
    for (var i = 0; i < arr.length; i++) { if (arr[i].id === rec.id) { idx = i; break; } }
    if (idx === -1) {
      rec.createdAt = rec.createdAt || now;
      rec.updatedAt = now;
      arr.push(rec);
    } else {
      rec.createdAt = arr[idx].createdAt || now;
      rec.updatedAt = now;
      arr[idx] = rec;
    }
    writeCollection(name, arr);
    notify(name);
    return async(rec);
  }
  function remove(name, id) {
    var arr = readCollection(name).filter(function (r) { return r.id !== id; });
    writeCollection(name, arr);
    notify(name);
    return async(true);
  }

  /* =========================================================================
   * ה-API הציבורי - פונקציה ייעודית לכל קולקשן (כולן Promise-based)
   * ======================================================================= */
  var DB = {
    // --- orders ---
    getOrders: function () { return getAll('orders'); },
    getOrder: function (id) { return getById('orders', id); },
    saveOrder: function (o) { return save('orders', o); },
    deleteOrder: function (id) { return remove('orders', id); },
    subscribeOrders: function (cb) { return subscribe('orders', cb); },

    // --- customers ---
    getCustomers: function () { return getAll('customers'); },
    saveCustomer: function (c) { return save('customers', c); },
    deleteCustomer: function (id) { return remove('customers', id); },
    subscribeCustomers: function (cb) { return subscribe('customers', cb); },

    // --- profiles (מלאי) ---
    getProfiles: function () { return getAll('profiles'); },
    getProfile: function (id) { return getById('profiles', id); },
    saveProfile: function (p) { return save('profiles', p); },
    deleteProfile: function (id) { return remove('profiles', id); },
    subscribeProfiles: function (cb) { return subscribe('profiles', cb); },

    // --- suppliers ---
    getSuppliers: function () { return getAll('suppliers'); },
    saveSupplier: function (s) { return save('suppliers', s); },
    deleteSupplier: function (id) { return remove('suppliers', id); },
    subscribeSuppliers: function (cb) { return subscribe('suppliers', cb); },

    // --- usage (רשומות צריכה) ---
    getUsage: function () { return getAll('usage'); },
    saveUsage: function (u) { return save('usage', u); },
    deleteUsage: function (id) { return remove('usage', id); },
    subscribeUsage: function (cb) { return subscribe('usage', cb); },

    // עוזר: מספר הזמנה רץ אוטומטי (מבוסס על הקיים)
    nextOrderNumber: function () {
      var arr = readCollection('orders');
      var max = 1000;
      arr.forEach(function (o) {
        var n = parseInt(o.orderNo, 10);
        if (!isNaN(n) && n > max) max = n;
      });
      return async(max + 1);
    }
  };

  /* =========================================================================
   * SEED - נתוני דמו. נכתבים פעם אחת בלבד (אם הקולקשנים ריקים).
   * התאריכים מחושבים יחסית ל"עכשיו" כדי שכלל 10 הימים יראה תמיד תרחישים אמיתיים.
   * ======================================================================= */
  function iso(d) { return d.toISOString(); }
  function daysAgo(n) {
    var d = new Date();
    d.setHours(10, 0, 0, 0);
    d.setDate(d.getDate() - n);
    return d;
  }
  function plusDays(date, n) {
    var d = new Date(date.getTime());
    d.setDate(d.getDate() + n);
    return d;
  }
  function uid() { return global.crypto.randomUUID(); }

  function seedIfEmpty() {
    if (readCollection('orders').length > 0) return; // כבר יש נתונים, לא לדרוס

    var nowIso = new Date().toISOString();

    /* ---- ספקים ---- */
    var supNorth = { id: uid(), name: 'מסגרות הצפון', contact: '04-8123456', orderFormat: 'מק"ט + כמות באורך (מטרים)', schemaVersion: SCHEMA_VERSION, createdAt: nowIso, updatedAt: nowIso };
    var supGold  = { id: uid(), name: 'פרופיל גולד',   contact: '03-5559090', orderFormat: 'מק"ט + כמות יחידות אורך',    schemaVersion: SCHEMA_VERSION, createdAt: nowIso, updatedAt: nowIso };
    var supEz    = { id: uid(), name: 'עץ ומסגרת בע״מ', contact: '09-7778080', orderFormat: 'מק"ט + מטרים',              schemaVersion: SCHEMA_VERSION, createdAt: nowIso, updatedAt: nowIso };
    var suppliers = [supNorth, supGold, supEz];
    writeCollection('suppliers', suppliers);

    /* ---- פרופילים (מלאי) - ~18 פרופילים על פני 3 ספקים ---- */
    function prof(sku, wood, color, sup, stock, min) {
      return {
        id: uid(), sku: sku, woodType: wood, color: color, supplierId: sup,
        stockUnits: stock, minThreshold: min, unit: 'ס"מ אורך',
        schemaVersion: SCHEMA_VERSION, createdAt: nowIso, updatedAt: nowIso
      };
    }
    var profiles = [
      // מסגרות הצפון
      prof('4322-20',  'אלון',     'טבעי בהיר',      supNorth.id, 640,  200),
      prof('4322-243', 'אלון',     'אגוז כהה',       supNorth.id, 120,  200), // נמוך
      prof('4322-224', 'אלון',     'לבן מושחל',      supNorth.id, 380,  150),
      prof('4322-40',  'אשור',     'דבש',            supNorth.id, 55,   150), // נמוך
      prof('4322-11',  'אלון',     'שחור מט',        supNorth.id, 720,  200),
      prof('4322-77',  'אשור',     'אפור פחם',       supNorth.id, 210,  180),
      // פרופיל גולד
      prof('5322-225', 'ליבנה',    'מוזהב עתיק',     supGold.id,  90,   120), // נמוך
      prof('5322-18',  'ליבנה',    'כסף מבריק',      supGold.id,  260,  120),
      prof('5322-60',  'אורן',     'שמפניה',         supGold.id,  430,  150),
      prof('5322-33',  'אורן',     'ברונזה',         supGold.id,  75,   120), // נמוך
      prof('5322-90',  'ליבנה',    'זהב ורוד',       supGold.id,  340,  120),
      prof('5322-14',  'אורן',     'פלטינה',         supGold.id,  180,  140),
      // עץ ומסגרת בע״מ
      prof('4805-40',  'אגוז',     'אגוז אמריקאי',   supEz.id,    510,  200),
      prof('4805-12',  'אגוז',     'ונגה כהה',       supEz.id,    140,  200), // נמוך
      prof('4805-77',  'מייפל',    'טבעי מבריק',     supEz.id,    600,  180),
      prof('4805-05',  'מייפל',    'לבן קרם',        supEz.id,    95,   160), // נמוך
      prof('4805-63',  'אגוז',     'מוקה',           supEz.id,    280,  180),
      prof('4805-91',  'מייפל',    'אפור סקנדינבי',  supEz.id,    360,  160)
    ];
    writeCollection('profiles', profiles);

    /* ---- לקוחות + הזמנות ---- */
    var customers = [];
    var orders = [];
    var usage = [];
    var orderNo = 1000;

    function makeOrder(cfg) {
      orderNo += 1;
      var cust = { id: uid(), name: cfg.name, phone: cfg.phone, notes: '', schemaVersion: SCHEMA_VERSION, createdAt: nowIso, updatedAt: nowIso };
      customers.push(cust);
      var openD = daysAgo(cfg.openedDaysAgo);
      var target = plusDays(openD, SHOP.slaDays);
      var price = cfg.price, deposit = cfg.deposit;
      var order = {
        id: uid(),
        orderNo: String(orderNo),
        customerId: cust.id,
        customerName: cfg.name,
        phone: cfg.phone,
        imageDesc: cfg.imageDesc,
        frameDesc: cfg.frameDesc,
        profileSku: cfg.profileSku || '',
        width: cfg.width,
        height: cfg.height,
        glass: cfg.glass,
        glassType: cfg.glassType || '',
        backing: cfg.backing,
        passepartout: cfg.passe,
        passeColor: cfg.passeColor || '',
        price: price,
        deposit: deposit,
        balance: price - deposit,
        status: cfg.status, // new | in-work | ready | delivered
        openedAt: iso(openD),
        deliveryTarget: iso(target),
        schemaVersion: SCHEMA_VERSION,
        createdAt: iso(openD),
        updatedAt: nowIso
      };
      orders.push(order);

      // רשומת צריכה (רק להזמנות שכבר בעבודה/מוכנות/נמסרו, לצורך היסטוריה)
      if (cfg.profileSku && cfg.status !== 'new') {
        var consumed = (cfg.width + cfg.height) * 2;
        var pr = profiles.filter(function (p) { return p.sku === cfg.profileSku; })[0];
        usage.push({
          id: uid(),
          profileId: pr ? pr.id : null,
          profileSku: cfg.profileSku,
          orderId: order.id,
          orderNo: order.orderNo,
          amount: consumed,
          date: iso(openD),
          schemaVersion: SCHEMA_VERSION,
          createdAt: iso(openD),
          updatedAt: nowIso
        });
      }
      return order;
    }

    makeOrder({ name: 'דנה כהן',    phone: '0521234567', openedDaysAgo: 6,  status: 'ready',    imageDesc: 'צילום משפחתי בשחור-לבן', frameDesc: 'אלון טבעי בהיר', profileSku: '4322-20',  width: 30, height: 40, glass: true,  glassType: 'מט', backing: true,  passe: true,  passeColor: 'לבן, 5 ס"מ', price: 320, deposit: 200 });
    makeOrder({ name: 'יוסי לוי',    phone: '0533456789', openedDaysAgo: 9,  status: 'in-work',  imageDesc: 'ציור שמן, נוף גליל',      frameDesc: 'ליבנה מוזהב עתיק', profileSku: '5322-225', width: 50, height: 70, glass: false, backing: true,  passe: false, price: 480, deposit: 200 });
    makeOrder({ name: 'מרים אברהם',  phone: '0544567890', openedDaysAgo: 12, status: 'in-work',  imageDesc: 'תעודת הוקרה ממוסגרת',    frameDesc: 'אגוז אמריקאי', profileSku: '4805-40',  width: 21, height: 30, glass: true,  glassType: 'רגילה', backing: true,  passe: true,  passeColor: 'שמנת', price: 260, deposit: 100 });
    makeOrder({ name: 'אבי שרון',    phone: '0525678901', openedDaysAgo: 1,  status: 'new',      imageDesc: 'פוסטר קונצרט',           frameDesc: 'אלון שחור מט', profileSku: '4322-11',  width: 60, height: 90, glass: false, backing: true,  passe: false, price: 540, deposit: 250 });
    makeOrder({ name: 'נועה פרידמן', phone: '0536789012', openedDaysAgo: 4,  status: 'in-work',  imageDesc: 'איור ילדים בצבעי מים',    frameDesc: 'אורן שמפניה', profileSku: '5322-60',  width: 25, height: 35, glass: true,  glassType: 'נטולת בוהק', backing: true, passe: true, passeColor: 'תכלת', price: 300, deposit: 150 });
    makeOrder({ name: 'רון גבאי',    phone: '0547890123', openedDaysAgo: 14, status: 'in-work',  imageDesc: 'תמונת חתונה',             frameDesc: 'מייפל טבעי מבריק', profileSku: '4805-77', width: 40, height: 50, glass: true,  glassType: 'מט', backing: true,  passe: true,  passeColor: 'שנהב', price: 420, deposit: 150 });
    makeOrder({ name: 'טל בן דוד',   phone: '0528901234', openedDaysAgo: 8,  status: 'ready',    imageDesc: 'מפת עולם וינטג׳',         frameDesc: 'אורן ברונזה', profileSku: '5322-33',  width: 70, height: 100, glass: false, backing: true, passe: false, price: 650, deposit: 300 });
    makeOrder({ name: 'ליאת מזרחי',  phone: '0539012345', openedDaysAgo: 20, status: 'delivered',imageDesc: 'פורטרט שמן',             frameDesc: 'אגוז מוקה', profileSku: '4805-63',  width: 30, height: 30, glass: true,  glassType: 'רגילה', backing: true, passe: true,  passeColor: 'לבן', price: 280, deposit: 280 });
    makeOrder({ name: 'עדן כרמל',    phone: '0526543210', openedDaysAgo: 8,  status: 'in-work',  imageDesc: 'קולאז׳ תמונות משפחה',    frameDesc: 'אלון לבן מושחל', profileSku: '4322-224', width: 50, height: 50, glass: true, glassType: 'מט', backing: true, passe: true,  passeColor: 'אפור בהיר', price: 390, deposit: 150 });
    makeOrder({ name: 'שירה גולן',   phone: '0547654321', openedDaysAgo: 2,  status: 'new',      imageDesc: 'תעודת בגרות',            frameDesc: 'אורן פלטינה', profileSku: '5322-14',  width: 21, height: 30, glass: true,  glassType: 'רגילה', backing: true, passe: false, price: 190, deposit: 90 });

    writeCollection('customers', customers);
    writeCollection('orders', orders);
    writeCollection('usage', usage);
  }

  seedIfEmpty();

  /* =========================================================================
   * חשיפה גלובלית
   * ======================================================================= */
  global.Gallery = global.Gallery || {};
  global.Gallery.DB = DB;
  global.Gallery.SHOP = SHOP;
  global.Gallery.SCHEMA_VERSION = SCHEMA_VERSION;

})(window);
