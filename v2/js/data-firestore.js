/* =============================================================================
 * data-firestore.js  -  backend של Firestore ל"הגלריה" (C2, D4)
 * OWNER: agent D (wave 3).
 * -----------------------------------------------------------------------------
 * מבנה בענן (פרויקט the-gallery-ks):
 *   shops/{shopCode}/{collection}/{id}     מסמך לכל רשומה (orders, customers, frames ...)
 *   shops/{shopCode}/singletons/{key}      settings, counters, reminderOrder, meta
 * קוד החנות לא נמצא בריפו: נשמר במכשיר (device:shopCode) אחרי מסך "קוד חנות".
 *
 * מצבים במכשיר (device:syncMode):
 *   'cloud'  -> Firestore (Anonymous Auth, מטמון offline ב-IndexedDB, onSnapshot לכל קולקשן)
 *   'local'  -> localStorage בלבד (התנהגות הדמו הישנה). store.js נופל ל-LocalBackend.
 *   ריק      -> מסך "קוד חנות". ב-localhost ברירת המחדל מקומית (פיתוח), אלא אם ?sync=1.
 * פרמטרים ב-URL: ?shop=CODE (חיבור ישיר), ?sync=1 (להציג את מסך הקוד), ?local=1 (מקומי לטעינה הזו).
 *
 * הממשק ל-store.js: init, read, putDoc, deleteDoc, replaceCollection, putSingleton,
 * nextNumber (סינכרוני, אופטימי), reserveNumber (טרנזקציה, async), onExternalChange.
 * API ציבורי למתאם: Gallery.backend (ראו בסוף הקובץ).
 * UI (מסך קוד חנות, מחוון סנכרון) בקובץ js/data-firestore-ui.js שנטען מכאן.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery = global.Gallery || {};
  Gallery.backends = Gallery.backends || {};
  var S = Gallery.store;

  var SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
  var V = '?v=' + (Gallery.VERSION || '');   // W4: גרסה אחת משותפת (js/version.js)
  var FIRST_SYNC_MS = 15000;    // חיבור ראשון לחנות במכשיר: מחכים לשרת עד 15 שניות
  var TXN_MS = 6000;            // טרנזקציית מספר רץ: אחרי 6 שניות נופלים למספר מקומי
  var BATCH = 400;              // מגבלת Firestore היא 500 פעולות ל-batch
  var CODE_RE = /^[a-z0-9-]{6,64}$/;

  /* ------------------------------------------------------------------ עזרים */
  function loadScript(src) {
    return new Promise(function (res, rej) {
      var s = document.createElement('script');
      s.src = src; s.async = false;
      s.onload = function () { res(); };
      s.onerror = function () { rej(new Error('failed to load ' + src)); };
      (document.head || document.documentElement).appendChild(s);
    });
  }
  function normCode(v) { return String(v || '').trim().toLowerCase().replace(/\s+/g, '-'); }
  function validCode(v) { return CODE_RE.test(String(v || '')); }
  function isDevHost() {
    return location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/.test(location.hostname);
  }
  function qp(name) { try { return new URLSearchParams(location.search).get(name); } catch (e) { return null; } }
  function hasQp(name) { return qp(name) !== null; }
  function stripQp(name) {
    try {
      var u = new URL(location.href); u.searchParams.delete(name);
      history.replaceState(null, '', u.pathname + u.search + u.hash);
    } catch (e) {}
  }
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).sort().map(function (k) { return JSON.stringify(k) + ':' + stable(v[k]); }).join(',') + '}';
  }
  function indexOfId(arr, id) { for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return i; return -1; }
  function byCreated(a, b) {
    var x = a.createdAt || '', y = b.createdAt || '';
    return x < y ? -1 : x > y ? 1 : (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  }
  function withTimeout(p, ms) {
    return new Promise(function (res, rej) {
      var t = global.setTimeout(function () { rej(new Error('timeout')); }, ms);
      p.then(function (v) { global.clearTimeout(t); res(v); }, function (e) { global.clearTimeout(t); rej(e); });
    });
  }
  function localErr(why) { var e = new Error('gallery: local mode (' + why + ')'); e.galleryLocal = true; return e; }

  /* ----------------------------------------------------- בחירת מצב במכשיר */
  var decided = (function decide() {
    if (hasQp('local')) return 'local';
    var shopParam = normCode(qp('shop'));
    if (shopParam && validCode(shopParam)) {
      S.deviceSet('shopCode', shopParam); S.deviceSet('syncMode', 'cloud'); stripQp('shop');
    }
    var mode = S.deviceGet('syncMode');
    if (hasQp('sync')) { stripQp('sync'); return 'ask'; }
    if (mode === 'local') return 'local';
    if (mode === 'cloud' && validCode(S.deviceGet('shopCode'))) return 'cloud';
    if (isDevHost()) return 'local';
    return 'ask';
  })();

  // ה-UI נטען מיד (במקביל לשאר הדף), כדי שיהיה מוכן כש-init() צריך אותו.
  var uiP = loadScript('js/data-firestore-ui.js' + V).catch(function (e) {
    if (global.console) global.console.warn('[gallery-sync] UI file failed to load', e);
  });
  function UI() { return Gallery.syncUI || null; }

  /* --------------------------------------------------------------- מצב */
  var fb = null, db = null, auth = null, shop = null;
  var mirror = {};
  var externalCb = null;
  var listeners = {};          // key -> { seen, server, fromCache }
  var state = { mode: 'local', shop: null, status: 'local', pending: 0, error: null };
  var statusSubs = [];

  function setStatus() {
    if (state.mode !== 'cloud') state.status = 'local';
    else if (state.error) state.status = 'error';
    else if (!navigator.onLine || anyFromCache()) state.status = 'offline';
    else if (state.pending > 0) state.status = 'syncing';
    else state.status = 'synced';
    statusSubs.slice().forEach(function (cb) { try { cb(publicStatus()); } catch (e) {} });
  }
  function anyFromCache() {
    var k; for (k in listeners) if (listeners[k].fromCache) return true; return false;
  }
  function publicStatus() {
    return { mode: state.mode, shop: state.shop, status: state.status, pending: state.pending, error: state.error ? String(state.error.message || state.error) : null };
  }
  function online() { return navigator.onLine && !anyFromCache(); }

  function track(p, what) {
    state.pending++; setStatus();
    return p.then(function () {
      state.pending--; state.error = null; setStatus();
    }, function (err) {
      state.pending--;
      state.error = err || new Error('write failed');
      if (global.console) global.console.error('[gallery-sync] write failed: ' + what, err);
      setStatus();
    });
  }

  /* ------------------------------------------------------------- refs */
  function colRef(col) { return fb.fs.collection(db, 'shops', shop, col); }
  function docRef(col, id) { return fb.fs.doc(db, 'shops', shop, col, id); }
  function singRef(key) { return fb.fs.doc(db, 'shops', shop, 'singletons', key); }

  /* ------------------------------------------------- snapshot -> מראה */
  // מסמך עם כתיבה מקומית ממתינה מדולג: המראה כבר מכילה את הגרסה המקומית האחרונה.
  // כשהשרת מאשר מגיע snapshot נוסף בלי pending, ואז משווים ומעדכנים רק אם באמת שונה.
  function applyCollection(col, snap, first) {
    var arr = mirror[col] || (mirror[col] = []);
    var changed = false;
    snap.docChanges({ includeMetadataChanges: true }).forEach(function (ch) {
      var id = ch.doc.id, idx = indexOfId(arr, id);
      if (ch.type === 'removed') {
        if (idx !== -1 && !ch.doc.metadata.hasPendingWrites) { arr.splice(idx, 1); changed = true; }
        return;
      }
      if (ch.doc.metadata.hasPendingWrites && !first) return;
      var data = ch.doc.data();
      if (!data.id) data.id = id;
      if (idx === -1) { arr.push(data); changed = true; }
      else if (stable(arr[idx]) !== stable(data)) { arr[idx] = data; changed = true; }
    });
    if (first) arr.sort(byCreated);
    return changed;
  }
  function applySingletons(snap, first) {
    var changedKeys = [];
    snap.docChanges({ includeMetadataChanges: true }).forEach(function (ch) {
      var key = ch.doc.id;
      if (S.SINGLETONS.indexOf(key) === -1) return;
      if (ch.doc.metadata.hasPendingWrites && !first) return;
      var val = ch.type === 'removed' ? null : ch.doc.data();
      if (stable(mirror[key] == null ? null : mirror[key]) !== stable(val)) { mirror[key] = val; changedKeys.push(key); }
    });
    return changedKeys;
  }

  function listen(key, ref, onFirst, onFirstServer) {
    var L = listeners[key] = { seen: false, server: false, fromCache: true };
    fb.fs.onSnapshot(ref, { includeMetadataChanges: true }, function (snap) {
      var first = !L.seen;
      L.fromCache = snap.metadata.fromCache;
      var changed = key === 'singletons' ? applySingletons(snap, first) : (applyCollection(key, snap, first) ? [key] : []);
      if (first) { L.seen = true; onFirst(); }
      if (!L.server && !snap.metadata.fromCache) { L.server = true; onFirstServer(); }
      if (!first && externalCb) changed.forEach(function (k) { externalCb(k, mirror[k]); });
      setStatus();
    }, function (err) {
      state.error = err;
      if (global.console) global.console.error('[gallery-sync] listener failed: ' + key, err);
      setStatus();
    });
  }

  function loadAll() {
    var keys = S.COLLECTIONS.concat(['singletons']);
    var syncedBefore = S.deviceGet('cloudSynced:' + shop) === '1';
    S.COLLECTIONS.forEach(function (c) { mirror[c] = []; });
    S.SINGLETONS.forEach(function (k) { mirror[k] = null; });
    return new Promise(function (resolve, reject) {
      var done = false;
      function count(prop) { return keys.filter(function (k) { return listeners[k] && listeners[k][prop]; }).length; }
      function check() {
        if (done) return;
        var allSeen = count('seen') === keys.length, allServer = count('server') === keys.length;
        if (allServer) S.deviceSet('cloudSynced:' + shop, '1');
        if (allSeen && (syncedBefore || allServer)) { done = true; resolve(); }
      }
      keys.forEach(function (k) {
        listen(k, k === 'singletons' ? colRef('singletons') : colRef(k), check, check);
      });
      global.setTimeout(function () {
        if (done) return;
        done = true;
        var e = new Error('first sync timeout'); e.firstSync = true; reject(e);
      }, FIRST_SYNC_MS);
    });
  }

  /* --------------------------------------------------- התחברות לענן */
  function ensureAuth() {
    return new Promise(function (res, rej) {
      var settled = false, unsub = null;
      unsub = fb.auth.onAuthStateChanged(auth, function (user) {
        if (settled) return; settled = true;
        if (unsub) global.setTimeout(unsub, 0);
        if (user) return res(user);
        fb.auth.signInAnonymously(auth).then(function (c) { res(c.user); }, rej);
      }, rej);
    });
  }

  function startFirebase() {
    return loadScript('js/firebase-config.js' + V).then(function () {
      var cfg = global.GALLERY_FIREBASE_CONFIG;
      if (!cfg || !cfg.projectId) throw new Error('missing GALLERY_FIREBASE_CONFIG');
      return Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js'), import(SDK + 'firebase-firestore.js')])
        .then(function (m) {
          fb = { app: m[0], auth: m[1], fs: m[2] };
          var app = fb.app.getApps().length ? fb.app.getApp() : fb.app.initializeApp(cfg);
          try {
            db = fb.fs.initializeFirestore(app, {
              localCache: fb.fs.persistentLocalCache({ tabManager: fb.fs.persistentMultipleTabManager() })
            });
          } catch (e) {
            if (global.console) global.console.warn('[gallery-sync] persistent cache unavailable, memory cache', e);
            db = fb.fs.getFirestore(app);
          }
          auth = fb.auth.getAuth(app);
          return ensureAuth();
        });
    }).then(loadAll).then(function () {
      // חנות חדשה בענן: לא זורעים דמו. seed.js זורע רק את 3 הספקים, collections.js את כללי התזכורות.
      var meta = mirror.meta || {};
      if (!meta.seededAt) {
        var now = new Date().toISOString();
        backend.putSingleton('meta', Object.assign({}, meta, { seededAt: now, cloudShop: true, cloudCreatedAt: meta.cloudCreatedAt || now }));
      }
      state.mode = 'cloud'; state.shop = shop; setStatus();
    });
  }

  function connect() {
    return startFirebase().catch(function (err) {
      if (global.console) global.console.warn('[gallery-sync] connect failed', err);
      var ui = UI();
      if (!ui) throw localErr('no ui');
      var msg = err && err.firstSync
        ? 'החיבור הראשון לחנות במכשיר הזה צריך אינטרנט. בדקו את החיבור ונסו שוב.'
        : 'לא הצלחנו להתחבר לענן. בדקו את החיבור לאינטרנט ונסו שוב.';
      return ui.showError({ title: 'אין חיבור לענן', text: msg }).then(function (choice) {
        if (choice === 'retry') { location.reload(); return new Promise(function () {}); }
        if (choice === 'change') { S.deviceSet('syncMode', ''); S.deviceSet('shopCode', ''); location.reload(); return new Promise(function () {}); }
        throw localErr('user chose local after error');
      });
    });
  }

  /* ------------------------------------------------- ה-backend עצמו */
  var backend = {
    name: 'firestore',
    persistent: true,
    enabled: function () { return decided === 'cloud' || decided === 'ask'; },

    init: function () {
      return uiP.then(function () {
        if (decided !== 'ask') { shop = S.deviceGet('shopCode'); return; }
        var ui = UI();
        if (!ui) throw localErr('no ui');
        return ui.askShopCode({ validate: validCode, normalize: normCode, last: S.deviceGet('shopCode') || '' }).then(function (res) {
          if (!res || res.local) { S.deviceSet('syncMode', 'local'); throw localErr('user chose local'); }
          shop = res.code;
          S.deviceSet('shopCode', shop); S.deviceSet('syncMode', 'cloud');
        });
      }).then(connect);
    },

    read: function (key) { return mirror[key] == null ? null : mirror[key]; },

    putDoc: function (col, rec) {
      var arr = mirror[col] || (mirror[col] = []);
      var idx = indexOfId(arr, rec.id), prev = idx === -1 ? null : arr[idx];
      if (idx === -1) arr.push(rec); else arr[idx] = rec;
      var ref = docRef(col, rec.id);
      if (!prev) { track(fb.fs.setDoc(ref, rec), 'set ' + col + '/' + rec.id); return; }
      // עדכון ברמת שדה עליון: שינוי של מכשיר אחר בשדה אחר באותה רשומה לא נדרס.
      var args = [ref], keys = {};
      Object.keys(prev).concat(Object.keys(rec)).forEach(function (k) { keys[k] = 1; });
      Object.keys(keys).forEach(function (k) {
        var has = Object.prototype.hasOwnProperty.call(rec, k);
        if (has && stable(prev[k]) === stable(rec[k])) return;
        args.push(new fb.fs.FieldPath(k), has ? rec[k] : fb.fs.deleteField());
      });
      if (args.length === 1) return;
      track(fb.fs.updateDoc.apply(null, args).catch(function (err) {
        if (err && err.code === 'not-found') return fb.fs.setDoc(ref, rec);
        throw err;
      }), 'update ' + col + '/' + rec.id);
    },

    deleteDoc: function (col, id) {
      mirror[col] = (mirror[col] || []).filter(function (r) { return r.id !== id; });
      track(fb.fs.deleteDoc(docRef(col, id)), 'delete ' + col + '/' + id);
    },

    replaceCollection: function (col, list) {
      list = Array.isArray(list) ? list : [];
      var prev = mirror[col] || [], prevById = {}, nextIds = {}, ops = [];
      prev.forEach(function (r) { prevById[r.id] = r; });
      list.forEach(function (r) {
        if (!r || !r.id) return;
        nextIds[r.id] = 1;
        if (!prevById[r.id] || stable(prevById[r.id]) !== stable(r)) ops.push({ set: docRef(col, r.id), data: r });
      });
      prev.forEach(function (r) { if (!nextIds[r.id]) ops.push({ del: docRef(col, r.id) }); });
      mirror[col] = list.filter(function (r) { return r && r.id; });
      commitOps(ops, 'replace ' + col);
    },

    putSingleton: function (key, obj) {
      mirror[key] = obj == null ? null : obj;
      if (obj == null) track(fb.fs.deleteDoc(singRef(key)), 'delete singleton ' + key);
      else track(fb.fs.setDoc(singRef(key), obj), 'set singleton ' + key);
    },

    /* סינכרוני (חוזה ה-store הישן): מספר אופטימי מהמראה + increment בשרת, כך שהמונה בענן
       לא חוזר אחורה גם אם הכתיבה נשלחת אחרי שהמכשיר חוזר לרשת. */
    nextNumber: function (name, start) {
      var c = Object.assign({}, mirror.counters || {});
      var had = typeof c[name] === 'number';
      var n = (had ? c[name] : start - 1) + 1;
      c[name] = n; mirror.counters = c;
      var patch = {}; patch[name] = had ? fb.fs.increment(1) : n;
      track(fb.fs.setDoc(singRef('counters'), patch, { merge: true }), 'counter ' + name);
      return n;
    },

    /* async: מספר ייחודי בין המכשירים בטרנזקציה על singletons/counters.
       לא מקוון או טרנזקציה איטית -> נפילה ל-nextNumber המקומי (סיכון כפילות רק אם שני מכשירים
       יוצרים הזמנה בו זמנית כששניהם לא מקוונים). */
    reserveNumber: function (name, start) {
      if (!online()) return Promise.resolve(backend.nextNumber(name, start));
      var ref = singRef('counters');
      var txn = fb.fs.runTransaction(db, function (t) {
        return t.get(ref).then(function (snap) {
          var d = snap.exists() ? snap.data() : {};
          var n = (typeof d[name] === 'number' ? d[name] : start - 1) + 1;
          var patch = {}; patch[name] = n;
          t.set(ref, patch, { merge: true });
          return n;
        });
      }, { maxAttempts: 5 });
      return withTimeout(txn, TXN_MS).then(function (n) {
        var c = Object.assign({}, mirror.counters || {});
        c[name] = Math.max(typeof c[name] === 'number' ? c[name] : 0, n);
        mirror.counters = c;
        return n;
      }, function (err) {
        if (global.console) global.console.warn('[gallery-sync] counter transaction failed, local fallback', err);
        return backend.nextNumber(name, start);
      });
    },

    onExternalChange: function (cb) { externalCb = cb; }
  };

  function commitOps(ops, what) {
    for (var i = 0; i < ops.length; i += BATCH) {
      var b = fb.fs.writeBatch(db);
      ops.slice(i, i + BATCH).forEach(function (op) { if (op.del) b.delete(op.del); else b.set(op.set, op.data); });
      track(b.commit(), what + ' batch ' + (i / BATCH + 1));
    }
  }

  Gallery.backends.firestore = backend;

  /* =========================================================================
   * Gallery.backend: API ציבורי (עובד בשני המצבים)
   * ======================================================================= */
  function isCloud() { return S.backendName() === 'firestore' && state.mode === 'cloud'; }

  Gallery.backend = {
    mode: function () { return isCloud() ? 'cloud' : 'local'; },
    shopCode: function () { return isCloud() ? shop : null; },
    status: function () { if (!isCloud()) { state.mode = 'local'; } setStatus(); return publicStatus(); },
    onStatus: function (cb) {
      statusSubs.push(cb);
      try { cb(Gallery.backend.status()); } catch (e) {}
      return function () { statusSubs = statusSubs.filter(function (f) { return f !== cb; }); };
    },

    /* כל נתוני החנות כ-JSON (אותו פורמט כמו Gallery.data.exportAll + shopCode). לגיבוי היומי. */
    exportAll: function () {
      return S.ready.then(function () {
        var dump = S.exportAll();
        dump.backend = Gallery.backend.mode();
        dump.shopCode = Gallery.backend.shopCode();
        return dump;
      });
    },

    /* מחכה שכל הכתיבות הממתינות יגיעו לשרת (למשל לפני גיבוי). מקומי: מיד. */
    flush: function () {
      if (!isCloud()) return Promise.resolve(true);
      return fb.fs.waitForPendingWrites(db).then(function () { return true; });
    },

    /* העברה חד פעמית: הנתונים שנשמרו במכשיר הזה במצב מקומי (localStorage, gallery:v3:*) -> הענן.
       opts.overwrite: לדרוס רשומות עם אותו id שכבר קיימות בענן (ברירת מחדל: לא).
       opts.force: להעביר גם אם בענן כבר יש הזמנות או קבלות (סכנת מספרים כפולים).
       מחזיר Promise<{ total, collections: {col: n}, skipped }>. */
    migrateLocalToCloud: function (opts) {
      opts = opts || {};
      return S.ready.then(function () {
        if (!isCloud()) throw new Error('ההעברה זמינה רק כשהמכשיר מחובר לחנות בענן');
        var cloudHasWork = (mirror.orders || []).length || (mirror.receipts || []).length;
        if (cloudHasWork && !opts.force) throw new Error('בענן כבר יש הזמנות או קבלות. ההעברה מיועדת לחנות ריקה.');
        var local = S.createLocalBackend();
        return Promise.resolve(local.init()).then(function () {
          var out = { total: 0, skipped: 0, collections: {} }, ops = [], touched = [];
          S.COLLECTIONS.forEach(function (col) {
            var arr = mirror[col] || (mirror[col] = []);
            var n = 0;
            (local.read(col) || []).forEach(function (rec) {
              if (!rec || !rec.id) return;
              var idx = indexOfId(arr, rec.id);
              if (idx !== -1 && !opts.overwrite) { out.skipped++; return; }
              if (idx === -1) arr.push(rec); else arr[idx] = rec;
              ops.push({ set: docRef(col, rec.id), data: rec }); n++;
            });
            if (n) { out.collections[col] = n; out.total += n; touched.push(col); }
          });
          commitOps(ops, 'migrate');
          // מונים: המקסימום בין המקומי לענן, כדי שמספרים חדשים לא יתנגשו במספרים שהועברו.
          var lc = local.read('counters') || {}, cc = Object.assign({}, mirror.counters || {});
          Object.keys(lc).forEach(function (k) { if (typeof lc[k] === 'number') cc[k] = Math.max(cc[k] || 0, lc[k]); });
          backend.putSingleton('counters', cc);
          var ls = local.read('settings');
          if (ls) backend.putSingleton('settings', Object.assign({}, ls, mirror.settings || {}, { shop: Object.assign({}, ls.shop || {}, (mirror.settings || {}).shop || {}) }));
          var lo = local.read('reminderOrder');
          if (lo && (!mirror.reminderOrder || !(mirror.reminderOrder.ids || []).length)) backend.putSingleton('reminderOrder', lo);
          backend.putSingleton('meta', Object.assign({}, mirror.meta || {}, { migratedAt: new Date().toISOString(), migratedCount: out.total }));
          touched.concat(S.SINGLETONS).forEach(function (k) { S.notify(k); });
          return out;
        });
      });
    },

    /* מעבר מצב במכשיר (טוען מחדש את הדף). */
    connect: function (code) {
      code = normCode(code);
      if (!validCode(code)) throw new Error('קוד חנות לא תקין');
      S.deviceSet('shopCode', code); S.deviceSet('syncMode', 'cloud'); location.reload();
    },
    askAgain: function () { S.deviceSet('syncMode', ''); location.href = location.pathname + '?sync=1'; },
    useLocal: function () { S.deviceSet('syncMode', 'local'); location.reload(); },
    validCode: validCode, normCode: normCode
  };

  global.addEventListener('online', setStatus);
  global.addEventListener('offline', setStatus);

  // מחוון הסנכרון: אחרי ש-store מוכן (בשני המצבים).
  function mountIndicator() {
    S.ready.then(function () { return uiP; }).then(function () {
      if (!isCloud()) state.mode = 'local';
      setStatus();
      if (UI()) UI().mountIndicator(Gallery.backend);
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mountIndicator);
  else mountIndicator();

})(window);
