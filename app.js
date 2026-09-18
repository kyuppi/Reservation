(function () {
  'use strict';

  const state = { settings: {}, menus: [], holidays: [] };
  const $ = (id) => document.getElementById(id);
  const yen = (n) => '¥' + Number(n || 0).toLocaleString('ja-JP');
  const escapeHtml = (s) => String(s ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));

  function showMessage(text, type) {
    const box = $('message');
    box.textContent = text;
    box.className = 'message ' + (type || 'error');
    box.hidden = false;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function hideLoading() { $('loading').style.display = 'none'; }

  function isHoliday(date) { return state.holidays.some((h) => h.date === date); }

  function makeMenuCard(menu) {
    const toppings = Array.isArray(menu.toppings) ? menu.toppings : [];
    const toppingHtml = toppings.length ? `
      <div class="toppings">
        <p class="topping-title">トッピング（任意）</p>
        <div class="topping-list">
          ${toppings.map((t) => `<label class="check-row"><input type="checkbox" class="topping-check" data-menu-id="${escapeHtml(menu.id)}" data-price="${Number(t.price)||0}" value="${escapeHtml(t.name)}"><span>${escapeHtml(t.name)}${Number(t.price) ? ' +' + yen(t.price) : ''}</span></label>`).join('')}
        </div>
      </div>` : '';
    return `<article class="menu-item" data-menu-id="${escapeHtml(menu.id)}">
      <div class="menu-top"><div><h3 class="menu-name">${escapeHtml(menu.name)}</h3><p class="menu-desc">${escapeHtml(menu.description || '')}</p></div><div class="menu-price">${yen(menu.price)}</div></div>
      ${toppingHtml}
      <div class="quantity-row"><span class="out-badge">${menu.soldOut ? '売り切れ' : '注文数量'}</span>${menu.soldOut ? '' : `<div class="stepper"><button type="button" class="qty-minus" aria-label="減らす">−</button><span class="qty-value">0</span><button type="button" class="qty-plus" aria-label="増やす">＋</button></div>`}</div>
    </article>`;
  }

  function renderMenus() {
    const available = state.menus.filter((m) => !m.soldOut);
    $('menuList').innerHTML = state.menus.map(makeMenuCard).join('');
    $('emptyMenu').hidden = available.length > 0;
  }

  function getOrder() {
    const items = [];
    document.querySelectorAll('.menu-item').forEach((card) => {
      const id = card.dataset.menuId;
      const menu = state.menus.find((m) => String(m.id) === String(id));
      const q = Number(card.querySelector('.qty-value')?.textContent || 0);
      if (!menu || q <= 0) return;
      const selectedToppings = Array.from(card.querySelectorAll('.topping-check:checked')).map((el) => ({ name: el.value, price: Number(el.dataset.price || 0) }));
      items.push({ menuId: menu.id, name: menu.name, quantity: q, unitPrice: Number(menu.price || 0), toppings: selectedToppings });
    });
    return items;
  }

  function calcTotal(items) { return items.reduce((sum, item) => sum + item.quantity * (item.unitPrice + item.toppings.reduce((s,t) => s + Number(t.price || 0),0)), 0); }

  function renderSummary() {
    const items = getOrder();
    const orderText = items.length ? items.map((i) => `${i.name} × ${i.quantity}${i.toppings.length ? '（' + i.toppings.map(t => t.name).join('、') + '）' : ''}`).join('\n') : 'メニュー未選択';
    const contact = [$('phone').value.trim(), $('email').value.trim()].filter(Boolean).join(' / ') || '未入力';
    $('orderTotal').textContent = yen(calcTotal(items));
    $('summary').innerHTML = `<div class="summary-line"><span>来店日時</span><strong>${escapeHtml($('visitDate').value || '未選択')} ${escapeHtml($('visitTime').value || '未選択')}</strong></div><div class="summary-line"><span>お名前</span><strong>${escapeHtml($('customerName').value.trim() || '未入力')}</strong></div><div class="summary-line"><span>人数</span><strong>${Number($('guests').value || 0)}名</strong></div><div class="summary-line"><span>連絡先</span><strong>${escapeHtml(contact)}</strong></div><div class="summary-line"><span>注文内容</span><strong class="summary-order">${escapeHtml(orderText)}</strong></div><div class="summary-line"><span>合計</span><strong>${yen(calcTotal(items))}</strong></div>`;
  }

  function clearOrSetHolidayHint() {
    const date = $('visitDate').value;
    const holiday = state.holidays.find((h) => h.date === date);
    if (holiday) {
      $('holidayHint').textContent = `この日は臨時休業です${holiday.reason ? '：' + holiday.reason : ''}。別の日を選択してください。`;
      $('holidayHint').hidden = false;
    } else $('holidayHint').hidden = true;
  }

  async function load() {
    try {
      const data = await AppApi.request('getPublicData');
      state.settings = data.settings || {};
      state.menus = data.menus || [];
      state.holidays = data.holidays || [];
      const name = state.settings.storeName || '店舗予約';
      $('storeName').textContent = name;
      $('footerStoreName').textContent = name;
      $('year').textContent = new Date().getFullYear();
      if (state.settings.backgroundUrl) $('hero').style.backgroundImage = `url("${state.settings.backgroundUrl.replace(/"/g,'%22')}")`;
      renderMenus();
      renderSummary();
      hideLoading();
    } catch (error) {
      hideLoading();
      showMessage(error.message || '予約画面の読み込みに失敗しました。', 'error');
    }
  }

  async function submitReservation() {
    const visitDate = $('visitDate').value;
    const visitTime = $('visitTime').value;
    const name = $('customerName').value.trim();
    const guests = Number($('guests').value);
    const phone = $('phone').value.trim();
    const email = $('email').value.trim();
    const order = getOrder();
    if (!visitDate || !visitTime || !name || !guests || (!phone && !email) || !order.length) {
      showMessage('必須項目を入力し、メニューを1つ以上選択してください。連絡先は電話番号かメールアドレスのどちらかを入力してください。', 'error');
      return;
    }
    if (isHoliday(visitDate)) {
      showMessage('選択した日は臨時休業日です。別の日を選択してください。', 'error');
      return;
    }
    const button = $('reserveButton');
    button.disabled = true;
    button.textContent = '送信中…';
    try {
      const data = await AppApi.request('createReservation', {
        visitDate, visitTime, name, guests, phone, email,
        orderJson: JSON.stringify(order),
        total: calcTotal(order)
      });
      $('successText').textContent = `予約番号：${data.reservationId} ／ ${visitDate} ${visitTime} のご予約を受け付けました。`;
      $('successModal').hidden = false;
      $('successModal').setAttribute('aria-hidden', 'false');
      button.disabled = false;
      button.textContent = 'この内容で予約する';
    } catch (error) {
      showMessage(error.message || '予約の送信に失敗しました。', 'error');
      button.disabled = false;
      button.textContent = 'この内容で予約する';
    }
  }

  document.addEventListener('click', (event) => {
    const plus = event.target.closest('.qty-plus');
    const minus = event.target.closest('.qty-minus');
    if (plus) { const v = plus.parentElement.querySelector('.qty-value'); v.textContent = Math.min(99, Number(v.textContent) + 1); renderSummary(); }
    if (minus) { const v = minus.parentElement.querySelector('.qty-value'); v.textContent = Math.max(0, Number(v.textContent) - 1); renderSummary(); }
  });
  document.addEventListener('change', (event) => {
    if (event.target.matches('.topping-check, #visitDate, #visitTime, #customerName, #guests, #phone, #email')) renderSummary();
    if (event.target.id === 'visitDate') clearOrSetHolidayHint();
  });
  $('reserveButton').addEventListener('click', submitReservation);
  $('closeSuccess').addEventListener('click', () => {
    $('successModal').hidden = true;
    $('successModal').setAttribute('aria-hidden', 'true');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
  load();
})();
