(function () {
  'use strict';
  const state = { settings: {}, menus: [], holidays: [], reservations: [], sessionToken: sessionStorage.getItem('admin_session') || '' };
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s ?? '').replace(/[&<>'"]/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const yen = (n) => '¥' + Number(n || 0).toLocaleString('ja-JP');

  function toast(text, kind) {
    const el = $('toast'); el.textContent = text; el.hidden = false; el.style.background = kind === 'error' ? '#991b1b' : '#111827';
    clearTimeout(toast.timer); toast.timer = setTimeout(() => { el.hidden = true; }, 3200);
  }
  function showLogin() { $('loginView').style.display='grid'; $('adminApp').hidden=true; }
  function showApp() { $('loginView').style.display='none'; $('adminApp').hidden=false; }

  async function call(action, params = {}) {
    return AppApi.request(action, { ...params, token: state.sessionToken });
  }

  async function login() {
    const password = $('loginPassword').value;
    if (!password) return toast('パスワードを入力してください。','error');
    try {
      const hash = await AppApi.hashPassword(password);
      const data = await AppApi.request('adminLogin', { passwordHash: hash });
      state.sessionToken = data.token;
      sessionStorage.setItem('admin_session', state.sessionToken);
      showApp();
      await loadAll();
      $('loginPassword').value = '';
    } catch (e) { toast(e.message || 'ログインに失敗しました。','error'); }
  }
  function logout() { state.sessionToken=''; sessionStorage.removeItem('admin_session'); showLogin(); }

  async function loadAll() {
    try {
      const data = await call('getAdminData');
      Object.assign(state, data);
      renderAll();
    } catch (e) {
      if (/認証|セッション/.test(e.message)) logout();
      else toast(e.message || '管理データを取得できませんでした。','error');
    }
  }

  function renderAll() {
    const name = state.settings.storeName || '店舗予約';
    $('adminStoreName').textContent = name; $('mobileStoreName').textContent = name;
    $('statMenus').textContent = state.menus.length;
    $('statHolidays').textContent = state.holidays.length;
    $('statTotal').textContent = state.reservations.length;
    const today = new Date().toISOString().slice(0,10);
    $('statToday').textContent = state.reservations.filter(r => r.visitDate === today && r.status !== 'cancelled').length;
    renderRecent(); renderSettingsPreview(); renderReservations(); renderMenus(); renderToppings(); renderHolidays(); fillSettingsForm();
  }

  function renderRecent() {
    const rows = state.reservations.slice().sort((a,b) => String(b.createdAt).localeCompare(String(a.createdAt))).slice(0,6);
    $('recentReservations').innerHTML = rows.length ? rows.map(r => `<div class="mini-row"><div><strong>${esc(r.visitDate)} ${esc(r.visitTime)}</strong><span>${esc(r.name)} / ${esc(r.guests)}名</span></div><strong>${esc(r.status === 'cancelled' ? 'キャンセル' : '受付済み')}</strong></div>`).join('') : '<div class="empty-state-admin">予約はまだありません。</div>';
  }
  function renderSettingsPreview() {
    $('dashboardSettings').innerHTML = `<div class="preview-row"><span>店舗名</span><strong>${esc(state.settings.storeName || '')}</strong></div><div class="preview-row"><span>通知先</span><strong>${esc(state.settings.notifyEmail || '未設定')}</strong></div><div class="preview-row"><span>背景画像</span><strong>${state.settings.backgroundUrl ? '設定済み' : '未設定'}</strong></div>`;
  }

  function renderReservations() {
    let rows = state.reservations.slice().sort((a,b) => (a.visitDate+a.visitTime).localeCompare(b.visitDate+b.visitTime));
    const d = $('reservationDateFilter').value, s = $('reservationStatusFilter').value;
    if (d) rows = rows.filter(r => r.visitDate === d);
    if (s) rows = rows.filter(r => r.status === s);
    if (!rows.length) { $('reservationTable').innerHTML = '<div class="empty-state-admin">該当する予約がありません。</div>'; return; }
    $('reservationTable').innerHTML = `<table class="admin-table"><thead><tr><th>ご来店日時</th><th>お名前</th><th>人数</th><th>予約した時間</th><th>電話番号</th><th>メール</th><th>注文内容</th><th>合計</th><th>状態</th><th></th></tr></thead><tbody>${rows.map(r => `<tr><td><strong>${esc(r.visitDate)} ${esc(r.visitTime)}</strong></td><td>${esc(r.name)}</td><td>${esc(r.guests)}名</td><td>${esc(r.createdAt)}</td><td>${esc(r.phone || '—')}</td><td>${esc(r.email || '—')}</td><td>${esc(formatOrder(r.order))}</td><td>${yen(r.total)}</td><td><span class="status-badge ${esc(r.status)}">${r.status === 'cancelled' ? 'キャンセル' : '受付済み'}</span></td><td>${r.status === 'cancelled' ? '' : `<button class="small-btn danger cancel-reservation" data-id="${esc(r.id)}">キャンセル</button>`}</td></tr>`).join('')}</tbody></table>`;
  }
  function formatOrder(order) {
    if (!Array.isArray(order)) return '';
    return order.map(i => `${i.name}×${i.quantity}${Array.isArray(i.toppings)&&i.toppings.length ? '（'+i.toppings.map(t=>t.name).join('、')+'）' : ''}`).join(' / ');
  }

  function renderMenus() {
    $('menuAdminList').innerHTML = state.menus.length ? state.menus.map(m => `<div class="item-card"><div class="item-main"><h3>${esc(m.name)}</h3><div class="item-meta">${yen(m.price)}${m.description ? ' ・ ' + esc(m.description) : ''} ・ ${m.toppings?.length || 0}個のトッピング ${m.soldOut ? ' ・ <span class="sold-out">売り切れ</span>' : ''}</div></div><div class="item-actions"><button class="small-btn edit-menu" data-id="${esc(m.id)}">編集</button><button class="small-btn ${m.soldOut ? '' : 'danger'} toggle-soldout" data-id="${esc(m.id)}">${m.soldOut ? '販売に戻す' : '売り切れにする'}</button><button class="small-btn danger delete-menu" data-id="${esc(m.id)}">削除</button></div></div>`).join('') : '<div class="empty-state-admin">メニューがありません。「メニュー追加」から登録してください。</div>';
  }

  function renderToppings() {
    const withToppings = state.menus.filter(m => Array.isArray(m.toppings) && m.toppings.length);
    $('toppingAdminList').innerHTML = withToppings.length ? withToppings.map(m => `<div class="item-card"><div class="item-main"><h3>${esc(m.name)}</h3><div class="item-meta">${m.toppings.map(t => `${esc(t.name)} ${Number(t.price) ? '+'+yen(t.price) : '無料'}`).join(' / ')}</div></div><div class="item-actions"><button class="small-btn edit-menu" data-id="${esc(m.id)}">トッピング編集</button></div></div>`).join('') : '<div class="empty-state-admin">トッピングはまだありません。メニュー編集から追加してください。</div>';
  }

  function renderHolidays() {
    const rows = state.holidays.slice().sort((a,b) => String(a.date).localeCompare(String(b.date)));
    $('holidayList').innerHTML = rows.length ? rows.map(h => `<div class="item-card"><div class="item-main"><h3>${esc(h.date)}</h3><div class="item-meta">${esc(h.reason || '臨時休業')}</div></div><div class="item-actions"><button class="small-btn danger delete-holiday" data-date="${esc(h.date)}">削除</button></div></div>`).join('') : '<div class="empty-state-admin">臨時休業日はありません。</div>';
  }

  function fillSettingsForm() {
    $('settingStoreName').value = state.settings.storeName || '';
    $('settingBackgroundUrl').value = state.settings.backgroundUrl || '';
    $('settingNotifyEmail').value = state.settings.notifyEmail || '';
  }

  function openMenuModal(id) {
    const menu = state.menus.find(m => String(m.id) === String(id));
    $('menuModalTitle').textContent = menu ? 'メニュー編集' : 'メニュー追加';
    $('menuId').value = menu?.id || '';
    $('menuName').value = menu?.name || '';
    $('menuPrice').value = menu?.price ?? '';
    $('menuDescription').value = menu?.description || '';
    $('menuSoldOut').checked = !!menu?.soldOut;
    $('toppingRows').innerHTML = '';
    (menu?.toppings || []).forEach(t => addToppingRow(t));
    $('menuModal').hidden = false;
  }
  function addToppingRow(data = {}) {
    const row = document.createElement('div'); row.className='topping-row';
    row.innerHTML = `<input class="topping-name" type="text" placeholder="トッピング名" maxlength="80" value="${esc(data.name || '')}"><input class="topping-price" type="number" min="0" max="999999" placeholder="追加料金" value="${Number(data.price || 0)}"><button class="remove-row" type="button">削除</button>`;
    row.querySelector('.remove-row').addEventListener('click', () => row.remove()); $('toppingRows').appendChild(row);
  }
  function closeModal(id) { $(id).hidden = true; }

  async function saveMenu(event) {
    event.preventDefault();
    const toppings = Array.from(document.querySelectorAll('#toppingRows .topping-row')).map(row => ({ name: row.querySelector('.topping-name').value.trim(), price: Number(row.querySelector('.topping-price').value || 0) })).filter(t => t.name);
    const payload = { id:$('menuId').value, name:$('menuName').value.trim(), price:Number($('menuPrice').value), description:$('menuDescription').value.trim(), soldOut:$('menuSoldOut').checked, toppingsJson:JSON.stringify(toppings) };
    if (!payload.name) return toast('メニュー名を入力してください。','error');
    try { await call(payload.id ? 'updateMenu' : 'createMenu', payload); closeModal('menuModal'); await loadAll(); toast('メニューを保存しました。'); } catch (e) { toast(e.message,'error'); }
  }

  document.addEventListener('click', async (event) => {
    const nav = event.target.closest('.nav-item');
    if (nav) openTab(nav.dataset.tab);
    const go = event.target.closest('[data-go-tab]'); if (go) openTab(go.dataset.goTab);
    if (event.target.closest('#loginButton')) login();
    if (event.target.closest('#logoutButton') || event.target.closest('#mobileLogout')) logout();
    if (event.target.closest('#addMenuButton')) openMenuModal('');
    const edit = event.target.closest('.edit-menu'); if (edit) openMenuModal(edit.dataset.id);
    const toggle = event.target.closest('.toggle-soldout'); if (toggle) { try { await call('toggleSoldOut',{id:toggle.dataset.id}); await loadAll(); toast('売り切れ設定を更新しました。'); } catch(e) { toast(e.message,'error'); } }
    const del = event.target.closest('.delete-menu'); if (del && confirm('このメニューを削除しますか？')) { try { await call('deleteMenu',{id:del.dataset.id}); await loadAll(); toast('メニューを削除しました。'); } catch(e) { toast(e.message,'error'); } }
    const dh = event.target.closest('.delete-holiday'); if (dh && confirm(`${dh.dataset.date} を休業日から削除しますか？`)) { try { await call('deleteHoliday',{date:dh.dataset.date}); await loadAll(); toast('休業日を削除しました。'); } catch(e){toast(e.message,'error');} }
    const cr = event.target.closest('.cancel-reservation'); if (cr && confirm('この予約をキャンセル扱いにしますか？')) { try { await call('cancelReservation',{id:cr.dataset.id}); await loadAll(); toast('予約をキャンセルしました。'); } catch(e){toast(e.message,'error');} }
    const close = event.target.closest('[data-close]'); if (close) closeModal(close.dataset.close);
  });

  function openTab(tab) { document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.tab === tab)); document.querySelectorAll('.tab-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-'+tab)); }

  $('menuForm').addEventListener('submit', saveMenu);
  $('addToppingRowButton').addEventListener('click', () => addToppingRow());
  $('settingsForm').addEventListener('submit', async (e) => { e.preventDefault(); try { await call('updateSettings',{storeName:$('settingStoreName').value.trim(),backgroundUrl:$('settingBackgroundUrl').value.trim(),notifyEmail:$('settingNotifyEmail').value.trim()}); await loadAll(); toast('店舗設定を保存しました。'); } catch(e){toast(e.message,'error');} });
  $('passwordForm').addEventListener('submit', async (e) => { e.preventDefault(); const current=$('currentPassword').value,newPass=$('newPassword').value,confirmPass=$('confirmPassword').value; if(newPass.length<8) return toast('新しいパスワードは8文字以上にしてください。','error'); if(newPass!==confirmPass) return toast('確認用パスワードが一致しません。','error'); try { const currentHash=await AppApi.hashPassword(current), newHash=await AppApi.hashPassword(newPass); await call('changePassword',{currentHash,newHash}); $('passwordForm').reset(); toast('パスワードを変更しました。'); } catch(e){toast(e.message,'error');} });
  $('addHolidayButton').addEventListener('click', async () => { const date=$('holidayDate').value,reason=$('holidayReason').value.trim(); if(!date) return toast('休業日を選択してください。','error'); try { await call('addHoliday',{date,reason}); $('holidayDate').value=''; $('holidayReason').value=''; await loadAll(); toast('臨時休業日を追加しました。'); } catch(e){toast(e.message,'error');} });
  $('reservationDateFilter').addEventListener('change', renderReservations); $('reservationStatusFilter').addEventListener('change', renderReservations); $('refreshReservations').addEventListener('click', loadAll);
  document.addEventListener('keydown', (e)=> { if(e.key==='Enter' && document.activeElement === $('loginPassword')) login(); });

  if (state.sessionToken) { showApp(); loadAll(); } else showLogin();
})();
