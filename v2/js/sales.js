/* =============================================================================
 * sales.js  -  מכירת מוצר (C21) + קבלות (C32), admin בלבד
 * OWNER: agent C (wave 3). חוזה: P-projects/The-Gallery/context/v2-contract.md
 * -----------------------------------------------------------------------------
 * Gallery.openSale(productId)          טופס מכירה: לקוח, מחיר, אמצעי בלחיצה אחת, קבלה, וואטסאפ
 * Gallery.SalesUI.pickProduct()        בחירת מוצר זמין ואז openSale
 * Gallery.ReceiptsUI.openList()        רשימת כל הקבלות + חיפוש (C32)
 * Gallery.ReceiptsUI.openView(id)      קבלה בעיצוב פנקס "הגלריה" + שליחה בוואטסאפ
 * Gallery.ReceiptsUI.issueFor(payload) בחירת אמצעי בלחיצה אחת ואז הנפקה (משמש גם את סוף היום)
 * לא נטען ב-workshop. סגנונות: css/finance.css (קידומת sale- / rcv-).
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var D = Gallery.data;
  var esc = U.esc;

  function shop() { return D.settings.peek().shop || {}; }
  function custName(id) { return id ? D.customers.nameOf(id) : ''; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s\-]/g, ''); }

  var METHOD_BTNS =
    '<div class="sale-methods">' +
      '<button class="sale-method" data-method="cash">' + I.coins + '<span>מזומן</span></button>' +
      '<button class="sale-method" data-method="credit">' + I.wallet + '<span>אשראי</span></button>' +
      '<button class="sale-method" data-method="other">' + I.receipt + '<span>אחר</span></button>' +
    '</div>';

  /* =========================================================================
   * C21: מכירת מוצר
   * ======================================================================= */
  /* opts.customerId (W4): לקוח שנבחר מראש, למשל מכרטיס הלקוח */
  function openSale(productId, opts) {
    opts = opts || {};
    var p = D.products.peekOne(productId);
    if (!p) { Gallery.toast('המוצר לא נמצא'); return; }
    if (Number(p.qty || 0) <= 0) { Gallery.toast('המוצר הזה כבר נמכר (אין במלאי)'); return; }
    var picked = null; /* לקוח קיים שנבחר */

    var node = Gallery.modalNode({
      title: I.tag + 'מכירת מוצר',
      body:
        '<div class="sale-prod">' +
          '<div class="sale-prod__name">' + esc(p.name) + '</div>' +
          '<div class="sale-prod__meta">' +
            [D.PRODUCT_KINDS[p.kind], p.size, p.frame ? 'מסגרת ' + p.frame : '', p.sticker ? 'מדבקה ' + p.sticker : '', 'במלאי: ' + (p.qty || 0)]
              .filter(Boolean).map(esc).join(' · ') +
          '</div>' +
        '</div>' +
        '<div class="sale-step">1. מי הלקוח?</div>' +
        '<div class="form-field"><label for="sale-q">חיפוש לקוח קיים (שם או טלפון)</label>' +
          '<input id="sale-q" type="search" data-q autocomplete="off" placeholder="התחילו להקליד..."></div>' +
        '<div class="sale-hits" data-hits></div>' +
        '<div class="sale-picked" data-picked hidden></div>' +
        '<div class="form-grid" data-newcust>' +
          '<div class="form-field"><label for="sale-name">שם לקוח</label><input id="sale-name" type="text" data-name></div>' +
          '<div class="form-field"><label for="sale-phone">טלפון</label><input id="sale-phone" type="tel" inputmode="tel" data-phone></div>' +
        '</div>' +
        '<div class="sale-step">2. מחיר</div>' +
        '<div class="form-field"><label for="sale-price">מחיר (₪)</label>' +
          '<input id="sale-price" class="sale-price" type="number" inputmode="numeric" min="0" step="1" data-price value="' + esc(Math.round(Number(p.price || 0))) + '"></div>' +
        '<div class="sale-step">3. איך שילם? (לחיצה אחת מסיימת את המכירה ומנפיקה קבלה)</div>' + METHOD_BTNS,
      foot: '<button class="btn btn--ghost" data-noreceipt>מכירה בלי קבלה כרגע</button><button class="btn btn--ghost" data-close>ביטול</button>'
    });
    node.classList.add('sale-modal');

    var qEl = node.querySelector('[data-q]'), hitsEl = node.querySelector('[data-hits]');
    var pickedEl = node.querySelector('[data-picked]'), newEl = node.querySelector('[data-newcust]');

    function renderHits() {
      var q = norm(qEl.value);
      if (!q) { hitsEl.innerHTML = ''; return; }
      var hits = D.customers.peek().filter(function (c) { return norm(c.name).indexOf(q) !== -1 || norm(c.phone).indexOf(q) !== -1; }).slice(0, 6);
      hitsEl.innerHTML = hits.length ? hits.map(function (c) {
        var tone = U.visitTone(D.customers.visitCount(c.id));
        return '<button type="button" class="sale-hit" data-cid="' + esc(c.id) + '"><b class="' + (tone ? 'tone-' + tone : '') + '">' + esc(c.name) + '</b><span class="mono">' + esc(c.phone || '') + '</span></button>';
      }).join('') : '<div class="sale-nohit">לא נמצא. אפשר למלא לקוח חדש למטה.</div>';
    }
    function setPicked(c) {
      picked = c;
      if (c) {
        pickedEl.hidden = false; newEl.hidden = true; hitsEl.innerHTML = '';
        pickedEl.innerHTML = I.customers + '<b>' + esc(c.name) + '</b><span class="mono">' + esc(c.phone || '') + '</span>' +
          '<button type="button" class="btn btn--ghost btn--sm" data-unpick>החלף לקוח</button>';
      } else { pickedEl.hidden = true; newEl.hidden = false; qEl.value = ''; }
    }
    qEl.addEventListener('input', renderHits);
    if (opts.customerId) { var pre = D.customers.peekOne(opts.customerId); if (pre) setPicked(pre); }

    var busy = false;
    function finish(method) {
      if (busy) return;
      var price = Math.round(Number(node.querySelector('[data-price]').value) || 0);
      if (price <= 0) { node.querySelector('[data-price]').focus(); Gallery.toast('צריך מחיר'); return; }
      var custP;
      if (picked) custP = Promise.resolve(picked);
      else {
        var name = node.querySelector('[data-name]').value.trim(), phone = node.querySelector('[data-phone]').value.trim();
        if (!name) { node.querySelector('[data-name]').focus(); Gallery.toast('צריך שם לקוח (או לבחור לקוח קיים)'); return; }
        custP = D.customers.upsert({ name: name, phone: phone });
      }
      busy = true;
      custP.then(function (c) {
        return D.sales.create({ productId: p.id, customerId: c.id, price: price }).then(function (sale) {
          if (!method) return { sale: sale, receipt: null, customer: c };
          return Gallery.receipts.issueReceipt({ source: 'sale', refId: sale.id, customerId: c.id, amount: price, method: method })
            .then(function (r) { return { sale: sale, receipt: r, customer: c }; });
        });
      }).then(function (res) {
        if (res.receipt) openView(res.receipt.id, { title: I.check + 'המכירה נרשמה, קבלה מס\' ' + esc(res.receipt.number) });
        else { Gallery.closeModal(); Gallery.toast('המכירה נרשמה בלי קבלה. אפשר להנפיק מסוף היום בכספים.'); }
      }).catch(function (err) { busy = false; Gallery.toast('המכירה נכשלה: ' + err.message); });
    }

    node.addEventListener('click', function (e) {
      var t = e.target, el;
      if ((el = t.closest('[data-cid]'))) { setPicked(D.customers.peekOne(el.getAttribute('data-cid'))); return; }
      if (t.closest('[data-unpick]')) { setPicked(null); qEl.focus(); return; }
      if ((el = t.closest('[data-method]'))) { el.classList.add('is-busy'); finish(el.getAttribute('data-method')); return; }
      if (t.closest('[data-noreceipt]')) finish(null);
    });
    Gallery.openModal(node, { wide: true });
  }

  /* בחירת מוצר זמין (מתוך כספים) */
  function pickProduct(opts) {
    var list = D.products.available();
    var node = Gallery.modalNode({
      title: I.tag + 'איזה מוצר נמכר?',
      body: '<div class="search"><input type="search" data-pq placeholder="חיפוש לפי שם או מדבקה"></div><div class="sale-plist" data-plist></div>'
    });
    var listEl = node.querySelector('[data-plist]');
    function draw(q) {
      q = norm(q);
      var rows = list.filter(function (p) { return !q || norm(p.name).indexOf(q) !== -1 || norm(p.sticker).indexOf(q) !== -1; });
      listEl.innerHTML = rows.length ? rows.map(function (p) {
        return '<button type="button" class="sale-prow" data-pid="' + esc(p.id) + '">' +
          '<span class="sale-prow__st mono">' + esc(p.sticker || '') + '</span>' +
          '<span class="sale-prow__name">' + esc(p.name) + '<small>' + esc([D.PRODUCT_KINDS[p.kind], p.size].filter(Boolean).join(' · ')) + '</small></span>' +
          '<span class="sale-prow__price">' + U.fmtMoney(p.price) + '</span></button>';
      }).join('') : '<div class="empty"><p>אין מוצרים זמינים למכירה.</p></div>';
    }
    draw('');
    node.querySelector('[data-pq]').addEventListener('input', function (e) { draw(e.target.value); });
    node.addEventListener('click', function (e) {
      var b = e.target.closest('[data-pid]');
      if (b) { Gallery.closeModal(); openSale(b.getAttribute('data-pid'), opts); }
    });
    Gallery.openModal(node, { wide: true });
  }

  /* =========================================================================
   * C32: קבלות
   * ======================================================================= */
  function refText(r) {
    if (r.source === 'order') { var o = D.orders.peekOne(r.refId); return o ? 'הזמנה ' + o.number : 'הזמנה'; }
    var s = D.sales.peekOne(r.refId), p = s ? D.products.peekOne(s.productId) : null;
    return p ? p.name : 'מכירת מוצר';
  }

  var listState = { q: '', newest: true };

  function openList() {
    var node = Gallery.modalNode({
      title: I.receipt + 'קבלות',
      body:
        '<div class="rcv-tools">' +
          '<div class="search rcv-search">' + I.search + '<input type="search" data-rq placeholder="חיפוש: מספר קבלה, לקוח או סכום" value="' + esc(listState.q) + '"></div>' +
          '<div class="seg" role="radiogroup" aria-label="סדר">' +
            '<button type="button" role="radio" data-sort="new" aria-checked="' + listState.newest + '">חדשות קודם</button>' +
            '<button type="button" role="radio" data-sort="old" aria-checked="' + !listState.newest + '">לפי סדר ההנפקה</button>' +
          '</div>' +
        '</div>' +
        '<div class="rcv-count" data-rcount></div>' +
        '<div class="rcv-list" data-rlist></div>'
    });
    var listEl = node.querySelector('[data-rlist]'), cntEl = node.querySelector('[data-rcount]');
    function draw() {
      var q = norm(listState.q);
      var rows = D.receipts.peek().filter(function (r) {
        if (!q) return true;
        return String(r.number).indexOf(q) !== -1 || norm(custName(r.customerId)).indexOf(q) !== -1 ||
          String(Math.round(r.amount)).indexOf(q) !== -1 || norm(refText(r)).indexOf(q) !== -1;
      }).sort(function (a, b) { return listState.newest ? b.number - a.number : a.number - b.number; });
      cntEl.textContent = rows.length === 1 ? 'קבלה אחת' : rows.length + ' קבלות';
      listEl.innerHTML = rows.length ? rows.map(function (r) {
        return '<button type="button" class="rcv-row" data-rid="' + esc(r.id) + '">' +
          '<span class="rcv-row__no mono">' + esc(r.number) + '</span>' +
          '<span class="rcv-row__main"><b>' + esc(custName(r.customerId) || 'לקוח') + '</b><small>' + esc(refText(r)) + ' · ' + U.fmtDate(r.at) + '</small></span>' +
          '<span class="rcv-row__m">' + esc(Gallery.receipts.methodLabel(r.method)) + '</span>' +
          '<span class="rcv-row__amt">' + U.fmtMoney(r.amount) + '</span>' +
          '<span class="rcv-row__sent' + (r.sentToCustomer ? ' is-sent' : '') + '">' + (r.sentToCustomer ? I.check + 'נשלחה' : 'לא נשלחה') + '</span>' +
        '</button>';
      }).join('') : '<div class="empty"><p>לא נמצאו קבלות.</p></div>';
    }
    node.querySelector('[data-rq]').addEventListener('input', function (e) { listState.q = e.target.value; draw(); });
    node.addEventListener('click', function (e) {
      var s = e.target.closest('[data-sort]');
      if (s) {
        listState.newest = s.getAttribute('data-sort') === 'new';
        Array.prototype.forEach.call(node.querySelectorAll('[data-sort]'), function (b) { b.setAttribute('aria-checked', String(b === s)); });
        draw(); return;
      }
      var r = e.target.closest('[data-rid]');
      if (r) openView(r.getAttribute('data-rid'), { back: true });
    });
    draw();
    Gallery.openModal(node, { xwide: true, focus: false });
  }

  function receiptMsg(r) {
    var c = D.customers.peekOne(r.customerId) || {};
    var lines = ['שלום ' + (c.name || '') + ',', 'תודה שקנית ב' + (shop().name || 'הגלריה') + '.', ''];
    lines.push('עבור: ' + refText(r));
    lines.push(U.msgReceipt(r));
    lines.push('', (shop().name || 'הגלריה') + ' · ' + (shop().phone || ''));
    return lines.join('\n');
  }

  /* קבלה בעיצוב פנקס הקבלות של החנות (מדומה עד Paperless) */
  function openView(receiptId, opts) {
    opts = opts || {};
    var r = D.receipts.peekOne(receiptId);
    if (!r) return;
    var s = shop(), c = D.customers.peekOne(r.customerId) || {};
    var node = Gallery.modalNode({
      title: opts.title || (I.receipt + 'קבלה מס\' ' + esc(r.number)),
      body:
        '<div class="rcv-paper">' +
          '<div class="rcv-paper__head">' +
            '<img class="rcv-paper__logo" src="assets/logo.png?v=' + Gallery.VERSION + '" alt="">' +
            '<div class="rcv-paper__shop"><div class="rcv-paper__name">' + esc(s.name || 'הגלריה') + '</div>' +
              '<div>מסגרות · גלריה לאמנות</div>' +
              '<div>' + esc(String(s.address || '').replace(/\s*\(.*\)\s*$/, '')) + '</div>' +
              '<div>טלפקס ' + esc(s.phone || '') + '</div>' +
              '<div>עוסק מורשה ' + esc(s.vatId || '') + '</div></div>' +
            '<div class="rcv-paper__no"><span>קבלה</span><b class="mono">' + esc(r.number) + '</b></div>' +
          '</div>' +
          '<div class="rcv-paper__line"><span>תאריך</span><b>' + U.fmtDate(r.at) + ' ' + U.fmtTime(r.at) + '</b></div>' +
          '<div class="rcv-paper__line"><span>התקבל מאת</span><b>' + esc(c.name || '') + (c.phone ? ' <small class="mono">' + esc(c.phone) + '</small>' : '') + '</b></div>' +
          '<div class="rcv-paper__line"><span>עבור</span><b>' + esc(refText(r)) + '</b></div>' +
          '<div class="rcv-paper__line"><span>אמצעי תשלום</span><b>' + esc(Gallery.receipts.methodLabel(r.method)) + '</b></div>' +
          '<div class="rcv-paper__sum"><span>סה"כ</span><b>' + U.fmtMoney(r.amount) + '</b></div>' +
          '<div class="rcv-paper__sig"><span>חתימה: ' + esc(s.owner || '') + '</span><span>תודה רבה</span></div>' +
          '<div class="rcv-paper__sim">קבלה מדומה (' + esc(r.provider || 'simulated') + '). אחרי החיבור ל-Paperless תופיע כאן הקבלה הרשמית.</div>' +
        '</div>' +
        (r.sentToCustomer ? '<p class="rcv-sent">' + I.check + 'נשלחה ללקוח</p>' : ''),
      foot:
        '<button class="btn btn--wa btn--lg" data-send' + (c.phone ? '' : ' disabled title="ללקוח אין טלפון"') + '>' + I.wa + 'שלח ללקוח בוואטסאפ</button>' +
        (opts.back ? '<button class="btn btn--secondary" data-back>חזרה לרשימה</button>' : '') +
        '<button class="btn btn--ghost" data-close>סגירה</button>'
    });
    node.classList.add('rcv-modal');
    node.addEventListener('click', function (e) {
      if (e.target.closest('[data-back]')) { openList(); return; }
      var b = e.target.closest('[data-send]');
      if (b && !b.disabled) {
        Gallery.whatsapp(c.phone, receiptMsg(r));
        Gallery.receipts.markSent(r.id);
        b.classList.add('is-ok');
        b.innerHTML = I.check + 'נשלח. אפשר לשלוח שוב';
      }
    });
    Gallery.openModal(node, { focus: false, onClose: opts.onClose });
  }

  /* הנפקה בדיעבד (מתוך התראות סוף יום): בחירת אמצעי בלחיצה אחת */
  function issueFor(payload, title) {
    var node = Gallery.modalNode({
      title: I.receipt + (title || 'הנפקת קבלה') + ' · ' + U.fmtMoney(payload.amount),
      body: '<p class="sale-step">איך הלקוח שילם?</p>' + METHOD_BTNS +
        '<p class="rcv-note">' + esc(custName(payload.customerId)) + '. הקבלה כרגע מדומה, עד החיבור ל-Paperless.</p>',
      foot: '<button class="btn btn--ghost" data-close>ביטול</button>'
    });
    var busy = false;
    node.addEventListener('click', function (e) {
      var m = e.target.closest('[data-method]');
      if (!m || busy) return;
      busy = true; m.classList.add('is-busy');
      Gallery.receipts.issueReceipt(Object.assign({}, payload, { method: m.getAttribute('data-method') }))
        .then(function (r) { openView(r.id, { title: I.check + 'קבלה מס\' ' + esc(r.number) + ' הונפקה' }); })
        .catch(function (err) { busy = false; m.classList.remove('is-busy'); Gallery.toast('הנפקה נכשלה: ' + err.message); });
    });
    Gallery.openModal(node, { focus: false });
  }

  Gallery.openSale = openSale;
  Gallery.SalesUI = { openSale: openSale, pickProduct: pickProduct };
  Gallery.ReceiptsUI = { openList: openList, openView: openView, issueFor: issueFor, refText: refText };

})(window);
