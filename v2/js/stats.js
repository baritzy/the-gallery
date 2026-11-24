/* =============================================================================
 * stats.js  -  סטטיסטיקה (C35 / C36), admin בלבד. מחליף את "תובנות".
 * OWNER: agent C (wave 3). חוזה: P-projects/The-Gallery/context/v2-contract.md
 * -----------------------------------------------------------------------------
 * פחות מטרים, יותר כמויות לקוחות:
 *  - ממוצע לקוחות בשבוע, לקוחות חדשים בשבוע, תמונות שמוסגרו בשבוע,
 *    הזמנות מול מכירות מוצרים, ולקוחות חוזרים (צהוב 2, ירוק 3+, C37).
 *  - גרף עמודות שבועי ב-SVG פנימי (בלי ספרייה).
 * ביקור = הזמנה (createdAt) או קניית מוצר (sale.at). שבוע מתחיל ביום ראשון.
 * תמונה מוסגרה = שורה שבוצעה בהזמנה שהגיעה למוכנה (readyAt, אחרת deliveredAt).
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var D = Gallery.data;
  var esc = U.esc;
  var WEEK = 7 * 86400000;

  var PERIODS = [['week', 'שבוע', 1], ['month', 'חודש', 4], ['year', 'שנה', 52]];
  var METRICS = [['customers', 'לקוחות'], ['newCustomers', 'לקוחות חדשים'], ['framed', 'תמונות שמוסגרו']];
  var state = { period: 'month', metric: 'customers' };
  var bodyEl = null;

  function weekStart(d) { var x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - x.getDay()); return x; }

  /* ------------------------------------------------------------------ נתונים */
  function visits() {
    var v = [];
    D.orders.peek().forEach(function (o) { if (o.customerId) v.push({ c: o.customerId, at: new Date(o.createdAt), kind: 'order' }); });
    D.sales.peek().forEach(function (s) { if (s.customerId) v.push({ c: s.customerId, at: new Date(s.at), kind: 'sale' }); });
    return v;
  }
  function framedEvents() {
    var out = [];
    D.orders.peek().forEach(function (o) {
      var at = o.readyAt || o.deliveredAt;
      if (!at || (o.status !== 'ready' && o.status !== 'delivered')) return;
      var n = (o.items || []).filter(function (it) { return it.done; }).length;
      if (n) out.push({ at: new Date(at), n: n });
    });
    return out;
  }

  /* מחזיר מערך שבועות (מהישן לחדש): { start, customers, newCustomers, framed, orders, sales } */
  function weekly(nWeeks) {
    var cur = weekStart(new Date());
    var weeks = [];
    for (var i = nWeeks - 1; i >= 0; i--) {
      var s = new Date(cur); s.setDate(cur.getDate() - 7 * i);
      weeks.push({ start: s, end: new Date(s.getTime() + WEEK), cset: {}, customers: 0, newCustomers: 0, framed: 0, orders: 0, sales: 0 });
    }
    function wk(at) {
      for (var j = 0; j < weeks.length; j++) { if (at >= weeks[j].start && at < weeks[j].end) return weeks[j]; }
      return null;
    }
    var all = visits();
    var first = {};
    all.forEach(function (v) { if (!first[v.c] || v.at < first[v.c]) first[v.c] = v.at; });
    all.forEach(function (v) {
      var w = wk(v.at);
      if (!w) return;
      w.cset[v.c] = true;
      if (v.kind === 'order') w.orders++; else w.sales++;
    });
    Object.keys(first).forEach(function (c) { var w = wk(first[c]); if (w) w.newCustomers++; });
    framedEvents().forEach(function (f) { var w = wk(f.at); if (w) w.framed += f.n; });
    weeks.forEach(function (w) { w.customers = Object.keys(w.cset).length; });
    return weeks;
  }

  function returning() {
    var last = {};
    visits().forEach(function (v) { if (!last[v.c] || v.at > last[v.c]) last[v.c] = v.at; });
    return D.customers.peek().map(function (c) { return { c: c, n: D.customers.visitCount(c.id), last: last[c.id] }; })
      .filter(function (x) { return x.n >= 2; })
      .sort(function (a, b) { return b.n - a.n || (b.last || 0) - (a.last || 0); });
  }

  /* ------------------------------------------------------------------ mount / render */
  function mount(el) {
    el.innerHTML =
      '<div class="view__head"><div><h1 class="view__title">סטטיסטיקה</h1>' +
      '<p class="view__subtitle">כמה לקוחות מגיעים, כמה חדשים, כמה תמונות מוסגרו ומי הלקוחות החוזרים.</p></div>' +
      '<div class="st-period" data-periods></div></div>' +
      '<div data-body></div>';
    bodyEl = el.querySelector('[data-body]');
    el.addEventListener('click', onClick);
    el.addEventListener('pointerover', onHover);
    el.addEventListener('pointerout', function (e) { if (e.target.closest('[data-bar]')) hideTip(); });
    ['orders', 'sales', 'customers'].forEach(function (c) { D[c].subscribe(render); });
  }

  function seg(attr, opts, cur, label) {
    return '<div class="seg st-seg" role="radiogroup" aria-label="' + esc(label) + '">' + opts.map(function (o) {
      return '<button type="button" role="radio" ' + attr + '="' + o[0] + '" aria-checked="' + (o[0] === cur) + '">' + esc(o[1]) + '</button>';
    }).join('') + '</div>';
  }

  function fmt1(n) { return (Math.round(n * 10) / 10).toLocaleString('he-IL'); }

  function render() {
    if (!bodyEl) return;
    var per = PERIODS.filter(function (p) { return p[0] === state.period; })[0];
    var n = per[2];
    var root = bodyEl.parentNode;
    root.querySelector('[data-periods]').innerHTML = seg('data-period', PERIODS, state.period, 'תקופה');
    var win = weekly(n);
    var tot = { customers: 0, newCustomers: 0, framed: 0, orders: 0, sales: 0 };
    win.forEach(function (w) { Object.keys(tot).forEach(function (k) { tot[k] += w[k]; }); });
    var single = n === 1;
    var suffix = single ? 'השבוע' : 'ממוצע לשבוע, ' + (n === 4 ? '4 השבועות האחרונים' : 'השנה האחרונה');
    function card(label, total, tone, ico) {
      return '<div class="st-card st-c-' + tone + '">' + ico +
        '<div class="st-card__k">' + esc(label) + '</div>' +
        '<div class="st-card__v">' + (single ? total : fmt1(total / n)) + '</div>' +
        '<div class="st-card__s">' + esc(suffix) + (single ? '' : ' · סה"כ ' + total) + '</div></div>';
    }
    var ovs = tot.orders + tot.sales;
    var oPct = ovs ? Math.round(tot.orders / ovs * 100) : 0;
    var ret = returning();

    var chartWeeks = weekly(Math.max(n, 8));
    bodyEl.innerHTML =
      '<div class="st-cards">' +
        card('לקוחות בשבוע', tot.customers, 'primary', I.customers) +
        card('לקוחות חדשים בשבוע', tot.newCustomers, 'green', I.plus) +
        card('תמונות שמוסגרו בשבוע', tot.framed, 'walnut', I.frameEmpty) +
        '<div class="st-card st-card--split">' + I.tag +
          '<div class="st-card__k">הזמנות מול מכירות מוצרים</div>' +
          '<div class="st-vs"><div><b>' + tot.orders + '</b><span>הזמנות מסגור</span></div><div><b>' + tot.sales + '</b><span>מוצרים שנמכרו</span></div></div>' +
          '<div class="st-bar" role="img" aria-label="' + oPct + ' אחוז הזמנות"><span class="st-bar__o" style="width:' + oPct + '%"></span><span class="st-bar__s" style="width:' + (ovs ? 100 - oPct : 0) + '%"></span></div>' +
          '<div class="st-card__s">' + (single ? 'השבוע' : 'בתקופה') + '</div></div>' +
      '</div>' +
      '<section class="st-sec">' +
        '<div class="st-sec__head"><h2 class="st-sec__title">' + esc(METRICS.filter(function (m) { return m[0] === state.metric; })[0][1]) + ' בכל שבוע</h2>' +
          seg('data-metric', METRICS, state.metric, 'מה להציג בגרף') + '</div>' +
        chart(chartWeeks, state.metric) +
        '<p class="st-note">' + (chartWeeks.length === 52 ? 'השנה האחרונה, שבוע אחרי שבוע.' : chartWeeks.length + ' השבועות האחרונים. העמודה השמאלית ביותר היא השבוע הנוכחי.') + '</p>' +
      '</section>' +
      '<section class="st-sec">' +
        '<div class="st-sec__head"><h2 class="st-sec__title">' + I.customers + 'לקוחות חוזרים <span class="st-sec__n">' + ret.length + '</span></h2>' +
          '<div class="st-legend"><span class="tone-yellow">פעמיים</span><span class="tone-green">3 פעמים ומעלה</span></div></div>' +
        (ret.length ? '<div class="st-ret">' + ret.map(function (x) {
          var tone = U.visitTone(x.n);
          return '<button type="button" class="st-ret__row" data-cust="' + esc(x.c.id) + '">' +
            '<span class="st-ret__name"><b class="' + (tone ? 'tone-' + tone : '') + '">' + esc(x.c.name) + '</b></span>' +
            '<span class="st-ret__n">' + x.n + ' ביקורים</span>' +
            '<span class="st-ret__last">' + (x.last ? 'אחרון ' + U.fmtDate(x.last) : '') + '</span></button>';
        }).join('') + '</div>' : '<div class="empty"><p>עדיין אין לקוחות חוזרים.</p></div>') +
      '</section>';
  }

  /* ------------------------------------------------------------------ גרף SVG */
  function chart(weeks, metric) {
    var W = 760, H = 240, padL = 8, padR = 34, padT = 24, padB = 30;
    var vals = weeks.map(function (w) { return w[metric]; });
    var max = Math.max.apply(null, vals.concat([1]));
    var step = max <= 4 ? 1 : max <= 10 ? 2 : Math.ceil(max / 5);
    var top = Math.ceil(max / step) * step;
    var n = weeks.length, slot = (W - padL - padR) / n;
    var bw = Math.max(4, Math.min(44, slot - 2 * Math.max(2, slot * 0.18)));
    var y = function (v) { return padT + (H - padT - padB) * (1 - v / top); };
    var maxI = vals.indexOf(max);
    var out = '<svg class="st-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="גרף עמודות שבועי" direction="ltr">';
    for (var g = 0; g <= top; g += step) {
      out += '<line class="st-grid" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(g) + '" y2="' + y(g) + '"/>' +
        '<text class="st-axis" x="' + (W - padR + 8) + '" y="' + (y(g) + 4) + '" text-anchor="start">' + g + '</text>';
    }
    var labelEvery = n > 26 ? 4 : n > 13 ? 2 : 1;
    weeks.forEach(function (w, i) {
      var k = n - 1 - i; /* RTL: הישן מימין, השבוע הנוכחי משמאל */
      var cx = padL + slot * k + slot / 2, v = vals[i], x = cx - bw / 2, yt = y(v), yb = y(0);
      var tip = 'שבוע מ-' + U.fmtDateShort(w.start) + ': ' + v;
      if (v > 0) {
        var r = Math.min(4, bw / 2, yb - yt);
        out += '<path class="st-barmark' + (i === n - 1 ? ' is-now' : '') + '" d="M' + x + ' ' + yb + 'V' + (yt + r) + 'Q' + x + ' ' + yt + ' ' + (x + r) + ' ' + yt +
          'H' + (x + bw - r) + 'Q' + (x + bw) + ' ' + yt + ' ' + (x + bw) + ' ' + (yt + r) + 'V' + yb + 'Z"/>';
      }
      if (v > 0 && (n <= 13 || i === maxI || i === n - 1)) out += '<text class="st-val" x="' + cx + '" y="' + (yt - 6) + '" text-anchor="middle">' + v + '</text>';
      if (i % labelEvery === 0 || i === n - 1) out += '<text class="st-axis" x="' + cx + '" y="' + (H - 10) + '" text-anchor="middle">' + U.fmtDateShort(w.start) + '</text>';
      out += '<rect class="st-hit" data-bar data-tip="' + esc(tip) + '" x="' + (padL + slot * k) + '" y="' + padT + '" width="' + slot + '" height="' + (H - padT - padB) + '"><title>' + esc(tip) + '</title></rect>';
    });
    out += '<line class="st-base" x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(0) + '" y2="' + y(0) + '"/></svg>';
    return '<div class="st-chartwrap" data-chartwrap>' + out + '<div class="st-tip" data-tipbox hidden></div></div>';
  }

  function onHover(e) {
    var b = e.target.closest('[data-bar]');
    if (!b) return;
    var wrap = b.closest('[data-chartwrap]'), box = wrap.querySelector('[data-tipbox]');
    var wr = wrap.getBoundingClientRect(), br = b.getBoundingClientRect();
    box.textContent = b.getAttribute('data-tip');
    box.hidden = false;
    box.style.left = Math.max(0, Math.min(wr.width - 160, br.left - wr.left + br.width / 2 - 80)) + 'px';
    box.style.top = '0px';
  }
  function hideTip() { var b = bodyEl && bodyEl.querySelector('[data-tipbox]'); if (b) b.hidden = true; }

  function onClick(e) {
    var el;
    if ((el = e.target.closest('[data-period]'))) { state.period = el.getAttribute('data-period'); render(); return; }
    if ((el = e.target.closest('[data-metric]'))) { state.metric = el.getAttribute('data-metric'); render(); return; }
    if ((el = e.target.closest('[data-cust]'))) Gallery.openCustomer(el.getAttribute('data-cust'));
  }

  Gallery.registerView('stats', { mount: mount, onShow: render });
})(window);
