/* =============================================================================
 * orders-form.js  -  טופס הזמנה חדשה / עריכה, בסגנון דף ההזמנה של החנות
 * OWNER: foundation (wave 2).
 * C8 / D11: מינימלי, בהשראת פנקס "הגלריה": כותרת עם לוגו ופרטי החנות, מספר
 * הזמנה בולט, פרטי לקוח, ואז טבלת תמונות באותן עמודות של טבלת העבודה.
 * כל השדות ניתנים לעריכה. מועד מסירה ברירת מחדל: היום + 10.
 * חושף: Gallery.OrdersForm.open(orderId | null)
 * ========================================================================== */

(function (global) {
  'use strict';

  var Gallery = global.Gallery;
  var U = Gallery.util;
  var I = Gallery.icons;
  var esc = U.esc;
  var D = Gallery.data;

  function open(orderId) {
    var existing = orderId ? D.orders.peekOne(orderId) : null;
    var s = D.settings.peek();
    var shop = s.shop;
    var cust = existing ? (D.customers.peekOne(existing.customerId) || {}) : {};
    var number = existing ? existing.number : D.orders.peekNextNumber();
    var due = existing ? existing.dueDate : new Date(Date.now() + (s.slaDays || 10) * 86400000).toISOString();
    var items = existing ? existing.items.map(function (x) { return Object.assign({}, x); }) : [D.orders.newItem()];
    var editMode = !!existing;

    var node = document.createElement('div');
    node.className = 'modal paper';
    node.setAttribute('role', 'dialog');
    node.setAttribute('aria-modal', 'true');
    node.innerHTML =
      '<div class="paper__head">' +
        '<div class="paper__shop">' +
          '<img class="paper__logo" src="assets/logo.png?v=' + Gallery.VERSION + '" alt="">' +
          '<div><div class="paper__name">' + esc(shop.name) + '</div>' +
          '<div class="paper__line">' + esc(shop.address) + '</div>' +
          '<div class="paper__line">טלפקס ' + esc(shop.phone) + ' · עוסק מורשה ' + esc(shop.vatId) + '</div></div>' +
        '</div>' +
        '<div class="paper__no"><span>' + (editMode ? 'עריכת הזמנה' : 'הזמנה מס\'') + '</span><b>' + esc(number) + '</b>' +
          '<small>' + U.fmtDate(existing ? existing.createdAt : new Date().toISOString()) + '</small></div>' +
        '<button class="modal__close" data-close aria-label="סגירה">×</button>' +
      '</div>' +
      '<div class="modal__body paper__body">' +
        '<div class="paper__row">' +
          '<div class="form-field"><label for="of-phone">טלפון</label>' +
            '<input id="of-phone" data-f="phone" type="tel" inputmode="tel" autocomplete="off" list="of-phones" value="' + esc(cust.phone || '') + '"></div>' +
          '<div class="form-field"><label for="of-name">שם הלקוח</label>' +
            '<input id="of-name" data-f="name" type="text" autocomplete="off" value="' + esc(cust.name || '') + '"></div>' +
          '<div class="paper__known" data-known></div>' +
        '</div>' +
        '<datalist id="of-phones">' + D.customers.peek().map(function (c) {
          return '<option value="' + esc(c.phone) + '">' + esc(c.name) + '</option>';
        }).join('') + '</datalist>' +
        '<datalist id="of-skus">' + D.frames.peek().map(function (f) {
          return '<option value="' + esc(f.sku) + '">' + esc((f.woodType || '') + ' ' + (f.color || '')) + '</option>';
        }).join('') + '</datalist>' +

        '<div class="paper__items">' +
          '<div class="tablewrap"><table class="wtable wtable--form">' +
            '<thead><tr><th>מס\' תמונה</th><th>הדבקה</th><th>מט</th><th>תיאור תמונה</th>' +
              (editMode ? '<th>חומר</th>' : '') +
              '<th>מידות (רוחב × גובה)</th><th>סוג מסגרת</th>' + (editMode ? '<th>בוצע</th>' : '') + '<th>הערות</th><th></th></tr></thead>' +
            '<tbody data-items></tbody></table></div>' +
          '<button type="button" class="btn btn--secondary btn--lg" data-add>' + I.plus + 'הוסף תמונה</button>' +
        '</div>' +

        '<div class="paper__row paper__row--bottom">' +
          '<div class="form-field"><label for="of-due">מועד מסירה</label>' +
            '<input id="of-due" data-f="due" type="date" value="' + U.toDateInput(due) + '"></div>' +
          '<div class="form-field"><label for="of-price">מחיר (₪)</label>' +
            '<input id="of-price" data-f="price" type="number" inputmode="numeric" min="0" step="1" value="' + esc(existing ? existing.price : '') + '"></div>' +
          (editMode ? '' :
          '<div class="form-field"><label for="of-dep">מקדמה עכשיו (₪)</label>' +
            '<input id="of-dep" data-f="deposit" type="number" inputmode="numeric" min="0" step="1" placeholder="לא חובה"></div>') +
        '</div>' +
        '<div class="form-field"><label for="of-notes">הערות</label>' +
          '<textarea id="of-notes" data-f="notes" rows="2">' + esc(existing ? existing.notes : '') + '</textarea></div>' +
      '</div>' +
      '<div class="modal__foot">' +
        '<button class="btn btn--primary btn--lg" data-save>' + I.check + (editMode ? 'שמירת שינויים' : 'פתיחת הזמנה') + '</button>' +
        '<button class="btn btn--ghost" data-close>ביטול</button>' +
      '</div>';

    var tbody = node.querySelector('[data-items]');

    function rowHTML(it, i) {
      var label = (i + 1) + '-' + items.length;
      return '<tr data-row="' + i + '">' +
        '<td class="mono c">' + label + '</td>' +
        '<td class="c"><label class="bigcheck"><input type="checkbox" data-k="mount"' + (it.mount ? ' checked' : '') + ' aria-label="הדבקה"><span></span></label></td>' +
        '<td class="c"><label class="bigcheck"><input type="checkbox" data-k="mat"' + (it.mat ? ' checked' : '') + ' aria-label="מט"><span></span></label></td>' +
        '<td><input type="text" data-k="desc" value="' + esc(it.desc) + '" placeholder="למשל: צילום משפחתי" aria-label="תיאור תמונה"></td>' +
        (editMode ? '<td><select data-k="material" aria-label="חומר"><option value="">·</option>' +
          '<option value="V"' + (it.material === 'V' ? ' selected' : '') + '>V</option>' +
          '<option value="X"' + (it.material === 'X' ? ' selected' : '') + '>X</option></select></td>' : '') +
        '<td><div class="dims"><input type="number" inputmode="decimal" data-k="widthCm" value="' + esc(it.widthCm == null ? '' : it.widthCm) + '" aria-label="רוחב">' +
          '<span>×</span><input type="number" inputmode="decimal" data-k="heightCm" value="' + esc(it.heightCm == null ? '' : it.heightCm) + '" aria-label="גובה"></div></td>' +
        '<td><input type="text" data-k="profileSku" list="of-skus" value="' + esc(it.profileSku) + '" aria-label="סוג מסגרת" class="mono"></td>' +
        (editMode ? '<td class="c"><label class="bigcheck"><input type="checkbox" data-k="done"' + (it.done ? ' checked' : '') + ' aria-label="בוצע"><span></span></label></td>' : '') +
        '<td><input type="text" data-k="note" value="' + esc(it.note) + '" aria-label="הערות"></td>' +
        '<td class="c">' + (items.length > 1 ? '<button type="button" class="iconbtn" data-del="' + i + '" aria-label="מחיקת שורה">' + I.trash + '</button>' : '') + '</td>' +
      '</tr>';
    }
    function renderItems() { tbody.innerHTML = items.map(rowHTML).join(''); }
    renderItems();

    tbody.addEventListener('input', readRow);
    tbody.addEventListener('change', readRow);
    function readRow(e) {
      var tr = e.target.closest('[data-row]');
      var k = e.target.getAttribute('data-k');
      if (!tr || !k) return;
      var it = items[Number(tr.getAttribute('data-row'))];
      if (e.target.type === 'checkbox') it[k] = e.target.checked;
      else if (k === 'widthCm' || k === 'heightCm') it[k] = e.target.value === '' ? null : Number(e.target.value);
      else if (k === 'material') it[k] = e.target.value || null;
      else it[k] = e.target.value;
    }
    tbody.addEventListener('click', function (e) {
      var d = e.target.closest('[data-del]');
      if (!d) return;
      var idx = Number(d.getAttribute('data-del'));
      var gone = items[idx];
      if (!gone) return;
      var lbl = 'תמונה ' + (idx + 1) + (gone.desc ? ' "' + gone.desc + '"' : '');
      /* R3: אישור + ביטול. השורה בטופס עד השמירה, אז הביטול מחזיר אותה לטופס (כל עוד הוא פתוח). */
      Gallery.confirmDelete({
        label: lbl, detail: 'השורה תימחק מההזמנה כשתשמרו את הטופס.',
        onDelete: function () { var i = items.indexOf(gone); if (i !== -1) items.splice(i, 1); renderItems(); return null; },
        undo: function () {
          if (!document.body.contains(tbody) || items.indexOf(gone) !== -1) { Gallery.toast('הטופס כבר נסגר. אפשר להוסיף את השורה מחדש.'); return; }
          items.splice(Math.min(idx, items.length), 0, gone); renderItems();
        }
      });
    });
    node.querySelector('[data-add]').addEventListener('click', function () {
      var prev = items[items.length - 1] || {};
      items.push(D.orders.newItem({ profileSku: prev.profileSku || '', mat: !!prev.mat, mount: !!prev.mount }));
      renderItems();
      var last = tbody.querySelector('tr:last-child [data-k="desc"]');
      if (last) last.focus();
    });

    /* לקוח קיים לפי טלפון */
    var phoneEl = node.querySelector('[data-f="phone"]');
    var nameEl = node.querySelector('[data-f="name"]');
    var knownEl = node.querySelector('[data-known]');
    function checkKnown() {
      var c = D.customers.findByPhone(phoneEl.value);
      if (c && (!existing || c.id !== existing.customerId)) {
        if (!nameEl.value.trim()) nameEl.value = c.name;
        var n = D.customers.visitCount(c.id);
        var tone = U.visitTone(n + 1);
        knownEl.innerHTML = '<span class="known' + (tone ? ' tone-' + tone : '') + '">לקוח קיים · ' + U.plural(n, 'ביקור אחד', 'ביקורים') + ' עד היום</span>';
      } else knownEl.innerHTML = '';
    }
    phoneEl.addEventListener('change', checkKnown);
    phoneEl.addEventListener('blur', checkKnown);

    node.querySelector('[data-save]').addEventListener('click', function () { save(); });

    function val(f) { var el = node.querySelector('[data-f="' + f + '"]'); return el ? el.value.trim() : ''; }

    var saving = false;   // QA: הקשה כפולה לא פותחת שתי הזמנות (בענן המספר מגיע מטרנזקציה)
    function save() {
      if (saving) return;
      var name = val('name'), phone = val('phone');
      if (!name && !phone) { nameEl.focus(); Gallery.toast('צריך שם או טלפון של הלקוח'); return; }
      var clean = items.filter(function (it) { return it.desc || it.widthCm || it.heightCm || it.note; });
      if (!clean.length) { Gallery.toast('צריך לפחות תמונה אחת'); return; }
      var price = Number(val('price')) || 0;
      var deposit = Math.round(Number(val('deposit')) || 0);
      var dueIso = U.fromDateInput(val('due')) || due;
      if (price < 0) { node.querySelector('[data-f="price"]').focus(); Gallery.toast('המחיר לא יכול להיות שלילי'); return; }
      saving = true;
      var saveBtn = node.querySelector('[data-save]');
      if (saveBtn) saveBtn.disabled = true;

      // טלפון של לקוח קיים = מקשרים אליו. אחרת בעריכה מעדכנים את הלקוח של ההזמנה, ובחדשה יוצרים לקוח.
      var match = D.customers.findByPhone(phone);
      var payload = match ? { id: match.id, name: name || match.name, phone: phone } :
        (existing && cust.id ? { id: cust.id, name: name, phone: phone } : { name: name, phone: phone });
      D.customers.upsert(payload)
        .then(function (c) {
          if (existing) {
            var o = D.orders.peekOne(existing.id) || existing;
            var doneBefore = (o.items || []).map(function (x) { return x.id + ':' + !!x.done; }).join('|');
            o.customerId = c.id; o.items = D.orders.reindex(clean); o.price = price;
            o.dueDate = dueIso; o.notes = val('notes');
            var doneAfter = o.items.map(function (x) { return x.id + ':' + !!x.done; }).join('|');
            // סטטוס נגזר מחדש רק אם סימוני "בוצע" השתנו בטופס
            if (doneBefore !== doneAfter && o.status !== 'delivered') {
              /* סבב 5: מוכנה נשארת מוכנה, אלא אם בוטל "בוצע" בשורה (חוזרת לבעבודה) */
              var unticked = doneBefore.split('|').some(function (k) { return /:true$/.test(k) && doneAfter.split('|').indexOf(k.replace(/:true$/, ':false')) !== -1; });
              if (o.status === 'ready' && unticked) { o.status = 'in_progress'; o.readyAt = null; }
              else o.status = D.orders.deriveStatus(o);
            }
            return D.orders.save(o);
          }
          return D.orders.create({ customerId: c.id, items: clean, price: price, dueDate: dueIso, notes: val('notes') });
        })
        .then(function (o) {
          if (!existing && deposit > 0) { Gallery.OrdersPay.payNow(o.id, { amount: deposit, type: 'deposit' }); return; }
          if (!existing) { createdStep(o); return; }
          Gallery.closeModal();
        })
        .catch(function (err) {
          saving = false;
          if (saveBtn) saveBtn.disabled = false;
          Gallery.toast('השמירה נכשלה: ' + (err && err.message ? err.message : err));
        });
    }

    Gallery.openModal(node, { xwide: true, sticky: true, onClose: existing ? function () { global.setTimeout(function () { Gallery.openOrder(existing.id); }, 0); } : null });
    if (!existing) nameEl.focus();
  }

  /* אחרי פתיחת הזמנה בלי מקדמה: הצעה לשלוח עותק ללקוח (C11) */
  function createdStep(o) {
    var c = D.customers.peekOne(o.customerId) || {};
    var node = Gallery.modalNode({
      title: I.check + 'הזמנה ' + esc(o.number) + ' נפתחה',
      body: '<div class="created-num">' + esc(o.number) + '</div><p class="field-note" style="text-align:center">ההזמנה מופיעה עכשיו גם בטבלת העבודה בסדנה.</p>',
      foot: '<button class="btn btn--wa btn--lg" data-send>' + I.wa + 'שלח עותק ללקוח</button>' +
        '<button class="btn btn--secondary" data-open>פתח את ההזמנה</button>' +
        '<button class="btn btn--ghost" data-close>סיום</button>'
    });
    node.querySelector('[data-send]').addEventListener('click', function (e) {
      Gallery.whatsapp(c.phone, U.msgOrderCopy(o));
      e.currentTarget.classList.add('is-ok');
      e.currentTarget.innerHTML = I.check + 'נשלח';
    });
    node.querySelector('[data-open]').addEventListener('click', function () { Gallery.openOrder(o.id); });
    Gallery.openModal(node, { focus: false });
  }

  Gallery.OrdersForm = { open: open };

})(window);
