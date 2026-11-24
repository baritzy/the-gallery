/* =============================================================================
 * sw.js  -  service worker של "הגלריה" (PWA offline-first, W4)
 * OWNER: integration (wave 4). נרשם מ-js/version.js כ-sw.js?v=<Gallery.VERSION>.
 * -----------------------------------------------------------------------------
 * קבצי האפליקציה (אותו origin): NETWORK-FIRST. יש רשת = תמיד הגרסה החדשה מהשרת
 *   (פריסה חדשה נקלטת מיד), והעותק נשמר במטמון. אין רשת = מהמטמון.
 * Firebase SDK (gstatic, גרסה נעוצה) ופונטים: CACHE-FIRST (לא משתנים).
 * Firestore עצמו (firestore.googleapis.com וכו') לא עובר כאן: יש לו מטמון offline משלו.
 * ========================================================================== */

var VERSION = new URL(self.location.href).searchParams.get('v') || 'dev';
var CACHE = 'gallery-' + VERSION;
var Q = '?v=' + VERSION;
var NET_TIMEOUT_MS = 6000;

var SHELL = ['./', 'index.html', 'admin.html', 'workshop.html', 'manifest.json'];
var VERSIONED = [
  'css/tokens.css', 'css/app.css', 'css/foundation.css', 'css/orders.css', 'css/worktable.css',
  'css/inventory.css', 'css/suppliers.css', 'css/customers.css', 'css/reminders.css',
  'css/finance.css', 'css/stats.css', 'css/print.css',
  'js/version.js', 'js/data/store.js', 'js/data/collections.js', 'js/data/orders-model.js', 'js/data/seed.js', 'js/data/trash.js', 'js/data/demo.js',
  'js/data-ext-worktable.js', 'js/data-ext-inventory.js', 'js/data-ext-reminders.js',
  'js/data-firestore.js', 'js/data-firestore-ui.js', 'js/firebase-config.js',
  'js/icons.js', 'js/util.js', 'js/app.js', 'js/flag.js', 'js/trash-ui.js', 'js/order-status-ui.js', 'js/reminder-popup.js',
  'js/admin-gate.js', 'js/settings.js', 'js/orders.js', 'js/orders-form.js', 'js/orders-pay.js',
  'js/worktable.js', 'js/inventory.js', 'js/inventory-raw.js', 'js/inventory-count.js', 'js/inventory-products.js',
  'js/suppliers.js', 'js/customers.js', 'js/reminders.js', 'js/finance.js', 'js/stats.js', 'js/sales.js', 'js/print.js',
  'assets/logo.png', 'assets/icon-180.png', 'assets/icon-192.png', 'assets/icon-512.png'
].map(function (p) { return p + Q; });
/* חייב להיות זהה ל-SDK ב-js/data-firestore.js */
var SDK = 'https://www.gstatic.com/firebasejs/10.14.1/';
var EXTERNAL = ['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(function (f) { return SDK + f; });

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    var local = c.addAll(SHELL.concat(VERSIONED).map(function (u) { return new Request(u, { cache: 'reload' }); }));
    // חיצוני: best effort, לא מפיל את ההתקנה
    var ext = Promise.all(EXTERNAL.map(function (u) {
      return fetch(u, { mode: 'cors' }).then(function (r) { if (r.ok) return c.put(u, r); }).catch(function () {});
    }));
    return Promise.all([local, ext]);
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('gallery-') === 0 && k !== CACHE; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function timeout(p, ms) {
  return new Promise(function (res, rej) {
    var t = setTimeout(function () { rej(new Error('timeout')); }, ms);
    p.then(function (v) { clearTimeout(t); res(v); }, function (err) { clearTimeout(t); rej(err); });
  });
}

function fromCache(req) {
  return caches.open(CACHE).then(function (c) {
    return c.match(req).then(function (hit) {
      if (hit) return hit;
      // גרסה אחרת של אותו קובץ / דף עם פרמטרים (?shop=, ?local=1)
      return c.match(req, { ignoreSearch: true }).then(function (hit2) {
        if (hit2) return hit2;
        if (req.mode === 'navigate') return c.match('index.html');
        return undefined;
      });
    });
  });
}

function networkFirst(req) {
  var url = new URL(req.url);
  // קבצים בלי ?v= (דפי HTML, manifest) תמיד נבדקים מול השרת, גם אם יש להם עותק במטמון ה-HTTP.
  var init = url.searchParams.has('v') ? {} : { cache: 'no-cache' };
  var net = fetch(url.href, Object.assign({ credentials: 'same-origin' }, init)).then(function (res) {
    if (res && res.ok && res.status === 200 && res.type === 'basic') {
      var copy = res.clone();
      caches.open(CACHE).then(function (c) { return c.put(req.mode === 'navigate' ? url.href : req, copy); });
    }
    return res;
  });
  return timeout(net, NET_TIMEOUT_MS).catch(function () {
    return fromCache(req).then(function (hit) { return hit || net; });
  });
}

function cacheFirst(req) {
  return caches.open(CACHE).then(function (c) {
    return c.match(req).then(function (hit) {
      if (hit) return hit;
      return fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      });
    });
  });
}

self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET') return;
  var url = new URL(req.url);
  if (url.origin === self.location.origin) {
    if (url.pathname.slice(-6) === '/sw.js') return;
    e.respondWith(networkFirst(req));
    return;
  }
  if (url.href.indexOf(SDK) === 0 || url.hostname === 'fonts.gstatic.com' || url.hostname === 'fonts.googleapis.com') {
    e.respondWith(cacheFirst(req));
  }
  // כל השאר (Firestore, Auth) עובר ישירות לרשת.
});
