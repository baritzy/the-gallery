/* =============================================================================
 * insights.js  -  מודול "תובנות" (טאב 5)
 * מיישם את context/insights-proposal.md: שורת KPI עליונה + כרטיסי תובנה מקובצים
 * (מלאי, תפעול, כספים, לקוחות). כל כרטיס: מה קרה, מה זה אומר, מה כדאי לעשות.
 * כל החישובים סטטיסטיקה פשוטה מהנתונים הקיימים. Empty-state מכובד כשאין מספיק נתונים.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var DB = Gallery.DB;
  var U = Gallery.util;
  var I = Gallery.icons;
  var SHOP = Gallery.SHOP;
  var esc = U.esc;

  var container = null, bodyEl = null;
  var orders = [], profiles = [], suppliers = [], usage = [], customers = [];
  var loaded = { orders: false, profiles: false };

  var LEAD_TIME_DAYS = 14;   // זמן אספקה מספק (ברירת מחדל עד שיוזן לכל ספק)
  var DEAD_STOCK_DAYS = 90;  // "לא זז" = מעל 3 חודשים
  var DAY = 86400000;

  // עלויות דמו לחומרים נלווים (₪). לסימון בלבד עד שאסף יזין עלויות אמיתיות.
  var EXTRA_COST = { glass: 40, passe: 30, backing: 15, labor: 50 };

  function mount(el) {
    container = el;
    container.innerHTML =
      '<div class="view__head">' +
        '<div><h1 class="view__title">תובנות</h1>' +
        '<p class="view__subtitle">מבט-על אחד על העסק. ככל שתצטבר היסטוריה, התובנות מתחדדות.</p></div>' +
      '</div>' +
      '<div data-body></div>';
    bodyEl = container.querySelector('[data-body]');
    bodyEl.addEventListener('click', onClick);

    DB.subscribeOrders(function (o) { orders = o; loaded.orders = true; render(); });
    DB.subscribeProfiles(function (p) { profiles = p; loaded.profiles = true; render(); });
    DB.subscribeSuppliers(function (s) { suppliers = s; render(); });
    DB.subscribeUsage(function (u) { usage = u; render(); });
    DB.subscribeCustomers(function (c) { customers = c; render(); });
  }

  /* =========================================================================
   * עזרי חישוב
   * ======================================================================= */
  function round(n) { return Math.round(n); }
  function ymOf(d) { d = new Date(d); return d.getFullYear() * 12 + d.getMonth(); }
  function openOrders() { return orders.filter(function (o) { return o.status !== 'delivered'; }); }
  function activeWork() { return orders.filter(function (o) { return o.status === 'new' || o.status === 'in-work'; }); }
  function deliveredOrders() { return orders.filter(function (o) { return o.status === 'delivered' && o.deliveredAt; }); }
  function lowProfiles() { return profiles.filter(function (p) { return p.stockUnits < p.minThreshold; }); }
  function profileBySku(sku) { return profiles.filter(function (p) { return p.sku === sku; })[0]; }

  function usageOf(pid) { return usage.filter(function (u) { return u.profileId === pid; }); }
  function weekAvg(pid) {
    var h = usageOf(pid).sort(function (a, b) { return new Date(b.date) - new Date(a.date); });
    if (!h.length) return 0;
    var total = h.reduce(function (s, u) { return s + (u.amount || 0); }, 0);
    var span = Math.max(1, U.daysSince(h[h.length - 1].date)) / 7;
    return total / Math.max(1, span);
  }
  function daysLeft(p) {
    var wa = weekAvg(p.id);
    if (wa <= 0) return Infinity;
    return p.stockUnits / (wa / 7);
  }
  function turnaround(o) { return round((new Date(o.deliveredAt) - new Date(o.openedAt)) / DAY); }

  // הכנסה בחודש יחסי (0 = החודש), עם אפשרות לחתוך ליום-בחודש להשוואה הוגנת
  function incomeInMonth(offset, capDay) {
    var target = ymOf(new Date()) + offset;
    return orders.filter(function (o) {
      var d = new Date(o.openedAt);
      return ymOf(d) === target && (!capDay || d.getDate() <= capDay);
    }).reduce(function (s, o) { return s + Number(o.price || 0); }, 0);
  }
  function monthsWithData() {
    var set = {};
    orders.forEach(function (o) { set[ymOf(o.openedAt)] = true; });
    return Object.keys(set).length;
  }

  /* =========================================================================
   * KPI עליון
   * ======================================================================= */
  function kpiRow() {
    var now = new Date();
    var thisMonth = incomeInMonth(0);
    var prevSameDay = incomeInMonth(-1, now.getDate());
    var trend = null;
    if (prevSameDay > 0) trend = (thisMonth - prevSameDay) / prevSameDay * 100;

    var trendHTML = '';
    if (trend !== null) {
      var up = trend >= 0;
      trendHTML = '<span class="kpi__trend ' + (up ? 'up' : 'down') + '">' +
        (up ? I.trendUp : I.trendDown) + (up ? '+' : '') + round(trend) + '%</span>';
    }

    var open = openOrders();
    var late = open.filter(function (o) { return U.urgency(o).level === 'late'; }).length;
    var openBal = open.reduce(function (s, o) { return s + Number(o.balance || 0); }, 0);
    var low = lowProfiles().length;

    var tiles = [
      { label: 'הכנסה החודש', value: U.fmtMoney(thisMonth), sub: trendHTML || '<span class="kpi__sub">החודש עד עכשיו</span>', tone: 'primary' },
      { label: 'יתרות פתוחות', value: U.fmtMoney(openBal), sub: '<span class="kpi__sub">כסף שלא נגבה</span>', tone: openBal > 0 ? 'orange' : 'green' },
      { label: 'עבודות פתוחות', value: String(open.length), sub: late ? '<span class="kpi__flag">' + late + ' באיחור</span>' : '<span class="kpi__sub">בסדנה</span>', tone: late ? 'red' : 'blue' },
      { label: 'צריך להזמין', value: String(low), sub: '<span class="kpi__sub">פרופילים מתחת לסף</span>', tone: low ? 'orange' : 'green' }
    ];

    return '<div class="kpi-row">' + tiles.map(function (t) {
      return '<div class="kpi is-' + t.tone + '">' +
        '<div class="kpi__label">' + esc(t.label) + '</div>' +
        '<div class="kpi__value">' + t.value + '</div>' +
        '<div class="kpi__foot">' + t.sub + '</div>' +
      '</div>';
    }).join('') + '</div>';
  }

  /* =========================================================================
   * בונה כרטיס בודד
   * card = { status, icon, title(html), body(html), action:{label,tab}, meta }
   * ======================================================================= */
  function cardHTML(card) {
    var st = card.status || 'ok';
    var meta = card.meta ? '<div class="ins-card__meta">' + card.meta + '</div>' : '';
    var action = card.action ?
      '<button class="ins-card__cta" data-tab="' + card.action.tab + '">' + esc(card.action.label) + ' ›</button>' : '';
    var icon = card.icon || I.lightbulb;
    return '<div class="ins-card is-' + st + '">' +
      '<div class="ins-card__head">' + icon + '<span class="ins-card__title">' + card.title + '</span></div>' +
      (card.body ? '<div class="ins-card__body">' + card.body + '</div>' : '') +
      (action ? '<div class="ins-card__foot">' + action + '</div>' : '') +
      meta +
    '</div>';
  }

  function collecting(need, have, unit) {
    var left = Math.max(0, need - have);
    var pct = Math.min(100, round(have / need * 100));
    return '<div class="ins-progress"><div class="ins-progress__track"><div class="ins-progress__fill" style="width:' + pct + '%"></div></div>' +
      '<div class="ins-progress__txt">עוד כ-' + left + ' ' + unit + ' ואחזור לכאן עם המספרים</div></div>';
  }

  /* =========================================================================
   * קטגוריה: מלאי והזמנות
   * ======================================================================= */
  function cardRestock() {
    // A1 - מה עומד להיגמר
    var withHist = profiles.filter(function (p) { return usageOf(p.id).length >= 3; });
    if (withHist.length === 0) {
      return { status: 'muted', icon: I.inventory, title: 'מה עומד להיגמר',
        body: '<p>עדיין אין מספיק היסטוריית צריכה כדי לחזות מתי פרופיל ייגמר.</p>' + collecting(3, Math.max.apply(null, [0].concat(profiles.map(function (p) { return usageOf(p.id).length; }))), 'רשומות צריכה לפרופיל') };
    }
    var flagged = withHist.filter(function (p) {
      return daysLeft(p) <= LEAD_TIME_DAYS || p.stockUnits < p.minThreshold;
    }).sort(function (a, b) { return daysLeft(a) - daysLeft(b); });

    if (flagged.length === 0) {
      return { status: 'ok', icon: I.inventory, title: 'מה עומד להיגמר',
        body: '<p>כל הפרופילים עם היסטוריית צריכה מכוסים מול קצב העבודה. אין מה להזמין בדחיפות.</p>' };
    }
    var items = flagged.slice(0, 3).map(function (p) {
      var dl = daysLeft(p);
      var when = isFinite(dl) ? 'ייגמר בעוד כ-<b>' + round(dl) + ' ימים</b>' : 'מתחת לסף';
      var early = usageOf(p.id).length < 5 ? ' <span class="ins-tag">אות ראשוני</span>' : '';
      return '<li><span class="mono">' + esc(p.sku) + '</span> ' + esc(p.woodType) + ' ' + esc(p.color) + ' · ' + when + early + '</li>';
    }).join('');
    return { status: 'late', icon: I.inventory,
      title: 'מה עומד להיגמר: <b>' + flagged.length + '</b> פרופילים בסיכון',
      body: '<ul class="ins-list">' + items + '</ul>' +
        '<p class="ins-say">זמן האספקה מהספק כ-' + LEAD_TIME_DAYS + ' יום. כדאי להזמין עכשיו כדי לא להיתקע באמצע עבודה.</p>',
      action: { label: 'לרשימת ההזמנה במלאי', tab: 'inventory' } };
  }

  function cardTopProfiles() {
    // A2 - פרופילים מובילים ומזניחים (90 יום)
    var since = Date.now() - 90 * DAY;
    var recent = usage.filter(function (u) { return new Date(u.date).getTime() >= since; });
    if (recent.length < 8) {
      return { status: 'muted', icon: I.inventory, title: 'פרופילים מובילים',
        body: '<p>אחרי כמה שבועות עבודה אראה לך אילו פרופילים אתה הכי צורך, כדי שלעולם לא תיתקע עליהם.</p>' + collecting(8, recent.length, 'רשומות צריכה') };
    }
    var bySku = {};
    recent.forEach(function (u) { bySku[u.profileSku] = (bySku[u.profileSku] || 0) + (u.amount || 0); });
    var arr = Object.keys(bySku).map(function (sku) { return { sku: sku, amt: bySku[sku] }; })
      .sort(function (a, b) { return b.amt - a.amt; });
    var top = arr.slice(0, 3).map(function (x) {
      var p = profileBySku(x.sku);
      var name = p ? p.woodType + ' ' + p.color : x.sku;
      return '<li><span class="mono">' + esc(x.sku) + '</span> ' + esc(name) + ' · <b>' + round(x.amt) + ' ס"מ</b></li>';
    }).join('');
    return { status: 'ok', icon: I.inventory, title: '3 הפרופילים שאתה הכי צורך',
      body: '<ul class="ins-list">' + top + '</ul>' +
        '<p class="ins-say">על אלה אף פעם אל תיתקע. שווה לוודא מלאי גבוה ולנצל לשיחת מחיר מול הספק.</p>' };
  }

  function cardDeadStock() {
    // A3 - מלאי מת
    var oldestUsage = usage.length ? Math.max.apply(null, usage.map(function (u) { return U.daysSince(u.date); })) : 0;
    if (usage.length < 5 || oldestUsage < 60) {
      return { status: 'muted', icon: I.inventory, title: 'מלאי מת',
        body: '<p>צריך עוד זמן כדי לדעת מה באמת לא זז. אחזור לכאן כשתצטבר היסטוריה של כמה חודשים.</p>' };
    }
    var dead = profiles.filter(function (p) {
      if (p.stockUnits <= 0) return false;
      var h = usageOf(p.id);
      if (!h.length) return true;
      var last = Math.min.apply(null, h.map(function (u) { return U.daysSince(u.date); }));
      return last > DEAD_STOCK_DAYS;
    }).sort(function (a, b) { return b.stockUnits - a.stockUnits; });

    if (dead.length === 0) {
      return { status: 'ok', icon: I.inventory, title: 'מלאי מת',
        body: '<p>אין פרופילים תקועים. כל המלאי שיושב אצלך זז בחודשים האחרונים.</p>' };
    }
    var stuck = dead.reduce(function (s, p) { return s + p.stockUnits; }, 0);
    var items = dead.slice(0, 3).map(function (p) {
      return '<li><span class="mono">' + esc(p.sku) + '</span> ' + esc(p.woodType) + ' ' + esc(p.color) + ' · <b>' + p.stockUnits + ' ס"מ</b></li>';
    }).join('');
    return { status: 'warn', icon: I.inventory,
      title: 'מלאי מת: <b>' + round(stuck) + ' ס"מ</b> תקועים ב-' + dead.length + ' פרופילים',
      body: '<ul class="ins-list">' + items + '</ul>' +
        '<p class="ins-say">כסף תקוע על המדף. שווה להפסיק להזמין מהם ולשקול מבצע או שימוש בעבודות זולות כדי לפנות מקום.</p>' };
  }

  /* =========================================================================
   * קטגוריה: תפעול
   * ======================================================================= */
  function cardWhatFirst() {
    // B1 - מה לעשות קודם
    var work = activeWork();
    if (work.length === 0) {
      return { status: 'ok', icon: I.check, title: 'מה לעשות קודם',
        body: '<p>אין עבודות פתוחות בסדנה כרגע. הכל מוכן או נמסר.</p>' };
    }
    var maxBal = Math.max.apply(null, [1].concat(work.map(function (o) { return Number(o.balance || 0); })));
    var scored = work.map(function (o) {
      var timeScore = U.dayNumber(o) / SHOP.slaDays;
      var valScore = Number(o.balance || 0) / maxBal;
      return { o: o, score: 0.7 * timeScore + 0.3 * valScore };
    }).sort(function (a, b) { return b.score - a.score; });

    var items = scored.slice(0, 3).map(function (x, i) {
      var o = x.o;
      var lateTag = U.urgency(o).level === 'late' ? ' <span class="ins-tag red">באיחור</span>' : '';
      return '<li>' + (i + 1) + '. ' + esc(o.customerName) + ' · יום <b>' + U.dayNumber(o) + '</b> · יתרה ' + U.fmtMoney(o.balance) + lateTag + '</li>';
    }).join('');
    return { status: 'warn', icon: I.clock,
      title: 'מה לעשות קודם: <b>' + work.length + '</b> עבודות פתוחות',
      body: '<ul class="ins-list">' + items + '</ul>' +
        '<p class="ins-say">זו רשימת העבודה של הבוקר לפי דחיפות אמיתית, לא לפי מי שצעק אחרון. השורה הראשונה = מה שמתחילים עכשיו.</p>',
      action: { label: 'לכל ההזמנות', tab: 'orders' } };
  }

  function cardWIP() {
    // B2 - עומס נוכחי
    var open = openOrders();
    var late = open.filter(function (o) { return U.urgency(o).level === 'late'; }).length;
    var warn = open.filter(function (o) { return U.urgency(o).level === 'warn'; }).length;
    var st = late >= 2 ? 'warn' : 'ok';
    return { status: st, icon: I.reminders,
      title: 'עומס נוכחי: <b>' + open.length + '</b> עבודות בסדנה',
      body: '<p>' + late + ' באיחור, ' + warn + ' מתקרבות ליעד.</p>' +
        '<p class="ins-say">' + (late >= 2 ?
          'עומס גבוה. שקול לעצור לקיחת עבודות דחופות חדשות או להאריך את זמן ההבטחה ללקוח.' :
          'העומס בשליטה. אפשר להמשיך לקבל עבודות חדשות.') + '</p>',
      action: { label: 'לתזכורות', tab: 'reminders' } };
  }

  function cardTurnaround() {
    // B3 + B4 - זמן ביצוע ואחוז עמידה בזמנים
    var d = deliveredOrders();
    if (d.length < 5) {
      return { status: 'muted', icon: I.check, title: 'זמן ביצוע ואחוז עמידה בזמנים',
        body: '<p>אחרי שיצטברו כמה עבודות שנמסרו אראה לך כמה זמן לוקח לך בממוצע ואיזה אחוז יוצא בזמן.</p>' + collecting(5, d.length, 'הזמנות שנמסרו') };
    }
    var times = d.map(turnaround);
    var avg = times.reduce(function (s, n) { return s + n; }, 0) / times.length;
    var onTime = times.filter(function (n) { return n <= SHOP.slaDays; }).length;
    var pct = round(onTime / times.length * 100);
    var st = avg > SHOP.slaDays ? 'warn' : 'ok';
    return { status: st, icon: I.clock,
      title: 'זמן ביצוע ממוצע: <b>' + avg.toFixed(1) + ' ימים</b>',
      body: '<p>' + pct + '% מהעבודות יצאו תוך ' + SHOP.slaDays + ' ימים.</p>' +
        '<p class="ins-say">' + (avg > SHOP.slaDays ?
          'הממוצע גבוה מההבטחה של ' + SHOP.slaDays + ' ימים. או להאריך את ההבטחה, או להוסיף כוח עבודה.' :
          'ההבטחה של ' + SHOP.slaDays + ' ימים מציאותית. אתה עומד בקצב.') + '</p>',
      meta: d.length < 12 ? 'מבוסס על ' + d.length + ' הזמנות שנמסרו · אות ראשוני, יתחזק עם הזמן' : null };
  }

  /* =========================================================================
   * קטגוריה: כספים
   * ======================================================================= */
  function cardIncome() {
    // C1 - הכנסה החודש ומגמה
    if (monthsWithData() < 2) {
      return { status: 'muted', icon: I.coins, title: 'הכנסה החודש ומגמה',
        body: '<p>חודש נתונים אחד בלבד עדיין. מגמה שאפשר לסמוך עליה תופיע אחרי חודש נוסף.</p>' };
    }
    var now = new Date();
    var thisMonth = incomeInMonth(0);
    var prevSameDay = incomeInMonth(-1, now.getDate());
    var trend = prevSameDay > 0 ? (thisMonth - prevSameDay) / prevSameDay * 100 : null;
    var up = trend !== null && trend >= 0;
    var st = trend === null ? 'ok' : (trend < -10 ? 'warn' : 'ok');
    var trendLine = trend === null ?
      'אין עדיין חודש קודם להשוואה מלאה.' :
      'חודש שעבר עד אותו יום: ' + U.fmtMoney(prevSameDay) + '. ' +
      (up ? 'עלייה' : 'ירידה') + ' של ' + Math.abs(round(trend)) + '%.';
    return { status: st, icon: up ? I.trendUp : I.coins,
      title: 'הכנסת החודש: <b>' + U.fmtMoney(thisMonth) + '</b>',
      body: '<p>' + trendLine + '</p>' +
        '<p class="ins-say">' + (up ?
          'מגמה טובה. שמור על הקצב.' :
          'חודש חלש. דחוף עבודות מוכנות לאיסוף ופנה ללקוחות ותיקים כדי לסגור את הפער.') + '</p>',
      meta: monthsWithData() < 4 ? 'מבוסס על ' + monthsWithData() + ' חודשים · אות ראשוני' : null };
  }

  function cardOpenBalance() {
    // C3 - יתרות פתוחות
    var open = openOrders();
    var total = open.reduce(function (s, o) { return s + Number(o.balance || 0); }, 0);
    if (total === 0) {
      return { status: 'ok', icon: I.coins, title: 'יתרות פתוחות',
        body: '<p>אין יתרות פתוחות. כל הכסף על העבודות הפעילות נגבה.</p>' };
    }
    var readyBal = open.filter(function (o) { return o.status === 'ready'; })
      .reduce(function (s, o) { return s + Number(o.balance || 0); }, 0);
    var top = open.filter(function (o) { return o.balance > 0; })
      .sort(function (a, b) { return b.balance - a.balance; }).slice(0, 3)
      .map(function (o) {
        return '<li>' + esc(o.customerName) + ' · <b>' + U.fmtMoney(o.balance) + '</b>' +
          (o.status === 'ready' ? ' <span class="ins-tag green">מוכן לאיסוף</span>' : '') + '</li>';
      }).join('');
    return { status: readyBal > 0 ? 'late' : 'warn', icon: I.coins,
      title: 'יתרות פתוחות: <b>' + U.fmtMoney(total) + '</b> שלא נגבו',
      body: (readyBal > 0 ? '<p>מתוכם ' + U.fmtMoney(readyBal) + ' בעבודות שכבר מוכנות לאיסוף.</p>' : '') +
        '<ul class="ins-list">' + top + '</ul>' +
        '<p class="ins-say">על העבודות המוכנות, הודעת "מוכן לאיסוף" בוואטסאפ = גבייה מיידית של כסף שכבר הרווחת.</p>',
      action: { label: 'לתזכורות וגבייה', tab: 'reminders' } };
  }

  function cardAOV() {
    // C2 - ערך הזמנה ממוצע
    if (orders.length < 8) {
      return { status: 'muted', icon: I.coins, title: 'ערך הזמנה ממוצע',
        body: '<p>אחרי עוד כמה הזמנות אראה לך כמה שווה הזמנה ממוצעת ואילו תוספות מעלות את הערך.</p>' + collecting(8, orders.length, 'הזמנות') };
    }
    var avg = orders.reduce(function (s, o) { return s + Number(o.price || 0); }, 0) / orders.length;
    function avgWhere(fn) {
      var g = orders.filter(fn);
      return g.length ? g.reduce(function (s, o) { return s + Number(o.price || 0); }, 0) / g.length : 0;
    }
    var withExtra = avgWhere(function (o) { return o.glass || o.passepartout; });
    var without = avgWhere(function (o) { return !o.glass && !o.passepartout; });
    var uplift = round(withExtra - without);
    return { status: 'ok', icon: I.coins,
      title: 'הזמנה ממוצעת: <b>' + U.fmtMoney(round(avg)) + '</b>',
      body: (without > 0 && uplift > 0 ?
        '<p>עבודות עם זכוכית או פספרטו שוות בממוצע ' + U.fmtMoney(uplift) + ' יותר.</p>' : '') +
        '<p class="ins-say">מנוף רווחיות ישיר. אם תוספות מעלות את הערך, שווה להציע אותן בעקביות כבר בפתיחת ההזמנה.</p>' };
  }

  function cardProfit() {
    // רווחיות (שדרוג ל-C2 בעזרת costPerCm)
    var priced = orders.filter(function (o) { return o.profileSku && o.price > 0; });
    if (priced.length < 5) {
      return { status: 'muted', icon: I.coins, title: 'רווחיות משוערת',
        body: '<p>אחרי עוד כמה עבודות עם פרופיל ומחיר אראה לך רווח ממוצע לעבודה, לא רק הכנסה.</p>' + collecting(5, priced.length, 'עבודות עם פרופיל') };
    }
    var profits = priced.map(function (o) {
      var p = profileBySku(o.profileSku);
      var cost = (p && p.costPerCm ? p.costPerCm : 1) * U.consumption(o.width, o.height);
      if (o.glass) cost += EXTRA_COST.glass;
      if (o.passepartout) cost += EXTRA_COST.passe;
      if (o.backing) cost += EXTRA_COST.backing;
      cost += EXTRA_COST.labor;
      return { profit: Number(o.price) - cost, price: Number(o.price) };
    });
    var avgProfit = profits.reduce(function (s, x) { return s + x.profit; }, 0) / profits.length;
    var totalPrice = profits.reduce(function (s, x) { return s + x.price; }, 0);
    var totalProfit = profits.reduce(function (s, x) { return s + x.profit; }, 0);
    var margin = totalPrice > 0 ? round(totalProfit / totalPrice * 100) : 0;
    return { status: 'ok', icon: I.coins,
      title: 'רווח ממוצע לעבודה: <b>' + U.fmtMoney(round(avgProfit)) + '</b>',
      body: '<p>מרווח ממוצע של כ-' + margin + '% מהמחיר, אחרי חומרים ועבודה.</p>' +
        '<p class="ins-say">מנוף ישיר לרווחיות. עבודות עם מרווח נמוך שוות בדיקה מחדש של התמחור.</p>',
      meta: 'מבוסס על עלויות דמו (costPerCm וחומרים). עדכן עלויות אמיתיות לתמונה מדויקת.' };
  }

  /* =========================================================================
   * קטגוריה: לקוחות
   * ======================================================================= */
  function cardTopCustomers() {
    // D1 - לקוחות חוזרים ומובילים
    if (orders.length < 8) {
      return { status: 'muted', icon: I.customers, title: 'לקוחות מובילים',
        body: '<p>אחרי שיצטברו עוד הזמנות אראה לך מי הלקוחות שמביאים לך הכי הרבה, ומי חזר ליותר מעבודה אחת.</p>' + collecting(8, orders.length, 'הזמנות') };
    }
    var byCust = {};
    orders.forEach(function (o) {
      var k = o.customerId || o.customerName;
      if (!byCust[k]) byCust[k] = { name: o.customerName, total: 0, count: 0 };
      byCust[k].total += Number(o.price || 0);
      byCust[k].count += 1;
    });
    var arr = Object.keys(byCust).map(function (k) { return byCust[k]; });
    var returning = arr.filter(function (c) { return c.count >= 2; }).length;
    var pct = arr.length ? round(returning / arr.length * 100) : 0;
    var top = arr.sort(function (a, b) { return b.total - a.total; }).slice(0, 3)
      .map(function (c) {
        return '<li>' + esc(c.name) + ' · <b>' + U.fmtMoney(c.total) + '</b> · ' + c.count + ' הזמנות</li>';
      }).join('');
    return { status: 'ok', icon: I.customers,
      title: '<b>' + pct + '%</b> מהלקוחות חזרו ליותר מעבודה אחת',
      body: '<ul class="ins-list">' + top + '</ul>' +
        '<p class="ins-say">ללקוחות המובילים מגיע יחס. הודעת תודה או עדכון על עבודה חדשה. הם מקור ההכנסה היציב שלך.</p>',
      action: { label: 'לכל הלקוחות', tab: 'customers' } };
  }

  /* =========================================================================
   * render
   * ======================================================================= */
  function groupHTML(g) {
    return '<div class="ins-group">' +
      '<div class="ins-group__head" style="--gc:' + g.gc + ';--gt:' + g.gt + ';--gs:' + g.gs + '">' +
        '<span class="ins-group__title">' + esc(g.title) + '</span>' +
        '<span class="ins-group__count">' + g.cards.length + '</span>' +
      '</div>' +
      '<div class="ins-grid">' + g.cards.map(cardHTML).join('') + '</div>' +
    '</div>';
  }

  function generalEmpty() {
    return '<div class="empty">' + I.frameEmpty +
      '<h3>התובנות מתחילות להצטבר</h3>' +
      '<p>ככל שתפתח יותר הזמנות, אלמד את העסק שלך ואתחיל להמליץ לך מה להזמין, מה לתמחר, ועל מה להתמקד.</p></div>';
  }

  function render() {
    if (!bodyEl || !loaded.orders || !loaded.profiles) return;
    if (orders.length === 0) { bodyEl.innerHTML = generalEmpty(); return; }

    var groups = [
      { title: 'מלאי והזמנות', gc: 'var(--st-orange)', gt: 'var(--st-orange-text)', gs: 'var(--st-orange-soft)',
        cards: [cardRestock(), cardTopProfiles(), cardDeadStock()] },
      { title: 'תפעול', gc: 'var(--st-blue)', gt: 'var(--st-blue-text)', gs: 'var(--st-blue-soft)',
        cards: [cardWhatFirst(), cardWIP(), cardTurnaround()] },
      { title: 'כספים', gc: 'var(--st-green)', gt: 'var(--st-green-text)', gs: 'var(--st-green-soft)',
        cards: [cardIncome(), cardOpenBalance(), cardAOV(), cardProfit()] },
      { title: 'לקוחות', gc: 'var(--primary)', gt: 'var(--primary)', gs: 'var(--primary-soft)',
        cards: [cardTopCustomers()] }
    ];

    bodyEl.innerHTML = kpiRow() + groups.map(groupHTML).join('');
  }

  function onClick(e) {
    var cta = e.target.closest('[data-tab]');
    if (cta && Gallery.switchTab) { Gallery.switchTab(cta.getAttribute('data-tab')); }
  }

  Gallery.Insights = { mount: mount };

})(window);
