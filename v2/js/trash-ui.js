/* =============================================================================
 * trash-ui.js  -  מחיקה בטוחה בכל האפליקציה + סל מחזור (R3). נטען בשני הדפים אחרי app.js.
 * -----------------------------------------------------------------------------
 * כלל אחד לכל מחיקה:
 *   1. חלון אישור "האם אתה בטוח שברצונך למחוק את X?" עם "מחק" אדום ו"ביטול".
 *   2. אחרי המחיקה: טוסט "נמחק · בטל" ל-10 שניות שמחזיר.
 *   3. הרשומה עוברת לסל המחזור (Gallery.data.trash), 30 יום.
 *
 * Gallery.confirmDelete({ label, detail?, title?, confirmLabel?, onDelete, onCancel?, undo? })
 *   onDelete() -> Promise<entry|undefined>. entry של סל המחזור = "בטל" משחזר ממנו.
 *   undo: false = בלי טוסט ביטול (למשל מחיקה לצמיתות). undo: fn = פונקציית ביטול משלך.
 *   חלון האישור נפתח מעל מודל פתוח (שכבה נפרדת), כך שכרטיס / טופס לא נסגרים.
 * Gallery.deleteRecord({ collection, id, label, detail?, onDone?, onCancel? })
 *   קיצור: אישור + Gallery.data.trash.move + טוסט ביטול.
 * Gallery.openTrash()   מסך סל המחזור (admin מתוך ההגדרות, סדנה מכפתור בסרגל).
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var D = Gallery.data;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;
  var UNDO_MS = 10000;

  var layer = null;

  function closeLayer() {
    if (!layer) return;
    global.removeEventListener('keydown', layer._onKey, true);
    layer.remove();
    layer = null;
  }

  function confirmDelete(o) {
    o = o || {};
    closeLayer();
    var label = String(o.label || 'הפריט');
    layer = document.createElement('div');
    layer.className = 'modal-backdrop cdel-layer';
    layer.innerHTML =
      '<div class="modal cdel" role="alertdialog" aria-modal="true" aria-labelledby="cdel-q">' +
        '<div class="modal__body cdel__body">' +
          '<div class="cdel__icon">' + I.trash + '</div>' +
          '<h2 class="cdel__q" id="cdel-q">' + esc(o.title || ('האם אתה בטוח שברצונך למחוק את ' + label + '?')) + '</h2>' +
          (o.detail ? '<p class="cdel__detail">' + esc(o.detail) + '</p>' : '') +
          (o.undo === false ? '' : '<p class="cdel__hint">אפשר לשחזר מסל המחזור עד 30 יום.</p>') +
        '</div>' +
        '<div class="modal__foot cdel__foot">' +
          '<button type="button" class="btn btn--danger-solid btn--lg cdel__yes" data-cdel-yes>' + I.trash + esc(o.confirmLabel || 'מחק') + '</button>' +
          '<button type="button" class="btn btn--ghost btn--lg" data-cdel-no>ביטול</button>' +
        '</div>' +
      '</div>';
    var busy = false;
    function cancel() { closeLayer(); if (o.onCancel) { try { o.onCancel(); } catch (e) {} } }
    layer._onKey = function (e) {
      if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); cancel(); }
    };
    global.addEventListener('keydown', layer._onKey, true);
    layer.addEventListener('mousedown', function (e) { if (e.target === layer) cancel(); });
    layer.querySelector('[data-cdel-no]').addEventListener('click', cancel);
    layer.querySelector('[data-cdel-yes]').addEventListener('click', function () {
      if (busy) return;
      busy = true;
      this.disabled = true;
      Promise.resolve().then(function () { return o.onDelete ? o.onDelete() : null; }).then(function (entry) {
        closeLayer();
        if (o.undo === false) return;
        var undoFn = typeof o.undo === 'function' ? o.undo : (entry && entry.id ? function () { return restore(entry.id); } : null);
        Gallery.toast('נמחק: ' + label, {
          actions: undoFn ? [{ label: 'בטל', primary: true, onClick: undoFn }] : [],
          timeout: UNDO_MS
        });
      }).catch(function (err) {
        closeLayer();
        Gallery.toast('המחיקה נכשלה: ' + (err && err.message ? err.message : 'שגיאה'));
      });
    });
    document.body.appendChild(layer);
    try { layer.querySelector('[data-cdel-no]').focus({ preventScroll: true }); } catch (e) {}
    return layer;
  }

  function restore(trashId) {
    return D.trash.restore(trashId).then(function (res) {
      if (res && res.ok) Gallery.toast('שוחזר: ' + (res.entry.label || ''), { timeout: 3500 });
      else Gallery.toast((res && res.reason) || 'השחזור נכשל', { timeout: 5000 });
      return res;
    });
  }

  function deleteRecord(o) {
    return confirmDelete({
      label: o.label, detail: o.detail, onCancel: o.onCancel,
      onDelete: function () {
        return D.trash.move(o.collection, o.id, o.label).then(function (entry) {
          if (o.onDone) { try { o.onDone(entry); } catch (e) {} }
          return entry;
        });
      }
    });
  }

  /* ---------------------------------------------------------------- סל מחזור */
  function openTrash() {
    var node = Gallery.modalNode({
      title: I.trash + 'סל מחזור',
      body: '<p class="trash__note">פריטים שנמחקו נשמרים כאן ' + D.trash.DAYS + ' יום ואז נמחקים לצמיתות.' +
        (Gallery.role === 'workshop' ? ' בסדנה מוצגים רק פריטים שאפשר למחוק בסדנה.' : '') + '</p>' +
        '<div data-trash-list></div>',
      foot: '<button class="btn btn--ghost btn--lg" data-close>סגירה</button>'
    });
    node.classList.add('trash');
    var listEl = node.querySelector('[data-trash-list]');
    function render() {
      var items = D.trash.visible();
      listEl.innerHTML = items.length ? '<ul class="trash__list">' + items.map(function (e) {
        return '<li class="trash__row" data-tid="' + esc(e.id) + '">' +
          '<div class="trash__main"><b class="trash__label">' + esc(e.label || '') + '</b>' +
            '<span class="trash__meta"><span class="pill is-grey">' + esc(D.trash.typeLabel(e)) + '</span>' +
            '<span>נמחק ' + esc(U.fmtDate(e.deletedAt)) + ' ' + esc(U.fmtTime(e.deletedAt)) + '</span></span></div>' +
          '<div class="trash__acts">' +
            '<button type="button" class="btn btn--primary" data-restore>' + I.check + 'שחזר</button>' +
            '<button type="button" class="btn btn--danger" data-purge>' + I.trash + 'מחק לצמיתות</button>' +
          '</div></li>';
      }).join('') + '</ul>' : '<div class="empty">' + I.trash + '<h3>סל המחזור ריק</h3><p>כל מה שיימחק יופיע כאן ויהיה אפשר לשחזר אותו.</p></div>';
    }
    listEl.addEventListener('click', function (ev) {
      var row = ev.target.closest('[data-tid]');
      if (!row) return;
      var id = row.getAttribute('data-tid');
      var e = D.trash.peekOne(id);
      if (!e || !D.trash.canHandle(e)) return;
      if (ev.target.closest('[data-restore]')) { restore(id); return; }
      if (ev.target.closest('[data-purge]')) {
        confirmDelete({
          title: 'למחוק לצמיתות את ' + (e.label || 'הפריט') + '?',
          detail: 'אחרי זה אי אפשר לשחזר.',
          confirmLabel: 'מחק לצמיתות', undo: false,
          onDelete: function () { return D.trash.purge(id).then(function () { Gallery.toast('נמחק לצמיתות'); }); }
        });
      }
    });
    var unsub = D.trash.subscribe(render);
    render();
    Gallery.openModal(node, { wide: true, focus: false, onClose: function () { if (unsub) unsub(); } });
    return node;
  }

  Gallery.confirmDelete = confirmDelete;
  Gallery.deleteRecord = deleteRecord;
  Gallery.openTrash = openTrash;
  Gallery.restoreFromTrash = restore;

})(window);
