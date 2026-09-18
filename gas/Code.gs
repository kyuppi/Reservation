const SHEETS = {
  SETTINGS: 'Settings',
  MENUS: 'Menus',
  HOLIDAYS: 'Holidays',
  RESERVATIONS: 'Reservations',
  SESSIONS: 'Sessions'
};

const DEFAULTS = {
  storeName: '店舗予約',
  backgroundUrl: '',
  notifyEmail: ''
};

// 初回セットアップだけ、この値を変更できます。
// 初回ログイン後は管理画面から変更できます。
const INITIAL_ADMIN_PASSWORD = 'change-me-1234';

/** 初回だけApps Scriptエディタから実行してください。 */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('スプレッドシートに紐づいたApps Scriptから実行してください。');
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  setupSheets_();
  return 'セットアップ完了';
}

function db_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');
  if (id) return SpreadsheetApp.openById(id);
  const active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) {
    PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', active.getId());
    return active;
  }
  throw new Error('スプレッドシートIDが未設定です。Apps Scriptエディタでsetup()を1回実行してください。');
}

function doGet(e) {
  try {
    setupSheets_();
    const action = (e.parameter.action || 'getPublicData').trim();
    const callback = (e.parameter.callback || '').trim();
    const data = route_(action, e.parameter);
    return respond_(callback, { ok: true, data });
  } catch (err) {
    const callback = (e && e.parameter && e.parameter.callback) || '';
    return respond_(callback, { ok: false, error: safeError_(err) });
  }
}

function route_(action, p) {
  switch (action) {
    case 'getPublicData': return getPublicData_();
    case 'createReservation': return createReservation_(p);
    case 'adminLogin': return adminLogin_(p.passwordHash);
    case 'getAdminData': return getAdminData_(p.token);
    case 'updateSettings': return updateSettings_(p.token, p);
    case 'changePassword': return changePassword_(p.token, p.currentHash, p.newHash);
    case 'createMenu': return saveMenu_(p.token, p, false);
    case 'updateMenu': return saveMenu_(p.token, p, true);
    case 'deleteMenu': return deleteMenu_(p.token, p.id);
    case 'toggleSoldOut': return toggleSoldOut_(p.token, p.id);
    case 'addHoliday': return addHoliday_(p.token, p.date, p.reason);
    case 'deleteHoliday': return deleteHoliday_(p.token, p.date);
    case 'cancelReservation': return cancelReservation_(p.token, p.id);
    default: throw new Error('不明な操作です。');
  }
}

function respond_(callback, obj) {
  const json = JSON.stringify(obj).replace(/<\/script/gi, '<\\/script');
  if (callback) {
    if (!/^[A-Za-z_$][\w.$]*$/.test(callback)) throw new Error('不正なcallbackです。');
    return ContentService.createTextOutput(callback + '(' + json + ')').setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function setupSheets_() {
  const ss = db_();
  ensureSheet_(ss, SHEETS.SETTINGS, ['key','value']);
  ensureSheet_(ss, SHEETS.MENUS, ['id','name','price','description','soldOut','toppingsJson']);
  ensureSheet_(ss, SHEETS.HOLIDAYS, ['date','reason']);
  ensureSheet_(ss, SHEETS.RESERVATIONS, ['id','visitDate','visitTime','name','guests','phone','email','orderJson','total','createdAt','status']);
  ensureSheet_(ss, SHEETS.SESSIONS, ['token','expiresAt']);
  const settings = getSettings_();
  if (!settings.adminPasswordHash) {
    setSetting_('adminPasswordHash', sha256_(INITIAL_ADMIN_PASSWORD));
  }
  if (!settings.storeName) setSetting_('storeName', DEFAULTS.storeName);
}

function ensureSheet_(ss, name, headers) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) sh.appendRow(headers);
  else {
    const current = sh.getRange(1,1,1,headers.length).getValues()[0];
    const mismatch = headers.some((h,i) => current[i] !== h);
    if (mismatch) sh.getRange(1,1,1,headers.length).setValues([headers]);
  }
  return sh;
}

function getSettings_() {
  const sh = db_().getSheetByName(SHEETS.SETTINGS);
  const values = sh.getDataRange().getValues();
  const out = {};
  for (let i=1;i<values.length;i++) if (values[i][0]) out[String(values[i][0])] = String(values[i][1] ?? '');
  return out;
}
function setSetting_(key, value) {
  const sh = db_().getSheetByName(SHEETS.SETTINGS);
  const values = sh.getDataRange().getValues();
  for (let i=1;i<values.length;i++) {
    if (String(values[i][0]) === key) { sh.getRange(i+1,2).setValue(value); return; }
  }
  sh.appendRow([key,value]);
}

function getPublicData_() {
  const settings = getSettings_();
  return {
    settings: {
      storeName: settings.storeName || DEFAULTS.storeName,
      backgroundUrl: settings.backgroundUrl || '',
      notifyEmail: settings.notifyEmail || ''
    },
    menus: readMenus_(),
    holidays: readHolidays_()
  };
}

function readMenus_() {
  const sh = db_().getSheetByName(SHEETS.MENUS);
  const values = sh.getDataRange().getValues();
  return values.slice(1).filter(r => r[0]).map(r => ({
    id: String(r[0]), name: String(r[1]), price: Number(r[2]) || 0, description: String(r[3] || ''), soldOut: String(r[4]).toLowerCase() === 'true', toppings: parseJson_(r[5], [])
  }));
}
function readHolidays_() {
  const sh = db_().getSheetByName(SHEETS.HOLIDAYS);
  const values = sh.getDataRange().getValues();
  return values.slice(1).filter(r => r[0]).map(r => ({ date: formatDate_(r[0]), reason: String(r[1] || '') }));
}
function readReservations_() {
  const sh = db_().getSheetByName(SHEETS.RESERVATIONS);
  const values = sh.getDataRange().getValues();
  return values.slice(1).filter(r => r[0]).map(r => ({
    id:String(r[0]), visitDate:formatDate_(r[1]), visitTime:formatTime_(r[2]), name:String(r[3]), guests:Number(r[4])||0, phone:String(r[5]||''), email:String(r[6]||''), order:parseJson_(r[7],[]), total:Number(r[8])||0, createdAt:formatDateTime_(r[9]), status:String(r[10]||'confirmed')
  }));
}
function parseJson_(value, fallback) { try { return JSON.parse(String(value || '')); } catch (_) { return fallback; } }
function formatDate_(value) {
  if (value instanceof Date && !isNaN(value)) return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Tokyo','yyyy-MM-dd');
  const s = String(value || '');
  return s.slice(0,10);
}
function formatTime_(value) {
  if (value instanceof Date && !isNaN(value)) return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Tokyo','HH:mm');
  return String(value || '').slice(0,5);
}
function formatDateTime_(value) {
  if (value instanceof Date && !isNaN(value)) return Utilities.formatDate(value, Session.getScriptTimeZone() || 'Asia/Tokyo','yyyy-MM-dd HH:mm:ss');
  return String(value || '');
}

function createReservation_(p) {
  const visitDate = clean_(p.visitDate), visitTime = clean_(p.visitTime), name = clean_(p.name), phone = clean_(p.phone), email = clean_(p.email);
  const guests = Number(p.guests);
  const order = parseJson_(p.orderJson, []);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) throw new Error('来店日が不正です。');
  if (!/^\d{2}:\d{2}$/.test(visitTime)) throw new Error('来店時間が不正です。');
  if (!name || !guests || guests < 1 || guests > 99 || (!phone && !email) || !Array.isArray(order) || !order.length) throw new Error('予約内容が不足しています。');
  if (readHolidays_().some(h => h.date === visitDate)) throw new Error('その日は臨時休業です。');
  const menuMap = {}; readMenus_().forEach(m => menuMap[m.id] = m);
  const normalized = order.map(item => {
    const menu = menuMap[String(item.menuId)];
    if (!menu || menu.soldOut) throw new Error('売り切れ、または存在しないメニューが含まれています。');
    const qty = Math.max(1, Math.min(99, Number(item.quantity)||0));
    const selected = Array.isArray(item.toppings) ? item.toppings : [];
    const allowed = (menu.toppings || []).map(t => String(t.name));
    const toppings = selected.filter(t => allowed.indexOf(String(t.name)) !== -1).map(t => ({ name:String(t.name), price:Number(t.price)||0 }));
    return { menuId:menu.id, name:menu.name, quantity:qty, unitPrice:menu.price, toppings:toppings };
  });
  const total = normalized.reduce((sum,item) => sum + item.quantity * (item.unitPrice + item.toppings.reduce((s,t)=>s+t.price,0)),0);
  const id = 'R' + Utilities.formatDate(new Date(), Session.getScriptTimeZone()||'Asia/Tokyo','yyyyMMddHHmmss') + '-' + Math.floor(1000+Math.random()*9000);
  const createdAt = new Date();
  db_().getSheetByName(SHEETS.RESERVATIONS).appendRow([id,visitDate,visitTime,name,guests,phone,email,JSON.stringify(normalized),total,createdAt,'confirmed']);
  sendReservationEmail_({id,visitDate,visitTime,name,guests,phone,email,order:normalized,total});
  return { reservationId:id };
}

function sendReservationEmail_(r) {
  const settings = getSettings_();
  const to = settings.notifyEmail;
  if (!to) return;
  const store = settings.storeName || '店舗予約';
  const body = [
    `${store}に新しい予約が入りました。`,
    '',
    `予約番号: ${r.id}`,
    `ご来店日時: ${r.visitDate} ${r.visitTime}`,
    `お名前: ${r.name}`,
    `人数: ${r.guests}名`,
    `電話番号: ${r.phone || '未入力'}`,
    `メール: ${r.email || '未入力'}`,
    '',
    '注文内容:',
    r.order.map(i => `・${i.name} × ${i.quantity}${i.toppings && i.toppings.length ? '（'+i.toppings.map(t=>t.name).join('、')+'）' : ''}`).join('\n'),
    `合計: ¥${Number(r.total).toLocaleString('ja-JP')}`
  ].join('\n');
  MailApp.sendEmail({to, subject:`【${store}】新しい予約 ${r.visitDate} ${r.visitTime}`, body});
}

function adminLogin_(passwordHash) {
  const settings = getSettings_();
  if (!passwordHash || String(passwordHash) !== String(settings.adminPasswordHash)) throw new Error('パスワードが違います。');
  const token = Utilities.getUuid() + Utilities.getUuid().replace(/-/g,'');
  const expires = new Date(Date.now() + 6*60*60*1000);
  db_().getSheetByName(SHEETS.SESSIONS).appendRow([token, expires]);
  return { token };
}
function requireAuth_(token) {
  if (!token) throw new Error('管理者認証が必要です。');
  const sh = db_().getSheetByName(SHEETS.SESSIONS);
  const values = sh.getDataRange().getValues();
  for (let i=values.length-1;i>=1;i--) {
    if (String(values[i][0]) === String(token)) {
      const exp = values[i][1] instanceof Date ? values[i][1] : new Date(values[i][1]);
      if (exp > new Date()) return true;
      throw new Error('セッションの有効期限が切れています。');
    }
  }
  throw new Error('無効なセッションです。');
}
function getAdminData_(token) { requireAuth_(token); const settings=getSettings_(); return {settings:{storeName:settings.storeName||DEFAULTS.storeName,backgroundUrl:settings.backgroundUrl||'',notifyEmail:settings.notifyEmail||''},menus:readMenus_(),holidays:readHolidays_(),reservations:readReservations_()}; }

function updateSettings_(token,p) { requireAuth_(token); setSetting_('storeName',clean_(p.storeName)||DEFAULTS.storeName); setSetting_('backgroundUrl',clean_(p.backgroundUrl)); setSetting_('notifyEmail',clean_(p.notifyEmail)); return {ok:true}; }
function changePassword_(token,currentHash,newHash) { requireAuth_(token); const settings=getSettings_(); if (String(currentHash)!==String(settings.adminPasswordHash)) throw new Error('現在のパスワードが違います。'); if (!/^[0-9a-f]{64}$/.test(String(newHash))) throw new Error('新しいパスワード情報が不正です。'); setSetting_('adminPasswordHash',newHash); return {ok:true}; }

function saveMenu_(token,p,isUpdate) {
  requireAuth_(token);
  const name=clean_(p.name); const price=Number(p.price); if(!name || !isFinite(price) || price < 0) throw new Error('メニュー名と価格を入力してください。');
  const toppings=parseJson_(p.toppingsJson,[]).filter(t => t && clean_(t.name)).map(t => ({name:clean_(t.name),price:Math.max(0,Number(t.price)||0)}));
  const sh=db_().getSheetByName(SHEETS.MENUS);
  if (isUpdate) {
    const id=String(p.id); const values=sh.getDataRange().getValues();
    for(let i=1;i<values.length;i++) if(String(values[i][0])===id){ sh.getRange(i+1,2,1,5).setValues([[name,price,clean_(p.description),String(p.soldOut)==='true',JSON.stringify(toppings)]]); return {id}; }
    throw new Error('指定されたメニューが見つかりません。');
  }
  const id='M'+Date.now()+Math.floor(Math.random()*1000); sh.appendRow([id,name,price,clean_(p.description),String(p.soldOut)==='true',JSON.stringify(toppings)]); return {id};
}
function deleteMenu_(token,id) { requireAuth_(token); const sh=db_().getSheetByName(SHEETS.MENUS); const values=sh.getDataRange().getValues(); for(let i=1;i<values.length;i++) if(String(values[i][0])===String(id)){sh.deleteRow(i+1);return {ok:true};} throw new Error('メニューが見つかりません。'); }
function toggleSoldOut_(token,id) { requireAuth_(token); const sh=db_().getSheetByName(SHEETS.MENUS); const values=sh.getDataRange().getValues(); for(let i=1;i<values.length;i++) if(String(values[i][0])===String(id)){ const now=String(values[i][4]).toLowerCase()==='true'; sh.getRange(i+1,5).setValue(!now); return {soldOut:!now}; } throw new Error('メニューが見つかりません。'); }
function addHoliday_(token,date,reason) { requireAuth_(token); if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) throw new Error('日付が不正です。'); if(readHolidays_().some(h=>h.date===date)) throw new Error('その休業日はすでに登録されています。'); db_().getSheetByName(SHEETS.HOLIDAYS).appendRow([date,clean_(reason)||'臨時休業']); return {ok:true}; }
function deleteHoliday_(token,date) { requireAuth_(token); const sh=db_().getSheetByName(SHEETS.HOLIDAYS); const values=sh.getDataRange().getValues(); for(let i=1;i<values.length;i++) if(formatDate_(values[i][0])===String(date)){sh.deleteRow(i+1);return {ok:true};} throw new Error('休業日が見つかりません。'); }
function cancelReservation_(token,id) { requireAuth_(token); const sh=db_().getSheetByName(SHEETS.RESERVATIONS); const values=sh.getDataRange().getValues(); for(let i=1;i<values.length;i++) if(String(values[i][0])===String(id)){sh.getRange(i+1,11).setValue('cancelled');return {ok:true};} throw new Error('予約が見つかりません。'); }

function sha256_(text) { const bytes=Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,String(text),Utilities.Charset.UTF_8); return bytes.map(b => ('0'+(b<0?b+256:b).toString(16)).slice(-2)).join(''); }
function clean_(value) { return String(value == null ? '' : value).trim(); }
function safeError_(err) { return err && err.message ? String(err.message) : 'サーバーエラーが発生しました。'; }
