/* =============================================================================
 * data-firestore-ui.js  -  ממשק הסנכרון: מסך "קוד חנות", מסך שגיאת חיבור, מחוון סנכרון
 * OWNER: agent D (wave 3). נטען דינמית מ-js/data-firestore.js (אין תג ב-HTML).
 * משתמש במחלקות .gate / .btn מ-foundation.css כדי להיראות כמו שער קוד המנהל.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery = global.Gallery || {};

  var CSS = [
    '.gsync-gate .gate__box{max-width:440px}',
    '.gsync-gate__input{width:100%;height:68px;border:2px solid var(--line-strong);border-radius:var(--r-lg);',
    'background:var(--bg-surface);font:600 1.6rem/1 var(--font-mono);text-align:center;direction:ltr;color:var(--ink);padding:0 var(--s-4)}',
    '.gsync-gate__input:focus{outline:none;border-color:var(--primary);box-shadow:0 0 0 4px var(--primary-soft)}',
    '.gsync-gate__label{display:block;font-size:var(--fs-lg);font-weight:600;margin:0 0 var(--s-2)}',
    '.gsync-gate__hint{font-size:var(--fs-sm);color:var(--ink-muted);margin:var(--s-2) 0 0}',
    '.gsync-gate__msg{min-height:26px;color:var(--st-red-text);font-weight:600;margin:var(--s-2) 0}',
    '.gsync-gate__actions{display:flex;flex-direction:column;gap:var(--s-3);margin-top:var(--s-2)}',
    '.gsync-gate__actions .btn{min-height:var(--touch-lg);width:100%;justify-content:center}',
    /* W4: המחוון משולב בניווט ולא צף מעל התוכן.
       לרוחב: שורה בתחתית ה-rail (מעל "מסך בחירה"). לאורך (<=900px): פריט אחרון בבר התחתון. */
    '.gsync{display:flex;align-items:center;gap:var(--s-2);width:100%;min-height:var(--touch);padding:0 var(--s-3);',
    'border:1px solid transparent;border-radius:var(--r-md);background:transparent;color:var(--ink-secondary);',
    'font:var(--fw-semibold) var(--fs-sm)/1.2 var(--font-ui);cursor:pointer;text-align:start}',
    '.gsync:hover{background:var(--bg-surface-alt)}',
    '.gsync:focus-visible{outline:none;box-shadow:var(--focus-ring)}',
    '.gsync__dot{width:12px;height:12px;border-radius:50%;background:var(--st-grey);flex:none;margin-inline:4px}',
    '.gsync--synced .gsync__dot{background:var(--st-green)}',
    '.gsync--syncing .gsync__dot{background:var(--st-blue);animation:gsyncPulse 1s ease-in-out infinite}',
    '.gsync--offline .gsync__dot{background:var(--st-orange)}',
    '.gsync--error .gsync__dot{background:var(--st-red)}',
    '.gsync--error{color:var(--st-red-text)}',
    '@keyframes gsyncPulse{50%{opacity:.3}}',
    '.bottombar .gsync{flex:1 0 76px;min-width:76px;width:auto;flex-direction:column;justify-content:center;gap:6px;',
    'padding:var(--s-2) 0;border-radius:var(--r-sm);font-size:12px;text-align:center}',
    '.bottombar .gsync__dot{width:16px;height:16px;margin:4px 0}',
    '.gsync--float{position:fixed;z-index:40;left:12px;bottom:calc(12px + env(safe-area-inset-bottom));width:auto;',
    'background:var(--bg-surface);border-color:var(--line);box-shadow:var(--e1)}',
    '@media print{.gsync{display:none}}',
    '.gsync-info dl{display:grid;grid-template-columns:auto 1fr;gap:var(--s-2) var(--s-4);margin:0 0 var(--s-4);font-size:var(--fs-md)}',
    '.gsync-info dt{color:var(--ink-secondary)}.gsync-info dd{margin:0;font-weight:600}',
    '.gsync-info p{color:var(--ink-secondary);margin:0 0 var(--s-3)}'
  ].join('');

  function injectCss() {
    if (document.getElementById('gsync-css')) return;
    var st = document.createElement('style');
    st.id = 'gsync-css'; st.textContent = CSS;
    document.head.appendChild(st);
  }
  function el(html) { var d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; }
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function roleLabel() { return document.documentElement.getAttribute('data-role') === 'workshop' ? 'סדנה' : 'חנות'; }

  var LABELS = { synced: 'מסונכרן', syncing: 'מסנכרן...', offline: 'לא מקוון', local: 'מצב מקומי', error: 'שגיאת סנכרון' };

  /* ------------------------------------------------------ מסך קוד חנות */
  function askShopCode(o) {
    injectCss();
    return new Promise(function (resolve) {
      var gate = el(
        '<div class="gate gsync-gate" role="dialog" aria-modal="true" aria-labelledby="gsync-title">' +
          '<form class="gate__box" novalidate>' +
            '<img class="gate__logo" src="assets/logo.png?v=' + (Gallery.VERSION || '') + '" alt="">' +
            '<h1 class="gate__title" id="gsync-title">חיבור לחנות</h1>' +
            '<p class="gate__sub">מכשיר: ' + roleLabel() + '. אותו קוד חנות בשני האייפדים, והנתונים מסונכרנים ביניהם.</p>' +
            '<label class="gsync-gate__label" for="gsync-code">קוד חנות</label>' +
            '<input class="gsync-gate__input" id="gsync-code" name="code" inputmode="text" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="64" value="' + esc(o.last) + '">' +
            '<p class="gsync-gate__hint">אותיות באנגלית, ספרות ומקף. לפחות 6 תווים.</p>' +
            '<div class="gsync-gate__msg" aria-live="polite"></div>' +
            '<div class="gsync-gate__actions">' +
              '<button type="submit" class="btn btn--primary btn--lg">התחבר</button>' +
              '<button type="button" class="btn btn--ghost" data-local>המשך בלי סנכרון (מצב דמו מקומי)</button>' +
            '</div>' +
          '</form>' +
        '</div>');
      document.body.appendChild(gate);
      var input = gate.querySelector('input'), msg = gate.querySelector('.gsync-gate__msg');
      global.setTimeout(function () { try { input.focus(); } catch (e) {} }, 50);
      function done(v) { gate.remove(); resolve(v); }
      gate.querySelector('form').addEventListener('submit', function (e) {
        e.preventDefault();
        var code = o.normalize(input.value);
        if (!o.validate(code)) { msg.textContent = 'הקוד לא תקין. אותיות באנגלית, ספרות ומקף, לפחות 6 תווים.'; input.focus(); return; }
        done({ code: code });
      });
      gate.querySelector('[data-local]').addEventListener('click', function () { done({ local: true }); });
    });
  }

  /* ------------------------------------------------- מסך שגיאת חיבור */
  function showError(o) {
    injectCss();
    return new Promise(function (resolve) {
      var gate = el(
        '<div class="gate gsync-gate" role="alertdialog" aria-modal="true" aria-labelledby="gsync-err">' +
          '<div class="gate__box">' +
            '<img class="gate__logo" src="assets/logo.png?v=' + (Gallery.VERSION || '') + '" alt="">' +
            '<h1 class="gate__title" id="gsync-err">' + esc(o.title) + '</h1>' +
            '<p class="gate__sub">' + esc(o.text) + '</p>' +
            '<div class="gsync-gate__actions">' +
              '<button type="button" class="btn btn--primary btn--lg" data-a="retry">נסה שוב</button>' +
              '<button type="button" class="btn btn--secondary" data-a="change">הזן קוד חנות אחר</button>' +
              '<button type="button" class="btn btn--ghost" data-a="local">עבוד עכשיו במצב מקומי (לא יסונכרן)</button>' +
            '</div>' +
          '</div>' +
        '</div>');
      document.body.appendChild(gate);
      gate.addEventListener('click', function (e) {
        var b = e.target.closest('[data-a]'); if (!b) return;
        gate.remove(); resolve(b.getAttribute('data-a'));
      });
    });
  }

  /* ------------------------------------------------------ מחוון סנכרון */
  function mountIndicator(api) {
    injectCss();
    function make(extra) {
      var b = el('<button type="button" class="gsync ' + extra + '" aria-live="polite"><span class="gsync__dot" aria-hidden="true"></span><span class="gsync__txt"></span></button>');
      b.addEventListener('click', function () { openInfo(api); });
      return b;
    }
    function mount() {
      if (document.querySelector('.gsync')) return;
      var btns = [];
      var foot = document.querySelector('#rail .rail__foot');
      var bar = document.getElementById('bottombar');
      if (foot) { var r = make('gsync--rail'); foot.insertBefore(r, foot.querySelector('.rail__tool--link')); btns.push(r); }
      if (bar) { var b = make('gsync--bar'); bar.appendChild(b); btns.push(b); }
      if (!btns.length) { var f = make('gsync--float'); document.body.appendChild(f); btns.push(f); }
      api.onStatus(function (st) {
        var label = LABELS[st.status] || st.status;
        var title = st.mode === 'cloud' ? 'סנכרון ענן: ' + label : 'הנתונים נשמרים רק במכשיר הזה';
        btns.forEach(function (btn) {
          var keep = btn.className.match(/gsync--(rail|bar|float)/)[0];
          btn.className = 'gsync ' + keep + ' gsync--' + st.status;
          btn.querySelector('.gsync__txt').textContent = label;
          btn.title = title;
        });
      });
    }
    // הניווט נבנה ב-app.js אחרי ה-store ושער הקוד, לכן מחכים ל-onReady.
    if (Gallery.onReady) Gallery.onReady(mount); else mount();
  }

  function openInfo(api) {
    if (!Gallery.openModal || !Gallery.modalNode) return;
    var st = api.status(), cloud = st.mode === 'cloud';
    var body = '<div class="gsync-info">' +
      (cloud
        ? '<dl><dt>מצב</dt><dd>' + esc(LABELS[st.status]) + '</dd><dt>קוד חנות</dt><dd class="mono" dir="ltr">' + esc(st.shop) + '</dd>' +
          (st.pending ? '<dt>ממתין לשליחה</dt><dd>' + st.pending + '</dd>' : '') +
          (st.error ? '<dt>שגיאה</dt><dd>' + esc(st.error) + '</dd>' : '') + '</dl>' +
          '<p>כל שינוי נשמר מיד במכשיר ונשלח לענן. בלי אינטרנט ממשיכים לעבוד, והשינויים יישלחו כשהחיבור יחזור.</p>'
        : '<p>המכשיר עובד במצב מקומי: הנתונים נשמרים רק כאן ולא מסונכרנים לאייפד השני.</p>') +
      '</div>';
    var foot = (cloud ? '<button type="button" class="btn btn--secondary" data-act="change">החלף קוד חנות</button>'
                      : '<button type="button" class="btn btn--primary" data-act="change">חבר לסנכרון ענן</button>') +
      '<a class="btn btn--ghost" href="index.html">מסך בחירה</a>' +
      '<button type="button" class="btn btn--ghost" data-close>סגור</button>';
    var node = Gallery.modalNode({ title: 'סנכרון', body: body, foot: foot });
    node.addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]'); if (!b) return;
      if (cloud && !global.confirm('להתנתק מהחנות במכשיר הזה ולהזין קוד אחר? הנתונים בענן לא נמחקים.')) return;
      api.askAgain();
    });
    Gallery.openModal(node, { focus: false });
  }

  Gallery.syncUI = { askShopCode: askShopCode, showError: showError, mountIndicator: mountIndicator };

})(window);
