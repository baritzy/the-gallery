/* =============================================================================
 * orders.js  -  מודול "הזמנות" (טאב 1)
 * רשימת שורות נפתחות, חיפוש + סינון, דחופים לראש, טופס הזמנה חדשה עם יתרה חיה.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var DB = Gallery.DB;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;

  var container = null;
  var listEl = null;
  var orders = [];
  var profiles = [];   // לצורך בורר פרופיל בטופס
  var openIds = {};    // איזה שורות פתוחות
  var state = { term: '', filter: 'all', sort: 'target' };

  var FILTERS = [
    { id: 'all',     label: 'הכל' },
    { id: 'late',    label: 'באיחור' },
    { id: 'in-work', label: 'בעבודה' },
    { id: 'ready',   label: 'מוכנות' }
  ];

  /* ------------------------------------------------------------------ mount */
  function mount(el) {
    container = el;
    container.innerHTML =
      '<div class="view__head">' +
        '<div><h1 class="view__title">הזמנות</h1>' +
        '<p class="view__subtitle">כל ההזמנות מהחנות עד המסירה. דחופים עולים לראש.</p></div>' +
        '<button class="btn btn--primary" data-new>' + I.plus + 'הזמנה חדשה</button>' +
      '</div>' +
      '<div class="toolbar">' +
        '<div class="search">' + I.search +
          '<input type="search" data-search placeholder="חיפוש לפי שם, טלפון, תיאור..." aria-label="חיפוש הזמנות">' +
        '</div>' +
        '<div class="chips" data-filters></div>' +
        '<select class="select" data-sort aria-label="מיון">' +
          '<option value="target">מיון: יעד אספקה</option>' +
          '<option value="opened">מיון: תאריך פתיחה</option>' +
          '<option value="name">מיון: שם לקוח</option>' +
        '</select>' +
      '</div>' +
      '<div class="list" data-list></div>';

    listEl = container.querySelector('[data-list]');

    container.querySelector('[data-new]').addEventListener('click', function () { openForm(null); });
    container.querySelector('[data-search]').addEventListener('input', function (e) {
      state.term = e.target.value.trim(); renderList();
    });
    container.querySelector('[data-sort]').addEventListener('change', function (e) {
      state.sort = e.target.value; renderList();
    });

    // delegation על הרשימה
    listEl.addEventListener('click', onListClick);

    DB.subscribeProfiles(function (p) { profiles = p; });
    DB.subscribeOrders(function (o) { orders = o; renderFilters(); renderList(); });
  }

  /* --------------------------------------------------------------- filters */
  function renderFilters() {
    var wrap = container.querySelector('[data-filters]');
    wrap.innerHTML = FILTERS.map(function (f) {
      var count = countFor(f.id);
      return '<button class="fchip" data-filter="' + f.id + '" aria-pressed="' + (state.filter === f.id) + '">' +
        esc(f.label) + '<span class="cnt">' + count + '</span></button>';
    }).join('');
    Array.prototype.forEach.call(wrap.querySelectorAll('[data-filter]'), function (btn) {
      btn.addEventListener('click', function () {
        state.filter = btn.getAttribute('data-filter');
        renderFilters(); renderList();
      });
    });
  }

  function countFor(fid) {
    return orders.filter(function (o) { return matchFilter(o, fid); }).length;
  }
  function matchFilter(o, fid) {
    if (fid === 'all') return o.status !== 'delivered';
    if (fid === 'late') return U.urgency(o).level === 'late';
    if (fid === 'in-work') return o.status === 'in-work';
    if (fid === 'ready') return o.status === 'ready';
    return true;
  }
  function matchTerm(o) {
    if (!state.term) return true;
    var t = state.term.toLowerCase();
    return (o.customerName || '').toLowerCase().indexOf(t) !== -1 ||
      (o.phone || '').indexOf(t) !== -1 ||
      (o.imageDesc || '').toLowerCase().indexOf(t) !== -1 ||
      (o.frameDesc || '').toLowerCase().indexOf(t) !== -1 ||
      (o.orderNo || '').indexOf(t) !== -1;
  }

  /* ------------------------------------------------------------------ list */
  function renderList() {
    var rows = orders.filter(function (o) { return matchFilter(o, state.filter) && matchTerm(o); });

    rows.sort(function (a, b) {
      // דחופים (late) תמיד לראש
      var la = U.urgency(a).level === 'late', lb = U.urgency(b).level === 'late';
      if (la !== lb) return la ? -1 : 1;
      if (state.sort === 'name') return (a.customerName || '').localeCompare(b.customerName || '', 'he');
      if (state.sort === 'opened') return new Date(b.openedAt) - new Date(a.openedAt);
      return new Date(a.deliveryTarget) - new Date(b.deliveryTarget); // target
    });

    if (rows.length === 0) {
      listEl.innerHTML = emptyState();
      var clr = listEl.querySelector('[data-clear]');
      if (clr) clr.addEventListener('click', function () {
        state.term = ''; state.filter = 'all';
        container.querySelector('[data-search]').value = '';
        renderFilters(); renderList();
      });
      var nw = listEl.querySelector('[data-new-empty]');
      if (nw) nw.addEventListener('click', function () { openForm(null); });
      return;
    }

    listEl.innerHTML = rows.map(rowHTML).join('');
    // reapply open state
    Array.prototype.forEach.call(listEl.querySelectorAll('.row'), function (r) {
      if (openIds[r.getAttribute('data-id')]) r.classList.add('open');
    });
  }

  function emptyState() {
    if (state.term || state.filter !== 'all') {
      return '<div class="empty">' + I.frameEmpty +
        '<h3>לא נמצאה הזמנה שמתאימה לחיפוש</h3>' +
        '<p>נסה מונח אחר או נקה את הסינון.</p>' +
        '<button class="btn btn--secondary" data-clear>ניקוי סינון</button></div>';
    }
    return '<div class="empty">' + I.frameEmpty +
      '<h3>עדיין אין הזמנות פה</h3>' +
      '<p>פתח הזמנה חדשה והיא תופיע כאן וגם בסדנה למעלה.</p>' +
      '<button class="btn btn--primary" data-new-empty>' + I.plus + 'פתיחת הזמנה חדשה</button></div>';
  }

  /* -------------------------------------------------------------- row HTML */
  function rowHTML(o) {
    var color = U.displayColor(o);
    var d = U.dayNumber(o);
    var chipCls = U.dayChipClass(o);
    var showChip = o.status !== 'delivered';

    var head =
      '<button class="row__head" aria-expanded="' + !!openIds[o.id] + '" data-toggle>' +
        '<span class="row__id">#' + esc(o.orderNo) + '</span>' +
        '<span class="row__main">' +
          '<span class="row__name">' + esc(o.customerName) + '</span>' +
          '<span class="row__meta">' + esc(o.frameDesc || 'מסגרת') +
            ' · <span class="mono">' + o.width + '×' + o.height + '</span></span>' +
        '</span>' +
        '<span class="row__spacer"></span>' +
        (showChip ? '<span class="chip ' + chipCls + '">' + I.clock + 'יום ' + d + ' / 10</span>' : '') +
        '<span class="row__balance">' + U.fmtMoney(o.balance) + '</span>' +
        pill(o) +
        I.chevron +
      '</button>';

    return '<div class="row" data-id="' + o.id + '" style="--spine:' + U.statusVar(color) + '">' +
      head +
      '<div class="row__panel"><div class="inner">' + panelHTML(o) + '</div></div>' +
      '</div>';
  }

  function pill(o) {
    var color = U.displayColor(o);
    return '<span class="pill is-' + color + '"><span class="dot"></span>' +
      esc(U.STATUS_LABEL[o.status]) + '</span>';
  }

  function panelHTML(o) {
    var d = U.dayNumber(o);
    var pct = Math.min(100, Math.round(d / 10 * 100));
    var color = U.displayColor(o);

    function f(k, v, strong) {
      return '<div class="field"><div class="k">' + k + '</div><div class="v' +
        (strong ? ' strong' : '') + '">' + v + '</div></div>';
    }
    function fmono(k, v) {
      return '<div class="field"><div class="k">' + k + '</div><div class="v mono">' + v + '</div></div>';
    }
    function chk(label, on, extra) {
      return '<span class="check-tag' + (on ? ' on' : '') + '"><span class="dot"></span>' +
        label + (on && extra ? ' · ' + esc(extra) : (on ? '' : ': לא')) + '</span>';
    }

    var grid = '<div class="dgrid">' +
      f('טלפון', '<span class="mono">' + esc(o.phone) + '</span>') +
      f('תיאור התמונה', esc(o.imageDesc || '-')) +
      f('מסגרת', esc(o.frameDesc || '-')) +
      fmono('מק"ט מסגרת', esc(o.profileSku || '-')) +
      fmono('מידות', o.width + '×' + o.height) +
      f('תאריך פתיחה', U.fmtDate(o.openedAt)) +
      f('יעד אספקה', U.fmtDate(o.deliveryTarget)) +
      f('מחיר כולל', U.fmtMoney(o.price)) +
      f('מקדמה', U.fmtMoney(o.deposit)) +
      f('יתרה לתשלום', U.fmtMoney(o.balance), true) +
      '</div>';

    var checks = '<div class="checks">' +
      chk('זכוכית', o.glass, o.glassType) +
      chk('גב', o.backing) +
      chk('פספרטו', o.passepartout, o.passeColor) +
      '</div>';

    var progress = o.status === 'delivered' ? '' :
      '<div class="progress"><div class="plabel"><span>התקדמות מול 10 ימים</span>' +
      '<span>יום ' + d + ' מתוך 10</span></div>' +
      '<div class="track"><div class="fill" style="--fillc:' + U.statusVar(color) + ';width:' + pct + '%"></div></div></div>';

    var switcher = '<div class="status-switch"><span class="lbl">שינוי סטטוס</span>' +
      U.STATUS_LIST.map(function (s) {
        var c = statusColor(s);
        return '<button class="status-opt' + (o.status === s ? ' active' : '') + '"' +
          ' data-status="' + s + '" style="' + (o.status === s ? 'background:var(--st-' + c + '-soft);color:var(--st-' + c + '-text);' : '') + '">' +
          '<span class="dot" style="background:var(--st-' + c + ')"></span>' + U.STATUS_LABEL[s] + '</button>';
      }).join('') + '</div>';

    var actions = '<div class="actions">' +
      (o.status !== 'ready' ? '<button class="btn btn--primary btn--sm" data-action="ready">' + I.check + 'סמן כמוכנה</button>' :
        '<button class="btn btn--primary btn--sm" data-action="delivered">' + I.check + 'סמן כנמסרה</button>') +
      '<button class="btn btn--wa btn--sm" data-action="wa-ready">' + I.wa + 'ההזמנה מוכנה</button>' +
      '<button class="btn btn--wa btn--sm" data-action="wa-copy">' + I.copy + 'שלח עותק ללקוח</button>' +
      '<button class="btn btn--secondary btn--sm" data-action="edit">עריכה</button>' +
      '<button class="btn btn--danger btn--sm" data-action="delete">מחיקה</button>' +
      '</div>';

    return '<div class="mat">' + grid + checks + progress + switcher + actions + '</div>';
  }

  function statusColor(s) {
    if (s === 'ready') return 'green';
    if (s === 'delivered') return 'grey';
    if (s === 'new') return 'blue';
    return 'orange'; // in-work
  }

  /* --------------------------------------------------------------- events */
  function onListClick(e) {
    var toggle = e.target.closest('[data-toggle]');
    var rowEl = e.target.closest('.row');
    if (!rowEl) return;
    var id = rowEl.getAttribute('data-id');

    var actionBtn = e.target.closest('[data-action]');
    var statusBtn = e.target.closest('[data-status]');

    if (statusBtn) {
      e.stopPropagation();
      changeStatus(id, statusBtn.getAttribute('data-status'));
      return;
    }
    if (actionBtn) {
      e.stopPropagation();
      handleAction(id, actionBtn.getAttribute('data-action'));
      return;
    }
    if (toggle) {
      var willOpen = !rowEl.classList.contains('open');
      rowEl.classList.toggle('open', willOpen);
      toggle.setAttribute('aria-expanded', String(willOpen));
      if (willOpen) openIds[id] = true; else delete openIds[id];
    }
  }

  function findOrder(id) { return orders.filter(function (o) { return o.id === id; })[0]; }

  function changeStatus(id, status) {
    var o = findOrder(id);
    if (!o || o.status === status) return;
    openIds[id] = true; // השאר פתוח אחרי שינוי (לפני השמירה, כי המנוי מרנדר מיד)
    var updated = Object.assign({}, o, { status: status });
    DB.saveOrder(updated);
  }

  function handleAction(id, action) {
    var o = findOrder(id);
    if (!o) return;
    if (action === 'ready') { changeStatus(id, 'ready'); return; }
    if (action === 'delivered') { changeStatus(id, 'delivered'); return; }
    if (action === 'wa-ready') { global.open(U.waLink(o.phone, U.msgReady(o)), '_blank'); return; }
    if (action === 'wa-copy') { global.open(U.waLink(o.phone, U.msgCopy(o)), '_blank'); return; }
    if (action === 'edit') { openForm(o); return; }
    if (action === 'delete') {
      if (global.confirm('למחוק את הזמנה #' + o.orderNo + ' של ' + o.customerName + '?')) {
        delete openIds[id];
        DB.deleteOrder(id);
      }
      return;
    }
  }

  /* ----------------------------------------------------------- form modal */
  function openForm(existing) {
    DB.nextOrderNumber().then(function (nextNo) {
      var o = existing || {};
      var orderNo = existing ? existing.orderNo : String(nextNo);

      var node = document.createElement('div');
      node.className = 'modal';
      node.setAttribute('role', 'dialog');
      node.setAttribute('aria-modal', 'true');
      node.innerHTML =
        '<div class="modal__head">' +
          '<h2 class="modal__title">' + (existing ? 'עריכת הזמנה #' + esc(orderNo) : 'הזמנה חדשה #' + esc(orderNo)) + '</h2>' +
          '<button class="modal__close" data-close aria-label="סגירה">×</button>' +
        '</div>' +
        '<div class="modal__body"><form data-form>' +
          '<div class="form-grid">' +
            field('שם לקוח', 'customerName', o.customerName, 'text', true) +
            field('טלפון', 'phone', o.phone, 'tel', true) +
            textarea('תיאור התמונה', 'imageDesc', o.imageDesc) +
            field('תיאור / סוג מסגרת', 'frameDesc', o.frameDesc, 'text') +
            profileSelect(o.profileSku) +
            dimsRow(o.width, o.height) +
            toggleField('זכוכית', 'glass', o.glass) +
            field('סוג זכוכית', 'glassType', o.glassType, 'text') +
            toggleField('גב', 'backing', o.backing !== false) +
            toggleField('פספרטו', 'passepartout', o.passepartout) +
            field('צבע פספרטו', 'passeColor', o.passeColor, 'text') +
            field('מחיר כולל (₪)', 'price', o.price, 'number') +
            field('מקדמה ששולמה (₪)', 'deposit', o.deposit, 'number') +
            calcField('יתרה לתשלום', 'balance', (o.price || 0) - (o.deposit || 0)) +
          '</div>' +
        '</form></div>' +
        '<div class="modal__foot">' +
          '<button class="btn btn--primary" data-save>' + I.check + (existing ? 'שמירת שינויים' : 'פתיחת הזמנה') + '</button>' +
          '<button class="btn btn--ghost" data-close>ביטול</button>' +
        '</div>';

      // יתרה חיה
      var priceEl = node.querySelector('[name="price"]');
      var depEl = node.querySelector('[name="deposit"]');
      var balEl = node.querySelector('[name="balance"]');
      function recalc() {
        var b = (parseFloat(priceEl.value) || 0) - (parseFloat(depEl.value) || 0);
        balEl.value = U.fmtMoney(b);
        balEl.classList.remove('pop'); void balEl.offsetWidth; balEl.classList.add('pop');
      }
      priceEl.addEventListener('input', recalc);
      depEl.addEventListener('input', recalc);

      // toggles
      Array.prototype.forEach.call(node.querySelectorAll('.toggle'), function (t) {
        t.addEventListener('click', function () {
          var on = t.getAttribute('aria-checked') === 'true';
          t.setAttribute('aria-checked', String(!on));
        });
      });

      Array.prototype.forEach.call(node.querySelectorAll('[data-close]'), function (b) {
        b.addEventListener('click', Gallery.closeModal);
      });
      node.querySelector('[data-save]').addEventListener('click', function () {
        saveForm(node, existing, orderNo);
      });

      Gallery.openModal(node);
    });
  }

  function field(label, name, val, type, req) {
    return '<div class="form-field' + (name === 'imageDesc' ? ' col-2' : '') + '">' +
      '<label for="f-' + name + '">' + label + (req ? ' *' : '') + '</label>' +
      '<input id="f-' + name + '" name="' + name + '" type="' + type + '" value="' +
      esc(val == null ? '' : val) + '"' + (req ? ' required' : '') + '></div>';
  }
  function textarea(label, name, val) {
    return '<div class="form-field col-2"><label for="f-' + name + '">' + label + '</label>' +
      '<textarea id="f-' + name + '" name="' + name + '">' + esc(val || '') + '</textarea></div>';
  }
  function calcField(label, name, val) {
    return '<div class="form-field"><label>' + label + ' (מחושב אוטומטית)</label>' +
      '<input class="calc" name="' + name + '" value="' + U.fmtMoney(val) + '" readonly tabindex="-1"></div>';
  }
  function dimsRow(w, h) {
    return '<div class="form-field col-2"><label>מידות (גובה × רוחב, ס"מ)</label>' +
      '<div class="dims-row">' +
        '<div class="form-field"><input name="height" type="number" placeholder="גובה" value="' + (h || '') + '"></div>' +
        '<span class="x">×</span>' +
        '<div class="form-field"><input name="width" type="number" placeholder="רוחב" value="' + (w || '') + '"></div>' +
      '</div></div>';
  }
  function toggleField(label, name, on) {
    return '<div class="form-field"><div class="toggle-field"><label>' + label + '</label>' +
      '<button type="button" class="toggle" name="' + name + '" role="switch" aria-checked="' +
      (on ? 'true' : 'false') + '" aria-label="' + label + '"></button></div></div>';
  }
  function profileSelect(sku) {
    var opts = '<option value="">בחר פרופיל מהמלאי...</option>' +
      profiles.map(function (p) {
        return '<option value="' + esc(p.sku) + '"' + (p.sku === sku ? ' selected' : '') + '>' +
          esc(p.sku) + ' · ' + esc(p.woodType) + ' ' + esc(p.color) + '</option>';
      }).join('');
    return '<div class="form-field"><label for="f-profileSku">פרופיל מסגרת (מלאי)</label>' +
      '<select id="f-profileSku" name="profileSku">' + opts + '</select></div>';
  }

  function saveForm(node, existing, orderNo) {
    var form = node.querySelector('[data-form]');
    function val(n) { var el = form.querySelector('[name="' + n + '"]'); return el ? el.value.trim() : ''; }
    function num(n) { return parseFloat(val(n)) || 0; }
    function toggle(n) { var el = form.querySelector('.toggle[name="' + n + '"]'); return el && el.getAttribute('aria-checked') === 'true'; }

    var name = val('customerName');
    var phone = val('phone');
    if (!name || !phone) {
      global.alert('שם לקוח וטלפון הם שדות חובה.');
      return;
    }

    var price = num('price'), deposit = num('deposit');
    var base = existing || {};
    var order = Object.assign({}, base, {
      orderNo: orderNo,
      customerName: name,
      phone: phone,
      imageDesc: val('imageDesc'),
      frameDesc: val('frameDesc'),
      profileSku: val('profileSku'),
      width: num('width'),
      height: num('height'),
      glass: toggle('glass'),
      glassType: val('glassType'),
      backing: toggle('backing'),
      passepartout: toggle('passepartout'),
      passeColor: val('passeColor'),
      price: price,
      deposit: deposit,
      balance: price - deposit,
      status: base.status || 'new'
    });
    if (!existing) {
      order.openedAt = new Date().toISOString();
      var target = new Date();
      target.setDate(target.getDate() + Gallery.SHOP.slaDays);
      order.deliveryTarget = target.toISOString();
    }

    // שמור גם לקוח (קולקשן customers)
    DB.saveCustomer({ id: base.customerId, name: name, phone: phone }).then(function (c) {
      order.customerId = c.id;
      return DB.saveOrder(order);
    }).then(function (saved) {
      if (!existing) openIds[saved.id] = false;
      Gallery.closeModal();
    });
  }

  Gallery.Orders = { mount: mount };

})(window);
