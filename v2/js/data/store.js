/* =============================================================================
 * data/store.js  -  ליבת האחסון של "הגלריה" v2
 * OWNER: foundation (wave 2). אל תערכו את הקובץ הזה ב-wave 3.
 * -----------------------------------------------------------------------------
 * שכבה אחת שמחזיקה את כל הנתונים בזיכרון (cache) ומסנכרנת אותם מול "backend".
 *  - ברירת מחדל: LocalBackend = localStorage תחת הקידומת gallery:v3:
 *  - Firestore: קובץ js/data-firestore.js רושם Gallery.backends.firestore,
 *    ו-start() בוחר בו אוטומטית אם הוא מדווח enabled() === true.
 *
 * ממשק backend (כל backend חייב לממש):
 *   init()                        -> Promise  (טעינה ראשונית, אחרי זה read() סינכרוני)
 *   read(key)                     -> array | object | null   (סינכרוני, מהמראה המקומית)
 *   putDoc(col, rec)              -> void | Promise   (upsert רשומה אחת בקולקשן)
 *   deleteDoc(col, id)            -> void | Promise
 *   replaceCollection(col, arr)   -> void | Promise   (ייבוא / ניקוי)
 *   putSingleton(key, obj)        -> void | Promise   (settings / counters / reminderOrder / meta)
 *   nextNumber(name, start)       -> number   (מונה רץ סינכרוני. ב-Firestore: אופטימי + increment)
 *   reserveNumber(name, start)    -> Promise<number>   (אופציונלי. ב-Firestore: טרנזקציה. דרך nextNumberAsync)
 *   onExternalChange(cb(key, value))   שינוי שהגיע מבחוץ (לשונית אחרת / מכשיר אחר)
 *
 * קולקשנים (מערכים של רשומות עם id): ראו COLLECTIONS.
 * מסמכים בודדים (singletons): ראו SINGLETONS.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery = global.Gallery || {};

  var NS = 'gallery:v3:';
  var DEVICE_NS = NS + 'device:';   // מפתחות ברמת מכשיר (נעילת PIN וכו'). לא נכנסים לגיבוי ולא נמחקים בניקוי.
  var SCHEMA_VERSION = 3;

  var COLLECTIONS = [
    'orders', 'customers',
    'frames', 'rawMaterials', 'products',
    'suppliers', 'supplierOrderLines',
    'sales', 'receipts', 'expenses', 'usage',
    'reminderRules'
    // W4: 'reorderItems' הוסר (אף מודול לא משתמש בו; הוחלף ב-supplierOrderLines). גיבויים ישנים שמכילים אותו נטענים, והשדה פשוט מתעלם.
  ];
  var SINGLETONS = ['settings', 'counters', 'reminderOrder', 'meta'];

  /* =========================================================================
   * מזהים
   * ======================================================================= */
  function uid() {
    try {
      if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    } catch (e) { /* הקשר לא מאובטח (http ברשת מקומית): ממשיכים לנפילה */ }
    return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
  }

  function clone(v) { return v == null ? v : JSON.parse(JSON.stringify(v)); }

  /* =========================================================================
   * LocalBackend: localStorage + נפילה לזיכרון (Safari פרטי / file://)
   * ======================================================================= */
  function createLocalBackend() {
    var mem = {};
    var canPersist = (function () {
      try {
        var k = NS + '__t';
        global.localStorage.setItem(k, '1');
        global.localStorage.removeItem(k);
        return true;
      } catch (e) { return false; }
    })();

    function rawGet(key) {
      if (canPersist) { try { return global.localStorage.getItem(NS + key); } catch (e) {} }
      return Object.prototype.hasOwnProperty.call(mem, key) ? mem[key] : null;
    }
    function rawSet(key, str) {
      if (canPersist) {
        try { global.localStorage.setItem(NS + key, str); return; } catch (e) {
          if (global.console) global.console.warn('[gallery] localStorage write failed', key, e);
        }
      }
      mem[key] = str;
    }
    function parse(str) {
      if (!str) return null;
      try { return JSON.parse(str); } catch (e) { return null; }
    }

    var mirror = {};
    function arr(col) { if (!Array.isArray(mirror[col])) mirror[col] = []; return mirror[col]; }

    return {
      name: 'local',
      persistent: canPersist,
      init: function () {
        COLLECTIONS.forEach(function (c) { var v = parse(rawGet(c)); mirror[c] = Array.isArray(v) ? v : []; });
        SINGLETONS.forEach(function (s) { var v = parse(rawGet(s)); mirror[s] = (v && typeof v === 'object') ? v : null; });
        return Promise.resolve();
      },
      read: function (key) { return mirror[key] == null ? null : mirror[key]; },
      putDoc: function (col, rec) {
        var a = arr(col), i;
        for (i = 0; i < a.length; i++) { if (a[i].id === rec.id) { a[i] = rec; break; } }
        if (i === a.length) a.push(rec);
        rawSet(col, JSON.stringify(a));
      },
      deleteDoc: function (col, id) {
        mirror[col] = arr(col).filter(function (r) { return r.id !== id; });
        rawSet(col, JSON.stringify(mirror[col]));
      },
      replaceCollection: function (col, list) {
        mirror[col] = Array.isArray(list) ? list : [];
        rawSet(col, JSON.stringify(mirror[col]));
      },
      putSingleton: function (key, obj) {
        mirror[key] = obj;
        rawSet(key, JSON.stringify(obj));
      },
      nextNumber: function (name, start) {
        var c = mirror.counters || {};
        var last = typeof c[name] === 'number' ? c[name] : (start - 1);
        c[name] = last + 1;
        mirror.counters = c;
        rawSet('counters', JSON.stringify(c));
        return c[name];
      },
      // סנכרון בין לשוניות (D4): אירוע storage נורה רק בלשוניות האחרות.
      onExternalChange: function (cb) {
        global.addEventListener('storage', function (e) {
          if (!e.key || e.key.indexOf(NS) !== 0 || e.key.indexOf(DEVICE_NS) === 0) return;
          var key = e.key.slice(NS.length);
          if (COLLECTIONS.indexOf(key) === -1 && SINGLETONS.indexOf(key) === -1) return;
          var v = parse(e.newValue);
          if (COLLECTIONS.indexOf(key) !== -1) v = Array.isArray(v) ? v : [];
          mirror[key] = v;
          cb(key, v);
        });
      }
    };
  }

  /* =========================================================================
   * מנויים
   * ======================================================================= */
  var backend = null;
  var subs = {};               // key -> [cb]
  var readyResolve;
  var ready = new Promise(function (res) { readyResolve = res; });
  var started = false;

  function snapshot(key) {
    var v = backend ? backend.read(key) : null;
    if (COLLECTIONS.indexOf(key) !== -1) return clone(v || []);
    return clone(v);
  }

  function notify(key) {
    var list = subs[key];
    if (!list || !list.length) return;
    list.slice().forEach(function (cb) {
      try { cb(snapshot(key)); } catch (e) {
        if (global.console) global.console.error('[gallery] subscriber failed on ' + key, e);
      }
    });
  }

  function subscribe(key, cb) {
    if (!subs[key]) subs[key] = [];
    subs[key].push(cb);
    var active = true;
    ready.then(function () { if (active) { try { cb(snapshot(key)); } catch (e) {
      if (global.console) global.console.error('[gallery] subscriber failed on ' + key, e);
    } } });
    return function unsubscribe() {
      active = false;
      subs[key] = (subs[key] || []).filter(function (fn) { return fn !== cb; });
    };
  }

  /* =========================================================================
   * CRUD סינכרוני מול ה-cache (כל ה-API הציבורי עוטף את זה ב-Promise)
   * ======================================================================= */
  function assertCol(col) {
    if (COLLECTIONS.indexOf(col) === -1) throw new Error('[gallery] unknown collection: ' + col);
  }
  function all(col) { assertCol(col); return snapshot(col); }
  function find(col, id) {
    assertCol(col);
    var a = (backend && backend.read(col)) || [];
    for (var i = 0; i < a.length; i++) { if (a[i].id === id) return clone(a[i]); }
    return null;
  }
  function put(col, record) {
    assertCol(col);
    var now = new Date().toISOString();
    var rec = clone(record) || {};
    if (!rec.id) rec.id = uid();
    var prev = find(col, rec.id);
    rec.createdAt = (prev && prev.createdAt) || rec.createdAt || now;
    rec.updatedAt = now;
    rec.schemaVersion = SCHEMA_VERSION;
    backend.putDoc(col, rec);
    notify(col);
    return clone(rec);
  }
  function del(col, id) {
    assertCol(col);
    backend.deleteDoc(col, id);
    notify(col);
    return true;
  }
  function getDoc(key) { return snapshot(key); }
  function setDoc(key, obj) {
    if (SINGLETONS.indexOf(key) === -1) throw new Error('[gallery] unknown singleton: ' + key);
    backend.putSingleton(key, clone(obj));
    notify(key);
    return clone(obj);
  }

  /* מונה רץ (מספרי הזמנה / קבלה). start = הערך הראשון אם המונה ריק. */
  function nextNumber(name, start) {
    var n = backend.nextNumber(name, start);
    notify('counters');
    return n;
  }
  /* גרסה אסינכרונית (D4, agent D): ב-Firestore = טרנזקציה על counters, ייחודי בין המכשירים.
     ב-local = אותו מונה סינכרוני. orders.create ו-receipts.issue משתמשים בזו. */
  function nextNumberAsync(name, start) {
    if (!backend.reserveNumber) return Promise.resolve(nextNumber(name, start));
    return Promise.resolve(backend.reserveNumber(name, start)).then(function (n) { notify('counters'); return n; });
  }
  function peekNumber(name, start) {
    var c = getDoc('counters') || {};
    return typeof c[name] === 'number' ? c[name] + 1 : start;
  }
  function setNextNumber(name, next) {
    var c = getDoc('counters') || {};
    c[name] = Number(next) - 1;
    return setDoc('counters', c);
  }

  /* =========================================================================
   * גיבוי / ייבוא / ניקוי (D5, D10)
   * ======================================================================= */
  function exportAll() {
    var out = { app: 'the-gallery', schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), collections: {}, singletons: {} };
    COLLECTIONS.forEach(function (c) { out.collections[c] = snapshot(c); });
    SINGLETONS.forEach(function (s) { out.singletons[s] = snapshot(s); });
    return out;
  }
  function importAll(dump) {
    if (!dump || dump.app !== 'the-gallery' || !dump.collections) throw new Error('קובץ הגיבוי לא תקין');
    COLLECTIONS.forEach(function (c) {
      backend.replaceCollection(c, Array.isArray(dump.collections[c]) ? dump.collections[c] : []);
    });
    SINGLETONS.forEach(function (s) {
      if (dump.singletons && dump.singletons[s]) backend.putSingleton(s, dump.singletons[s]);
    });
    COLLECTIONS.concat(SINGLETONS).forEach(notify);
    return true;
  }
  /* keep = רשימת קולקשנים שלא נמחקים (למשל suppliers, reminderRules). settings לא נמחק לעולם. */
  function wipeAll(keep) {
    keep = keep || [];
    COLLECTIONS.forEach(function (c) { if (keep.indexOf(c) === -1) backend.replaceCollection(c, []); });
    backend.putSingleton('counters', {});
    backend.putSingleton('reminderOrder', { ids: [] });
    var meta = getDoc('meta') || {};
    meta.wipedAt = new Date().toISOString();
    meta.seededAt = meta.seededAt || meta.wipedAt; // לא לזרוע דמו מחדש אחרי ניקוי
    backend.putSingleton('meta', meta);
    COLLECTIONS.concat(SINGLETONS).forEach(notify);
  }

  /* =========================================================================
   * הגדרות ברמת מכשיר (לא מסונכרנות): נעילת מנהל, תאריך הצעת גיבוי
   * ======================================================================= */
  var deviceMem = {};
  function deviceGet(k) {
    try { var v = global.localStorage.getItem(DEVICE_NS + k); if (v != null) return v; } catch (e) {}
    return Object.prototype.hasOwnProperty.call(deviceMem, k) ? deviceMem[k] : null;
  }
  function deviceSet(k, v) {
    try { global.localStorage.setItem(DEVICE_NS + k, String(v)); return; } catch (e) {}
    deviceMem[k] = String(v);
  }

  /* =========================================================================
   * הפעלה: בחירת backend, טעינה, ואז זריעה (seed) והפעלת ready
   * ======================================================================= */
  var beforeReady = [];   // פונקציות שרצות אחרי טעינה ולפני ready (seed, defaults)
  function onBeforeReady(fn) { beforeReady.push(fn); }

  function start() {
    if (started) return ready;
    started = true;
    var fs = Gallery.backends && Gallery.backends.firestore;
    var useFs = false;
    try { useFs = !!(fs && fs.enabled && fs.enabled()); } catch (e) { useFs = false; }
    backend = useFs ? fs : createLocalBackend();
    var initP;
    try { initP = Promise.resolve(backend.init()); } catch (e) { initP = Promise.reject(e); }
    initP.catch(function (err) {
      // err.galleryLocal = המשתמש בחר "מצב מקומי" במסך קוד החנות (לא שגיאה)
      if (global.console && !(err && err.galleryLocal)) global.console.error('[gallery] backend init failed, falling back to local', err);
      backend = createLocalBackend();
      return backend.init();
    }).then(function () {
      backend.onExternalChange(function (key) { notify(key); });
      beforeReady.forEach(function (fn) {
        try { fn(); } catch (e) { if (global.console) global.console.error('[gallery] init step failed', e); }
      });
      readyResolve();
    });
    return ready;
  }

  Gallery.backends = Gallery.backends || {};
  Gallery.store = {
    NS: NS, SCHEMA_VERSION: SCHEMA_VERSION,
    COLLECTIONS: COLLECTIONS, SINGLETONS: SINGLETONS,
    uid: uid, clone: clone,
    all: all, find: find, put: put, del: del,
    getDoc: getDoc, setDoc: setDoc,
    subscribe: subscribe, notify: notify,
    nextNumber: nextNumber, nextNumberAsync: nextNumberAsync, peekNumber: peekNumber, setNextNumber: setNextNumber,
    exportAll: exportAll, importAll: importAll, wipeAll: wipeAll,
    deviceGet: deviceGet, deviceSet: deviceSet,
    onBeforeReady: onBeforeReady, start: start, ready: ready,
    backendName: function () { return backend ? backend.name : null; },
    createLocalBackend: createLocalBackend
  };

})(window);
