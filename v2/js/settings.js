/* =============================================================================
 * settings.js  -  הגדרות וגיבוי (admin בלבד): Gallery.openSettings()
 * OWNER: foundation (wave 2).
 * C3 / D5: ייצוא גיבוי (JSON), ייבוא גיבוי, והצעת הורדה אוטומטית פעם ביום
 *          בכניסה הראשונה של המנהל (אם יש אינטרנט ועוד לא גובה היום).
 * D10:     "נקה נתוני דמו" לפני ניסוי אמיתי.
 * C14:     מצב פתיחת וואטסאפ.
 * W4:      סנכרון ענן (Gallery.backend): מצב + קוד חנות + החלפת קוד + העלאת נתונים מקומיים לענן.
 *          בענן: ניקוי דמו דורש הקלדת קוד החנות (מוחק בשני האייפדים), והגיבוי מחכה ל-flush.
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;
  var D = Gallery.data;
  var S = Gallery.store;

  var WA_MODES = [
    { id: 'auto', label: 'אוטומטי', hint: 'אייפד וטלפון: אפליקציה. מחשב: וואטסאפ ווב' },
    { id: 'app', label: 'אפליקציה', hint: 'פותח ישר את וואטסאפ במכשיר' },
    { id: 'web', label: 'וואטסאפ ווב', hint: 'לשונית אחת קבועה במחשב' },
    { id: 'wame', label: 'קישור רגיל', hint: 'wa.me, עם דף ביניים' }
  ];

  /* ---------------------------------------------------------------- סנכרון */
  var FLUSH_MS = 10000;
  function B() { return Gallery.backend || null; }
  function isCloud() { var b = B(); return !!(b && b.mode && b.mode() === 'cloud'); }
  function shopCode() { var b = B(); return (b && b.shopCode && b.shopCode()) || ''; }

  /* ---------------------------------------------------------------- גיבוי */
  function todayKey() { return U.toDateInput(new Date().toISOString()); }

  /* בענן: קודם מחכים שכל השינויים במכשיר יגיעו לשרת (עד 10 שניות), ואז מייצאים דרך Gallery.backend.
     מקומי: כמו קודם (Gallery.data.exportAll). */
  function collectDump() {
    if (!isCloud()) return D.exportAll().then(function (dump) { return { dump: dump, partial: false }; });
    var partial = false;
    var flushed = new Promise(function (res) {
      var t = global.setTimeout(function () { partial = true; res(); }, FLUSH_MS);
      B().flush().then(function () { global.clearTimeout(t); res(); }, function () { global.clearTimeout(t); partial = true; res(); });
    });
    return flushed.then(function () { return B().exportAll(); }).then(function (dump) { return { dump: dump, partial: partial }; });
  }

  function downloadBackup() {
    return collectDump().then(function (res) {
      var dump = res.dump;
      var blob = new Blob([JSON.stringify(dump, null, 1)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var hhmm = new Date().toTimeString().slice(0, 5).replace(':', '');
      a.href = url;
      a.download = 'gallery-backup-' + (shopCode() ? shopCode() + '-' : '') + todayKey() + '-' + hhmm + '.json';
      document.body.appendChild(a);
      a.click();
      global.setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
      return D.settings.update({ lastBackupAt: new Date().toISOString() }).then(function () { return res.partial; });
    }).then(function (partial) {
      Gallery.toast(partial ? 'הגיבוי ירד למכשיר. שימו לב: חלק מהשינויים האחרונים עוד לא הגיעו לענן (אין חיבור), אבל הם כלולים בגיבוי.' : 'הגיבוי ירד למכשיר');
    }).catch(function (e) { Gallery.toast('הגיבוי נכשל: ' + (e && e.message ? e.message : 'שגיאה לא ידועה')); });
  }

  function importBackup(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var dump;
      try { dump = JSON.parse(reader.result); } catch (e) { Gallery.toast('הקובץ לא נקרא. צריך קובץ גיבוי של הגלריה (json).'); return; }
      if (!dump || dump.app !== 'the-gallery') { Gallery.toast('זה לא קובץ גיבוי של הגלריה'); return; }
      var when = dump.exportedAt ? U.fmtDate(dump.exportedAt) + ' ' + U.fmtTime(dump.exportedAt) : 'לא ידוע';
      if (!global.confirm('לשחזר את הגיבוי מ-' + when + '?\nכל הנתונים הנוכחיים יוחלפו בנתוני הגיבוי.' +
        (isCloud() ? '\n\nהמכשיר מחובר לענן: השחזור יחליף את הנתונים בשני האייפדים.' : ''))) return;
      D.importAll(dump).then(function () {
        Gallery.closeModal();
        Gallery.toast('הגיבוי שוחזר');
      }).catch(function (e) { Gallery.toast('השחזור נכשל: ' + e.message); });
    };
    reader.readAsText(file);
  }

  function wipeDemo() {
    if (isCloud()) {
      var typed = global.prompt('מחיקה בענן: הנתונים יימחקו בשני האייפדים (חנות וסדנה), ואי אפשר לבטל.\n' +
        'יימחקו: הזמנות, לקוחות, מלאי, מוצרים, מכירות, קבלות, הוצאות ורשימות ספקים.\n' +
        'יישארו: הגדרות החנות, שלושת הספקים וכללי התזכורות.\n\n' +
        'כדי לאשר, הקלידו את קוד החנות: ' + shopCode());
      if (typed == null) return;
      if (String(typed).trim().toLowerCase() !== shopCode()) { Gallery.toast('הקוד לא תואם. לא נמחק כלום.'); return; }
      D.wipeDemo().then(function () {
        Gallery.closeModal();
        Gallery.toast('הנתונים נמחקו בשני האייפדים. אפשר להתחיל לעבוד.');
      });
      return;
    }
    if (!global.confirm('למחוק את כל נתוני הדמו?\n\nיימחקו: הזמנות, לקוחות, מלאי, מוצרים, מכירות, קבלות, הוצאות ורשימות ספקים. המונים יתחילו מחדש.\nיישארו: הגדרות החנות, שלושת הספקים וכללי התזכורות.\n\nמומלץ להוריד גיבוי קודם.')) return;
    if (!global.confirm('בטוח? אי אפשר לבטל את זה (רק לשחזר מגיבוי).')) return;
    D.wipeDemo().then(function () {
      Gallery.closeModal();
      Gallery.toast('נתוני הדמו נמחקו. אפשר להתחיל לעבוד.');
    });
  }

  function migrate() {
    if (!isCloud()) return;
    if (!global.confirm('להעלות לענן את הנתונים שנשמרו במכשיר הזה במצב מקומי?\n\n' +
      'מתאים כשעבדתם על האייפד הזה בלי סנכרון ועכשיו מחברים אותו לחנות. רשומות שכבר קיימות בענן לא יידרסו.\n' +
      'הנתונים יופיעו גם באייפד השני.')) return;
    var b = B();
    Promise.resolve().then(function () { return b.migrateLocalToCloud(); }).then(function (out) {
      if (!out || !out.total) {
        Gallery.toast(out && out.skipped ? 'כל הנתונים המקומיים כבר נמצאים בענן (' + out.skipped + ' רשומות). לא הועבר כלום.' : 'לא נמצאו במכשיר הזה נתונים מקומיים להעברה.');
        return;
      }
      Gallery.closeModal();
      Gallery.toast('הועברו לענן ' + out.total + ' רשומות' + (out.skipped ? ' (' + out.skipped + ' כבר היו בענן ודולגו)' : '') + '.', { timeout: 6000 });
    }).catch(function (e) {
      Gallery.toast('ההעברה לא בוצעה: ' + (e && e.message ? e.message : 'שגיאה לא ידועה'), { timeout: 7000 });
    });
  }

  function syncSection() {
    var b = B();
    if (!b) return '';
    var cloud = isCloud();
    return section('סנכרון בין האייפדים', I.upload,
      '<dl class="set__facts"><dt>מצב</dt><dd>' + (cloud ? 'מסונכרן בענן (חנות וסדנה רואים אותם נתונים)' : 'מקומי: הנתונים נשמרים רק במכשיר הזה') + '</dd>' +
        (cloud ? '<dt>קוד חנות</dt><dd class="mono" dir="ltr">' + esc(shopCode()) + '</dd>' : '') + '</dl>' +
      '<div class="set__btns">' +
        (cloud
          ? '<button class="btn btn--secondary btn--lg" data-sync-change>החלף קוד חנות</button>' +
            '<button class="btn btn--secondary btn--lg" data-sync-migrate>' + I.upload + 'העלה את הנתונים המקומיים לענן</button>'
          : '<button class="btn btn--primary btn--lg" data-sync-change>חבר לסנכרון ענן</button>') +
      '</div>' +
      (cloud ? '<p class="field-note">"העלה את הנתונים המקומיים לענן" מיועד לפעם אחת: אחרי שעבדתם על המכשיר הזה במצב מקומי.</p>' : ''));
  }

  /* הצעה יומית (פעם ביום, במכשיר מנהל, רק אם יש אינטרנט) */
  function dailyPrompt() {
    if (Gallery.role !== 'admin') return;
    if (global.navigator && global.navigator.onLine === false) return;
    var s = D.settings.peek();
    if (s.lastBackupAt && U.isToday(s.lastBackupAt)) return;
    if (S.deviceGet('backupPromptDay') === todayKey()) return;
    S.deviceSet('backupPromptDay', todayKey());
    Gallery.toast('גיבוי יומי: עוד לא הורד גיבוי היום.', {
      actions: [
        { label: 'להוריד גיבוי עכשיו', primary: true, onClick: downloadBackup },
        { label: 'אחר כך' }
      ],
      timeout: 30000   // QA: הודעה קבועה הסתירה את כפתור "שמור ספירה" בספירת מלאי
    });
  }

  /* --------------------------------------------------------------- מסך הגדרות */
  function open() {
    var s = D.settings.peek();
    var node = Gallery.modalNode({
      title: I.gear + 'הגדרות וגיבוי',
      body:
        section('גיבוי', I.download,
          '<p class="set__note">גיבוי אחרון: <b>' + (s.lastBackupAt ? U.fmtDate(s.lastBackupAt) + ' ' + U.fmtTime(s.lastBackupAt) : 'עוד לא בוצע') + '</b></p>' +
          '<div class="set__btns">' +
            '<button class="btn btn--primary btn--lg" data-export>' + I.download + 'ייצוא גיבוי</button>' +
            '<label class="btn btn--secondary btn--lg set__file">' + I.upload + 'ייבוא גיבוי<input type="file" accept="application/json,.json" data-import hidden></label>' +
          '</div>' +
          '<p class="field-note">הגיבוי הוא קובץ אחד עם כל הנתונים. כדאי לשמור אותו גם בגוגל דרייב.</p>') +
        syncSection() +
        section('וואטסאפ', I.wa,
          '<div class="set__modes" role="radiogroup">' + WA_MODES.map(function (m) {
            return '<button type="button" class="set__mode" role="radio" data-wa="' + m.id + '" aria-checked="' + (s.whatsappMode === m.id) + '">' +
              '<b>' + esc(m.label) + '</b><small>' + esc(m.hint) + '</small></button>';
          }).join('') + '</div>') +
        section('פרטי החנות', I.store,
          '<div class="form-grid">' +
            field('שם', 'shop.name', s.shop.name) + field('טלפון', 'shop.phone', s.shop.phone) +
            field('כתובת', 'shop.address', s.shop.address, true) + field('עוסק מורשה', 'shop.vatId', s.shop.vatId) +
            field('שעות פתיחה', 'shop.hours', s.shop.hours, true) +
          '</div>') +
        section('מספור וקוד', I.lock,
          '<div class="form-grid">' +
            field('מספר ההזמנה הבא', 'nextOrder', D.orders.peekNextNumber(), false, 'number') +
            field('קוד מנהל (4 ספרות)', 'adminPin', s.adminPin, false, 'text') +
            field('ימים עד מסירה (ברירת מחדל)', 'slaDays', s.slaDays, false, 'number') +
          '</div>' +
          '<button class="btn btn--secondary" data-save-fields>' + I.check + 'שמירה</button>') +
        section('נתוני דמו', I.trash,
          (isCloud()
            ? '<p class="set__note"><b>שימו לב: המכשיר מחובר לענן.</b> הניקוי מוחק את הנתונים בשני האייפדים (חנות וסדנה), ודורש הקלדה של קוד החנות.</p>'
            : '<p class="set__note">לפני שמתחילים לעבוד באמת: מוחקים את נתוני הדמו.</p>') +
          '<div class="set__btns"><button class="btn btn--danger btn--lg" data-wipe>' + I.trash + (isCloud() ? 'מחק את כל הנתונים בשני האייפדים' : 'נקה נתוני דמו') + '</button>' +
          '<button class="btn btn--ghost" data-lock>' + I.lock + 'נעל את המכשיר הזה</button></div>'),
      foot: '<button class="btn btn--ghost" data-close>סגירה</button>'
    });
    node.classList.add('settings');

    node.addEventListener('click', function (e) {
      var t = e.target;
      if (t.closest('[data-export]')) { downloadBackup().then(function () { Gallery.closeModal(); }); return; }
      if (t.closest('[data-wipe]')) { wipeDemo(); return; }
      if (t.closest('[data-sync-migrate]')) { migrate(); return; }
      if (t.closest('[data-sync-change]')) {
        if (isCloud() && !global.confirm('להתנתק מהחנות במכשיר הזה ולהזין קוד אחר? הנתונים בענן לא נמחקים.')) return;
        B().askAgain(); return;
      }
      if (t.closest('[data-lock]')) { if (global.confirm('לנעול? בכניסה הבאה יידרש קוד מנהל.')) Gallery.lockAdmin(); return; }
      var m = t.closest('[data-wa]');
      if (m) {
        var mode = m.getAttribute('data-wa');
        D.settings.update({ whatsappMode: mode });
        Array.prototype.forEach.call(node.querySelectorAll('[data-wa]'), function (b) { b.setAttribute('aria-checked', String(b === m)); });
        return;
      }
      if (t.closest('[data-save-fields]')) saveFields(node);
    });
    node.querySelector('[data-import]').addEventListener('change', function (e) {
      if (e.target.files && e.target.files[0]) importBackup(e.target.files[0]);
      e.target.value = '';
    });

    Gallery.openModal(node, { wide: true, focus: false });
  }

  function section(title, icon, html) {
    return '<section class="set__sec"><h3 class="set__title">' + icon + esc(title) + '</h3>' + html + '</section>';
  }
  function field(label, key, val, wide, type) {
    var id = 'set-' + key.replace('.', '-');
    return '<div class="form-field' + (wide ? ' col-2' : '') + '"><label for="' + id + '">' + esc(label) + '</label>' +
      '<input id="' + id + '" data-set="' + esc(key) + '" type="' + (type || 'text') + '" value="' + esc(val == null ? '' : val) + '"></div>';
  }

  function saveFields(node) {
    var shop = {}, patch = {};
    var pinOk = true;
    Array.prototype.forEach.call(node.querySelectorAll('[data-set]'), function (el) {
      var k = el.getAttribute('data-set'), v = el.value.trim();
      if (k.indexOf('shop.') === 0) shop[k.slice(5)] = v;
      else if (k === 'adminPin') { if (/^\d{4}$/.test(v)) patch.adminPin = v; else pinOk = false; }
      else if (k === 'slaDays') patch.slaDays = Math.max(1, Number(v) || 10);
      else if (k === 'nextOrder') { var n = Math.round(Number(v)); if (n > 0 && n !== D.orders.peekNextNumber()) D.orders.setNextNumber(n); }
    });
    if (!pinOk) { Gallery.toast('קוד מנהל חייב להיות 4 ספרות'); return; }
    patch.shop = shop;
    D.settings.update(patch).then(function () { Gallery.toast('נשמר'); });
  }

  Gallery.openSettings = open;
  Gallery.backup = { download: downloadBackup, dailyPrompt: dailyPrompt };
  Gallery.onReady(function () { global.setTimeout(dailyPrompt, 1200); });

})(window);
