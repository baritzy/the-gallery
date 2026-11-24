/* =============================================================================
 * version.js  -  גרסת הפריסה + רישום ה-service worker (W4)
 * OWNER: integration (wave 4). נטען ראשון בכל HTML (index / admin / workshop).
 * -----------------------------------------------------------------------------
 * Gallery.VERSION הוא מקור האמת היחיד לגרסה:
 *  - טוענים דינמיים (inventory.js, data-firestore.js) מוסיפים ?v=Gallery.VERSION.
 *  - ה-service worker נרשם כ-sw.js?v=VERSION, ושם המטמון שלו נגזר מזה.
 * בפריסה: מעלים את המספר כאן, ובאותו מספר את כל ה-?v= ב-3 קובצי ה-HTML:
 *   sed -i '' 's/?v=27/?v=28/g' index.html admin.html workshop.html && sed -i '' "s/VERSION = '27'/VERSION = '28'/" js/version.js
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery = global.Gallery || {};
  var VERSION = '27';
  Gallery.VERSION = VERSION;

  /* PWA offline-first: network-first לקבצי האפליקציה, מטמון כשאין רשת (sw.js). */
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || /^(localhost|127\.0\.0\.1)$/.test(location.hostname))) {
    global.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js?v=' + VERSION).catch(function (e) {
        if (global.console) global.console.warn('[gallery] service worker not registered', e);
      });
    });
  }

})(window);
