/* =============================================================================
 * admin-gate.js  -  קוד מנהל (4 ספרות) פעם אחת לכל מכשיר (C1 / D3)
 * OWNER: foundation (wave 2). נטען רק ב-admin.html.
 * הקוד נשמר בהגדרות (settings.adminPin, ברירת מחדל 1234). אחרי הצלחה המכשיר
 * נזכר (מפתח מכשיר, לא מסונכרן ולא נמחק בניקוי דמו).
 * הערה: זו הפרדה נוחה בין האייפדים, לא אבטחה. אבטחה אמיתית = Firebase Auth + rules.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var KEY = 'adminUnlocked';

  Gallery.lockAdmin = function () { Gallery.store.deviceSet(KEY, '0'); global.location.reload(); };

  Gallery.adminGate = function () {
    if (Gallery.store.deviceGet(KEY) === '1') return Promise.resolve();
    return new Promise(function (resolve) {
      var pin = '';
      var host = document.createElement('div');
      host.className = 'gate';
      host.innerHTML =
        '<div class="gate__box">' +
          '<img class="gate__logo" src="assets/logo.png?v=' + Gallery.VERSION + '" alt="">' +
          '<h1 class="gate__title">כניסת חנות</h1>' +
          '<p class="gate__sub">קוד מנהל, פעם אחת במכשיר הזה</p>' +
          '<div class="gate__dots" aria-live="polite"><span></span><span></span><span></span><span></span></div>' +
          '<div class="gate__msg" data-msg></div>' +
          '<div class="gate__pad">' +
            [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button type="button" data-n="' + n + '">' + n + '</button>'; }).join('') +
            '<a class="gate__alt" href="index.html">חזרה</a>' +
            '<button type="button" data-n="0">0</button>' +
            '<button type="button" data-back aria-label="מחיקה">⌫</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(host);

      var dots = host.querySelectorAll('.gate__dots span');
      var msg = host.querySelector('[data-msg]');
      function paint() {
        Array.prototype.forEach.call(dots, function (d, i) { d.classList.toggle('on', i < pin.length); });
      }
      function check() {
        var want = String(Gallery.data.settings.peek().adminPin || '1234');
        if (pin === want) {
          Gallery.store.deviceSet(KEY, '1');
          host.remove();
          document.removeEventListener('keydown', onKey);
          resolve();
        } else {
          msg.textContent = 'קוד שגוי, נסו שוב';
          host.querySelector('.gate__dots').classList.add('shake');
          global.setTimeout(function () { host.querySelector('.gate__dots').classList.remove('shake'); }, 400);
          pin = ''; paint();
        }
      }
      function press(d) {
        if (pin.length >= 4) return;
        msg.textContent = '';
        pin += d; paint();
        if (pin.length === 4) global.setTimeout(check, 120);
      }
      host.addEventListener('click', function (e) {
        var b = e.target.closest('[data-n]');
        if (b) { press(b.getAttribute('data-n')); return; }
        if (e.target.closest('[data-back]')) { pin = pin.slice(0, -1); paint(); }
      });
      function onKey(e) {
        if (/^[0-9]$/.test(e.key)) press(e.key);
        else if (e.key === 'Backspace') { pin = pin.slice(0, -1); paint(); }
      }
      document.addEventListener('keydown', onKey);
    });
  };

})(window);
