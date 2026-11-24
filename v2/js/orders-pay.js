/* =============================================================================
 * orders-pay.js  -  תשלום וקבלה להזמנה (admin בלבד)
 * OWNER: foundation (wave 2).
 * C9:  תשלום = סכום + סוג (מקדמה / תשלום סופי). בלי אמצעי תשלום בהזנה.
 * D9:  אמצעי התשלום נבחר בלחיצה אחת על שלב הקבלה (מזומן / אשראי / אחר).
 * C11/C12: אחרי הקבלה, "שלח ללקוח בוואטסאפ" = עותק ההזמנה + פרטי הקבלה.
 * חושף: Gallery.OrdersPay = { openPayment, payNow, openReceiptStep, openSendStep }
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;
  var D = Gallery.data;

  function backToOrder(orderId) { global.setTimeout(function () { Gallery.openOrder(orderId); }, 0); }

  /* ---------------------------------------------------------- שלב 1: סכום + סוג */
  function openPayment(orderId) {
    var o = D.orders.peekOne(orderId);
    if (!o) return;
    var paid = D.orders.paid(o), bal = D.orders.balance(o);
    var type = (o.payments || []).length ? 'final' : 'deposit';

    var node = Gallery.modalNode({
      title: 'תשלום · הזמנה <span class="mono">' + esc(o.number) + '</span>',
      body:
        '<div class="paysum">' +
          '<div><span>מחיר</span><b>' + U.fmtMoney(o.price) + '</b></div>' +
          '<div><span>שולם</span><b>' + U.fmtMoney(paid) + '</b></div>' +
          '<div class="' + (bal > 0 ? 'is-owed' : '') + '"><span>' + (bal < 0 ? 'שולם ביתר' : 'יתרה') + '</span><b>' + U.fmtMoney(Math.abs(bal)) + '</b></div>' +
        '</div>' +
        '<div class="seg seg--big" role="radiogroup" aria-label="סוג התשלום">' +
          '<button type="button" role="radio" data-type="deposit">מקדמה</button>' +
          '<button type="button" role="radio" data-type="final">תשלום סופי</button>' +
        '</div>' +
        '<div class="form-field"><label for="pay-amt">סכום (₪)</label>' +
          '<input id="pay-amt" class="bignum" type="number" inputmode="numeric" min="1" step="1" data-amt></div>',
      foot:
        '<button class="btn btn--primary btn--lg" data-next>' + I.receipt + 'המשך לקבלה</button>' +
        '<button class="btn btn--ghost" data-close>ביטול</button>'
    });

    var amt = node.querySelector('[data-amt]');
    function setType(t) {
      type = t;
      Array.prototype.forEach.call(node.querySelectorAll('[data-type]'), function (b) {
        b.setAttribute('aria-checked', String(b.getAttribute('data-type') === t));
      });
      if (t === 'final' && bal > 0) amt.value = bal;
      if (t === 'deposit' && Number(amt.value) === bal && paid === 0) amt.value = '';
    }
    setType(type);
    node.addEventListener('click', function (e) {
      var b = e.target.closest('[data-type]');
      if (b) { setType(b.getAttribute('data-type')); amt.focus(); return; }
      if (e.target.closest('[data-next]')) submit();
    });
    amt.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });

    var submitting = false;   // QA: הקשה כפולה לא רושמת שני תשלומים
    function submit() {
      if (submitting) return;
      var v = Math.round(Number(amt.value) || 0);
      if (v <= 0) { amt.focus(); Gallery.toast('צריך להזין סכום'); return; }
      // QA O3: תשלום מעל היתרה = אזהרה (יכול להיות טיפ או תיקון מחיר, לכן לא חוסמים)
      if (v > Math.max(0, bal) && !global.confirm('הסכום גבוה מהיתרה, להמשיך?')) { amt.focus(); return; }
      submitting = true;
      payNow(o.id, { amount: v, type: type }).catch(function (err) {
        submitting = false;
        Gallery.toast('רישום התשלום נכשל: ' + (err && err.message ? err.message : err));
      });
    }

    Gallery.openModal(node, { onClose: function () { backToOrder(o.id); } });
    amt.focus();
  }

  /* רושם תשלום ומעביר מיד לשלב הקבלה */
  function payNow(orderId, p) {
    return D.orders.addPayment(orderId, p).then(function (res) {
      openReceiptStep(orderId, res.payment.id);
      return res;
    });
  }

  /* ---------------------------------------------------------- שלב 2: קבלה (D9) */
  function openReceiptStep(orderId, paymentId) {
    var o = D.orders.peekOne(orderId);
    if (!o) return;
    var p = (o.payments || []).filter(function (x) { return x.id === paymentId; })[0];
    if (!p) return;

    var node = Gallery.modalNode({
      title: 'קבלה על ' + U.fmtMoney(p.amount),
      body:
        '<p class="step-q">איך הלקוח שילם?</p>' +
        '<div class="methods">' +
          '<button class="method" data-method="cash">' + I.coins + '<span>מזומן</span></button>' +
          '<button class="method" data-method="credit">' + I.wallet + '<span>אשראי</span></button>' +
          '<button class="method" data-method="other">' + I.receipt + '<span>אחר</span></button>' +
        '</div>' +
        '<p class="field-note">' + esc(D.orders.PAYMENT_TYPES[p.type]) + ' להזמנה ' + esc(o.number) +
          '. הקבלה כרגע מדומה, עד החיבור ל-Paperless.</p>',
      foot: '<button class="btn btn--ghost" data-close>דלג, בלי קבלה כרגע</button>'
    });
    var busy = false;
    node.addEventListener('click', function (e) {
      var m = e.target.closest('[data-method]');
      if (!m || busy) return;
      busy = true;
      m.classList.add('is-busy');
      Gallery.receipts.issueReceipt({
        source: 'order', refId: o.id, paymentId: p.id, customerId: o.customerId,
        amount: p.amount, method: m.getAttribute('data-method')
      }).then(function (r) { openSendStep(o.id, r.id); })
        .catch(function (err) { busy = false; m.classList.remove('is-busy'); Gallery.toast('הנפקת הקבלה נכשלה: ' + err.message); });
    });
    Gallery.openModal(node, { onClose: function () { backToOrder(o.id); }, focus: false });
  }

  /* ---------------------------------------------------------- שלב 3: שליחה ללקוח (C12) */
  function openSendStep(orderId, receiptId) {
    var o = D.orders.peekOne(orderId);
    var r = D.receipts.peekOne(receiptId);
    if (!o || !r) return;
    var c = D.customers.peekOne(o.customerId) || {};

    var node = Gallery.modalNode({
      title: I.check + 'קבלה מס\' ' + esc(r.number) + ' הונפקה',
      body:
        '<div class="rcpt">' +
          '<div class="rcpt__row"><span>סכום</span><b>' + U.fmtMoney(r.amount) + '</b></div>' +
          '<div class="rcpt__row"><span>אמצעי</span><b>' + esc(Gallery.receipts.methodLabel(r.method)) + '</b></div>' +
          '<div class="rcpt__row"><span>תאריך</span><b>' + U.fmtDate(r.at) + '</b></div>' +
          '<div class="rcpt__row"><span>לקוח</span><b>' + esc(c.name || '') + '</b></div>' +
        '</div>' +
        '<p class="field-note">נשלח ללקוח בוואטסאפ: עותק ההזמנה ופרטי הקבלה.</p>',
      foot:
        '<button class="btn btn--wa btn--lg" data-send>' + I.wa + 'שלח ללקוח בוואטסאפ</button>' +
        '<button class="btn btn--ghost" data-close>סיום</button>'
    });
    node.querySelector('[data-send]').addEventListener('click', function (e) {
      Gallery.whatsapp(c.phone, U.msgOrderAndReceipt(o, r));
      Gallery.receipts.markSent(r.id);
      var b = e.currentTarget;
      b.classList.add('is-ok');
      b.innerHTML = I.check + 'נשלח. אפשר לשלוח שוב';
    });
    Gallery.openModal(node, { onClose: function () { backToOrder(o.id); }, focus: false });
  }

  Gallery.OrdersPay = { openPayment: openPayment, payNow: payNow, openReceiptStep: openReceiptStep, openSendStep: openSendStep };

})(window);
