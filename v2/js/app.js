/* =============================================================================
 * app.js  -  ליבת האפליקציה: תפקיד (role), hooks, מודל, טוסט, router וניווט
 * OWNER: foundation (wave 2). ב-wave 3 לא עורכים.
 * -----------------------------------------------------------------------------
 * סדר טעינה: data/*.js -> data-firestore.js -> icons.js -> util.js -> app.js -> מודולים.
 * מודול נרשם עם Gallery.registerView('<tabId>', { mount(el), onShow?() }).
 * ה-init רץ ב-DOMContentLoaded: store.start() -> (admin) שער PIN -> mount לכל הטאבים.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery = global.Gallery || {};
  var I = Gallery.icons;
  var U = Gallery.util;
  var esc = U.esc;

  /* =========================================================================
   * תפקיד (C1 / D3)
   * ======================================================================= */
  var ROLE = document.documentElement.getAttribute('data-role') === 'workshop' ? 'workshop' : 'admin';
  Gallery.role = ROLE;
  /* Gallery.can('money') -> false בסדנה. כל מחיר/עלות/₪ מוצג רק אם can('money'). */
  Gallery.can = function (what) {
    if (what === 'money' || what === 'admin' || what === 'settings') return ROLE === 'admin';
    return true;
  };

  /* =========================================================================
   * Hooks בין מודולים: ברירת מחדל = no-op שמדווח לקונסול.
   * המודול שבעליו מחליף אותם בהגדרה רגילה: Gallery.openSale = function (...) {...}
   * ======================================================================= */
  function stub(name) {
    return function () {
      if (global.console) global.console.info('[gallery] hook not implemented yet: Gallery.' + name);
      return null;
    };
  }
  Gallery.openSale = stub('openSale');                     // sales.js (C)
  Gallery.openOrder = stub('openOrder');                   // orders.js (foundation)
  Gallery.openCustomer = stub('openCustomer');             // customers.js (B)
  Gallery.openBlockedFlag = stub('openBlockedFlag');       // flag.js ברירת מחדל, reminders.js (C) רשאי להחליף
  Gallery.printSupplierList = stub('printSupplierList');   // print.js (A)
  Gallery.openSettings = stub('openSettings');             // settings.js (foundation, admin בלבד)
  /* תאימות v1: OrderDetail.open -> openOrder */
  Gallery.OrderDetail = { open: function (o) { return Gallery.openOrder(o && o.id ? o.id : o); } };

  /* =========================================================================
   * מודל גנרי
   * openModal(node, { wide:true }) / closeModal()
   * ======================================================================= */
  var modalHost = null;
  var modalOnClose = null;
  function openModal(node, opts) {
    closeModal(true);
    opts = opts || {};
    modalHost = document.createElement('div');
    modalHost.className = 'modal-backdrop';
    if (opts.wide) node.classList.add('modal--wide');
    if (opts.xwide) node.classList.add('modal--xwide');
    modalHost.appendChild(node);
    modalHost.addEventListener('mousedown', function (e) { if (e.target === modalHost && !opts.sticky) closeModal(); });
    document.body.appendChild(modalHost);
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onEsc);
    modalOnClose = opts.onClose || null;
    Array.prototype.forEach.call(node.querySelectorAll('[data-close]'), function (b) {
      b.addEventListener('click', function () { closeModal(); });
    });
    if (opts.focus !== false) {
      var first = node.querySelector('[autofocus], input:not([type=hidden]), select, textarea');
      if (first) { try { first.focus({ preventScroll: true }); } catch (e) { first.focus(); } }
    }
    return node;
  }
  function closeModal(silent) {
    if (!modalHost) return;
    document.removeEventListener('keydown', onEsc);
    modalHost.remove();
    modalHost = null;
    document.body.style.overflow = '';
    var cb = modalOnClose; modalOnClose = null;
    if (cb && !silent) { try { cb(); } catch (e) {} }
  }
  function onEsc(e) { if (e.key === 'Escape') closeModal(); }
  /* בונה צומת מודל סטנדרטי: { title, body (html), foot (html) } */
  function modalNode(o) {
    var node = document.createElement('div');
    node.className = 'modal';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    node.innerHTML =
      '<div class="modal__head"><h2 class="modal__title">' + (o.title || '') + '</h2>' +
        '<button class="modal__close" data-close aria-label="סגירה">×</button></div>' +
      '<div class="modal__body">' + (o.body || '') + '</div>' +
      (o.foot ? '<div class="modal__foot">' + o.foot + '</div>' : '');
    return node;
  }
  Gallery.openModal = openModal;
  Gallery.closeModal = closeModal;
  Gallery.modalNode = modalNode;
  Gallery.isModalOpen = function () { return !!modalHost; };

  /* =========================================================================
   * טוסט: Gallery.toast(text, { actions:[{label, primary, onClick}], timeout })
   * ======================================================================= */
  var toastHost = null;
  Gallery.toast = function (text, opts) {
    opts = opts || {};
    if (!toastHost) {
      toastHost = document.createElement('div');
      toastHost.className = 'toast-host';
      toastHost.setAttribute('aria-live', 'polite');
      document.body.appendChild(toastHost);
    }
    var t = document.createElement('div');
    t.className = 'toast';
    t.innerHTML = '<div class="toast__text">' + esc(text) + '</div>' +
      ((opts.actions || []).length ? '<div class="toast__actions">' + opts.actions.map(function (a, i) {
        return '<button class="btn btn--sm ' + (a.primary ? 'btn--primary' : 'btn--ghost') + '" data-ti="' + i + '">' + esc(a.label) + '</button>';
      }).join('') + '</div>' : '');
    function close() { if (t.parentNode) t.remove(); }
    t.addEventListener('click', function (e) {
      var b = e.target.closest('[data-ti]');
      if (!b) return;
      var a = opts.actions[Number(b.getAttribute('data-ti'))];
      close();
      if (a && a.onClick) a.onClick();
    });
    toastHost.appendChild(t);
    var ms = opts.timeout == null ? ((opts.actions || []).length ? 0 : 3500) : opts.timeout;
    if (ms > 0) global.setTimeout(close, ms);
    return { close: close };
  };

  /* =========================================================================
   * רישום מודולים + טאבים לפי תפקיד (C1 / C35 / D3)
   * ======================================================================= */
  var views = {};
  Gallery.registerView = function (id, view) { views[id] = view; };
  Gallery.hasView = function (id) { return !!views[id] && TAB_IDS.indexOf(id) !== -1; };

  var TAB_DEFS = {
    orders:    { label: 'הזמנות',      icon: I.orders,    badge: 'is-red' },
    worktable: { label: 'טבלת עבודה',  icon: I.worktable, badge: 'is-primary' },
    inventory: { label: 'מלאי',        icon: I.inventory, badge: 'is-orange' },
    suppliers: { label: 'ספקים',       icon: I.suppliers, badge: 'is-primary' },
    customers: { label: 'לקוחות',      icon: I.customers, badge: 'is-primary' },
    reminders: { label: 'תזכורות',     icon: I.reminders, badge: 'is-primary' },
    finance:   { label: 'כספים',       icon: I.finance,   badge: 'is-primary' },
    stats:     { label: 'סטטיסטיקה',   icon: I.stats,     badge: 'is-primary' }
  };
  var ROLE_TABS = {
    admin: ['orders', 'worktable', 'inventory', 'suppliers', 'customers', 'reminders', 'finance', 'stats'],
    workshop: ['worktable', 'inventory', 'suppliers', 'reminders']
  };
  var TAB_IDS = ROLE_TABS[ROLE];
  var current = null;

  function navItemHTML(id) {
    var t = TAB_DEFS[id];
    return '<button class="nav__item" role="tab" data-tab="' + id + '">' + t.icon +
      '<span class="lbl">' + t.label + '</span>' +
      '<span class="nav__badge ' + t.badge + '" data-badge="' + id + '"></span></button>';
  }

  function buildNav(tabs) {
    var rail = document.getElementById('rail');
    var roleLabel = ROLE === 'admin' ? 'חנות · ניהול' : 'סדנה';
    var shop = Gallery.data.settings.peek().shop;
    rail.innerHTML =
      '<div class="brand"><img class="brand__logo" src="assets/logo.png?v=' + Gallery.VERSION + '" alt="" />' +
        '<div class="brand__text"><div class="brand__name">' + esc(shop.name || 'הגלריה') + '</div>' +
        '<div class="brand__role">' + roleLabel + '</div></div></div>' +
      '<nav class="nav" role="tablist" aria-label="ניווט ראשי">' + tabs.map(navItemHTML).join('') + '</nav>' +
      '<div class="rail__foot">' +
        (ROLE === 'admin' ? '<button class="rail__tool" data-settings>' + I.gear + '<span>הגדרות וגיבוי</span></button>' : '') +
        '<a class="rail__tool rail__tool--link" href="index.html">' + I.back + '<span>מסך בחירה</span></a>' +
      '</div>';

    var bottom = document.getElementById('bottombar');
    bottom.innerHTML = tabs.map(navItemHTML).join('') +
      (ROLE === 'admin' ? '<button class="nav__item" data-settings>' + I.gear + '<span class="lbl">הגדרות</span></button>' : '');

    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (btn) {
      btn.addEventListener('click', function () { switchTab(btn.getAttribute('data-tab')); });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-settings]'), function (btn) {
      btn.addEventListener('click', function () { Gallery.openSettings(); });
    });
  }

  function switchTab(id) {
    if (TAB_IDS.indexOf(id) === -1 || !views[id]) return;
    current = id;
    Array.prototype.forEach.call(document.querySelectorAll('[data-tab]'), function (btn) {
      if (btn.getAttribute('data-tab') === id) btn.setAttribute('aria-current', 'page');
      else btn.removeAttribute('aria-current');
    });
    Array.prototype.forEach.call(document.querySelectorAll('.view'), function (v) {
      v.classList.toggle('is-active', v.getAttribute('data-view') === id);
    });
    Gallery.store.deviceSet('lastTab:' + ROLE, id);
    if (views[id].onShow) { try { views[id].onShow(); } catch (e) { global.console.error(e); } }
    global.scrollTo(0, 0);
  }
  Gallery.switchTab = switchTab;
  Gallery.currentTab = function () { return current; };

  Gallery.updateBadge = function (tabId, count) {
    Array.prototype.forEach.call(document.querySelectorAll('[data-badge="' + tabId + '"]'), function (b) {
      b.textContent = count > 0 ? String(count) : '';
    });
  };

  /* =========================================================================
   * Init
   * ======================================================================= */
  var readyFns = [];
  var uiReady = false;
  /* Gallery.onReady(fn): רץ אחרי שכל הטאבים הורכבו (למשל הצעת גיבוי יומי) */
  Gallery.onReady = function (fn) { if (uiReady) fn(); else readyFns.push(fn); };

  function initUI() {
    var tabs = TAB_IDS.filter(function (id) { return !!views[id]; });
    TAB_IDS = tabs;
    buildNav(tabs);
    var main = document.getElementById('main');
    tabs.forEach(function (id) {
      var sec = document.createElement('section');
      sec.className = 'view';
      sec.setAttribute('data-view', id);
      sec.setAttribute('role', 'tabpanel');
      sec.setAttribute('aria-label', TAB_DEFS[id].label);
      main.appendChild(sec);
      try { views[id].mount(sec); } catch (e) {
        global.console.error('[gallery] mount failed: ' + id, e);
        sec.innerHTML = '<div class="empty"><h3>המסך הזה לא נטען</h3><p>' + esc(e.message) + '</p></div>';
      }
    });
    var last = Gallery.store.deviceGet('lastTab:' + ROLE);
    switchTab(last && tabs.indexOf(last) !== -1 ? last : tabs[0]);
    document.documentElement.classList.add('is-ready');
    uiReady = true;
    readyFns.forEach(function (fn) { try { fn(); } catch (e) { global.console.error(e); } });
  }

  function boot() {
    Gallery.store.start()
      .then(function () { if (ROLE === 'admin' && Gallery.adminGate) return Gallery.adminGate(); })
      .then(initUI)
      .catch(function (e) { global.console.error('[gallery] boot failed', e); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else global.setTimeout(boot, 0);

})(window);
