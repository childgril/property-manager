/* ============================================================
   權狀管理系統 — 第一版
   技術：sql.js (瀏覽器內 SQLite)，資料存本機
   只做「權狀管理」(土地/建物 CRUD + 生命週期)，
   後續可擴充物件/買賣/借款/租賃
   ============================================================ */

let SQL = null;      // sql.js 模組
let db = null;       // 資料庫實例
let dirty = false;   // 是否有未儲存變更

/* ---------- 資料表結構（對應 schema 文件的權狀部分） ---------- */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS lands (
  land_id INTEGER PRIMARY KEY AUTOINCREMENT,
  deed_code TEXT,
  county TEXT, district TEXT, section_name TEXT, land_number TEXT,
  title_deed_number TEXT,
  land_category TEXT, zoning TEXT, land_grade TEXT,
  total_area_sqm REAL, share_numerator INTEGER, share_denominator INTEGER,
  announced_value_per_sqm REAL, announced_value_date TEXT,
  has_mortgage INTEGER DEFAULT 0, other_rights_notes TEXT, owner_name TEXT,
  deed_physical_location TEXT,
  acquired_at TEXT, acquisition_type TEXT, acquisition_cost REAL,
  fee_land_increment_tax REAL, fee_deed_tax REAL, fee_gift_tax REAL, fee_stamp_duty REAL, fee_lawyer REAL, fee_broker REAL, fee_registration REAL, fee_other REAL,
  disposed_at TEXT, disposal_type TEXT,
  lifecycle_status TEXT DEFAULT 'held',
  parent_land_id INTEGER,
  notes TEXT,
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS buildings (
  building_id INTEGER PRIMARY KEY AUTOINCREMENT,
  deed_code TEXT,
  county TEXT, district TEXT, section_name TEXT, building_number TEXT,
  door_address TEXT, title_deed_number TEXT,
  building_type TEXT, structure TEXT,
  total_floors INTEGER, floor_located TEXT,
  completion_date TEXT, usage_registered TEXT,
  main_area_sqm REAL, auxiliary_area_sqm REAL, common_area_sqm REAL,
  share_numerator INTEGER, share_denominator INTEGER, total_registered_area_sqm REAL,
  located_land_numbers TEXT,
  has_mortgage INTEGER DEFAULT 0, other_rights_notes TEXT, owner_name TEXT,
  deed_physical_location TEXT,
  acquired_at TEXT, acquisition_type TEXT, acquisition_cost REAL,
  fee_land_increment_tax REAL, fee_deed_tax REAL, fee_gift_tax REAL, fee_stamp_duty REAL, fee_lawyer REAL, fee_broker REAL, fee_registration REAL, fee_other REAL,
  disposed_at TEXT, disposal_type TEXT,
  lifecycle_status TEXT DEFAULT 'held',
  notes TEXT,
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS building_auxiliaries (
  aux_id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER,
  aux_type TEXT,
  area_sqm REAL,
  share_numerator INTEGER, share_denominator INTEGER,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS common_areas (
  common_id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER,
  section_name TEXT,
  common_building_number TEXT,
  area_sqm REAL,
  share_numerator INTEGER, share_denominator INTEGER,
  notes TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS building_extra_areas (
  extra_id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER,
  area_label TEXT,
  area_sqm REAL,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS building_lands (
  bl_id INTEGER PRIMARY KEY AUTOINCREMENT,
  building_id INTEGER,
  land_id INTEGER,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS deed_events (
  event_id INTEGER PRIMARY KEY AUTOINCREMENT,
  deed_type TEXT, deed_id INTEGER,
  event_date TEXT, event_kind TEXT, description TEXT, amount REAL,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS properties (
  property_id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_code TEXT,
  name TEXT,
  door_address TEXT,
  property_type TEXT,
  usage_type TEXT,
  current_status TEXT DEFAULT 'self_use',
  owner_name TEXT,
  notes TEXT,
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS deed_assignments (
  assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER,
  deed_type TEXT, land_id INTEGER, building_id INTEGER,
  start_date TEXT, end_date TEXT, is_current INTEGER DEFAULT 1,
  notes TEXT, created_at TEXT
);
CREATE TABLE IF NOT EXISTS transactions (
  transaction_id INTEGER PRIMARY KEY AUTOINCREMENT,
  property_id INTEGER,
  transaction_type TEXT,
  transaction_status TEXT DEFAULT 'negotiating',
  counterparty_name TEXT,
  broker_name TEXT, broker_fee REAL,
  lawyer_name TEXT,
  agreed_price REAL,
  first_viewed_at TEXT, contracted_at TEXT, sealed_at TEXT,
  title_transferred_at TEXT, handover_at TEXT,
  special_terms TEXT, notes TEXT,
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS cashflows (
  cashflow_id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER,
  property_id INTEGER,
  flow_date TEXT,
  direction TEXT,
  category TEXT,
  amount REAL,
  counterparty TEXT,
  payment_method TEXT,
  receipt_location TEXT,
  notes TEXT,
  created_at TEXT
);
CREATE TABLE IF NOT EXISTS loans (
  loan_id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_code TEXT,
  property_id INTEGER,
  collateral_scope TEXT,
  bank_name TEXT, branch TEXT, contact_person TEXT,
  loan_type TEXT, purpose TEXT,
  applied_at TEXT, appraisal_amount REAL,
  approved_amount REAL, approved_ratio REAL,
  interest_rate REAL, rate_type TEXT, base_rate_name TEXT, rate_adjustment REAL,
  term_months INTEGER, grace_period_months INTEGER,
  mortgage_amount REAL, mortgage_registered_at TEXT, lien_certificate_no TEXT,
  disbursed_at TEXT,
  repayment_method TEXT, repayment_day INTEGER, auto_debit_account TEXT,
  grace_period_end_at TEXT, rate_reset_at TEXT, lockup_end_at TEXT, maturity_at TEXT,
  status TEXT DEFAULT 'active', current_principal REAL,
  closed_at TEXT, close_reason TEXT, early_termination_fee REAL,
  origination_fee REAL,
  notes TEXT,
  created_at TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS loan_payments (
  payment_id INTEGER PRIMARY KEY AUTOINCREMENT,
  loan_id INTEGER,
  period_no INTEGER,
  due_date TEXT, paid_date TEXT,
  principal_amount REAL, interest_amount REAL, total_amount REAL,
  principal_balance_after REAL,
  payment_status TEXT DEFAULT 'scheduled',
  notes TEXT,
  created_at TEXT
);
`;

/* ---------- 列舉值（下拉選單用） ---------- */
const ENUMS = {
  land_category: [['建','建（建築用地）'],['田','田（水田）'],['旱','旱（旱田）'],['林','林（林地）'],['養','養（養殖用地）'],['牧','牧（畜牧用地）'],['礦','礦（礦業用地）'],['鹽','鹽（鹽田）'],['池','池（池塘）'],['線','線（鐵路用地）'],['道','道（道路）'],['水','水（水利用地）'],['溜','溜（蓄水池）'],['溝','溝（溝渠）'],['堤','堤（堤防）'],['原','原（生產原野）'],['雜','雜（雜地）'],['公','公（公共用地）'],['墓','墓（墳墓）'],['祠','祠（祠廟）'],['鐵','鐵（鐵道用地）'],['其他','其他']],
  land_acq: [['purchase','買賣'],['inheritance','繼承'],['gift','贈與'],['split','分割產生'],['merge','合併產生']],
  land_disposal: [['sale','出售'],['gift','贈與'],['split','分割消滅'],['merge','合併消滅'],['expropriation','徵收']],
  land_status: [['held','持有中'],['sold','已售出'],['split','已分割'],['merged','已合併']],
  building_type: [['apartment','公寓'],['elevator_building','電梯大樓'],['townhouse','透天厝'],['suite','套房'],['store','店面'],['office','辦公'],['factory','廠房'],['other','其他']],
  building_acq: [['purchase','買賣'],['self_build','自地自建'],['inheritance','繼承'],['gift','贈與']],
  building_disposal: [['sale','出售'],['gift','贈與'],['demolition','拆除滅失'],['expropriation','徵收']],
  aux_type: [['balcony','陽台'],['platform','平台'],['canopy','雨遮'],['porch','陽臺'],['other','其他']],
  building_status: [['held','持有中'],['sold','已售出'],['demolished','已滅失']],
  event_kind: [['acquire','取得'],['mortgage','設定抵押'],['release','塗銷抵押'],['improvement','改良'],['holding','持有費用'],['valuation','估價'],['split','分割'],['merge','合併'],['disposal','處分'],['other','其他']],
  property_type: [['land','純土地'],['building','純建物'],['land_and_building','土地+建物'],['parking','車位']],
  usage_type: [['residential','住宅'],['commercial','商業'],['mixed','住商混合'],['industrial','工業'],['agricultural','農業']],
  property_status: [['self_use','自用'],['rented','出租中'],['vacant','閒置'],['for_sale','出售中'],['sold','已售出']],
  txn_type: [['purchase','買進'],['sale','出售']],
  txn_status: [['evaluating','評估中'],['negotiating','議價中'],['contracted','已簽約'],['closing','過戶完稅中'],['completed','已完成'],['cancelled','取消']],
  flow_direction: [['in','收入'],['out','支出']],
  flow_category: [
    ['deposit','訂金'],['second_payment','第二期款'],['final_payment','尾款'],['full_payment','全額價金'],
    ['deed_tax','契稅'],['stamp_duty','印花稅'],['land_increment_tax','土地增值稅'],['housing_tax','房地合一稅'],
    ['broker_fee','仲介費'],['lawyer_fee','代書費'],['registration_fee','規費'],
    ['loan_disbursement','貸款撥款'],['loan_payoff','清償貸款'],['other','其他']
  ],
  payment_method: [['bank_transfer','轉帳'],['cash','現金'],['check','支票'],['atm','ATM'],['履約保證','履約保證專戶']],
  loan_type: [['mortgage','購屋貸款'],['second_mortgage','二胎'],['refinance','轉貸'],['increase','增貸'],['business','企業戶'],['working_capital','週轉']],
  collateral_scope: [['land_only','僅土地'],['building_only','僅建物'],['land_and_building','土地建物一併'],['multiple','跨多物件']],
  rate_type: [['floating','指數型'],['fixed','固定'],['hybrid','混合']],
  repayment_method: [['equal_payment','本息均攤'],['equal_principal','本金均攤'],['interest_only','僅付息']],
  loan_status: [['active','還款中'],['paid_off','已清償'],['refinanced','已轉貸'],['defaulted','違約']],
  pay_status: [['scheduled','未繳'],['paid','已繳'],['late','遲繳'],['partial','部分'],['skipped','跳過']],
};
function enumLabel(group, val) {
  const f = (ENUMS[group]||[]).find(e => e[0] === val);
  return f ? f[1] : (val || '—');
}

/* ---------- 工具函式 ---------- */
const $ = sel => document.querySelector(sel);
const now = () => new Date().toISOString().slice(0,10);
function fmt(n) { return n == null || n === '' ? '—' : Number(n).toLocaleString('zh-TW'); }
function sqm2ping(s) { return s ? (s * 0.3025).toFixed(2) : '—'; }
/* 西元日期(YYYY-MM-DD) 轉民國年顯示，如 2019-03-15 → 民國108年03月15日 */
function rocDate(s) {
  if (!s) return '—';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  const roc = parseInt(m[1]) - 1911;
  return `民國${roc}年${m[2]}月${m[3]}日`;
}
/* 短版民國年，如 108/03/15（用於表格省空間） */
function rocShort(s) {
  if (!s) return '—';
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return s;
  return `${parseInt(m[1])-1911}/${m[2]}/${m[3]}`;
}
/* 民國年/月/日 → 西元 YYYY-MM-DD（存進資料庫用） */
function rocToWest(yr, mo, dy) {
  yr = parseInt(yr); mo = parseInt(mo); dy = parseInt(dy);
  if (!yr || !mo || !dy) return null;
  const west = yr + 1911;
  return `${west}-${String(mo).padStart(2,'0')}-${String(dy).padStart(2,'0')}`;
}
/* 西元 YYYY-MM-DD → 拆成民國 {y,m,d}（編輯時回填用） */
function westToRoc(s) {
  if (!s) return { y:'', m:'', d:'' };
  const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return { y:'', m:'', d:'' };
  return { y: parseInt(m[1])-1911, m: parseInt(m[2]), d: parseInt(m[3]) };
}
function esc(s) { return (s==null?'':String(s)).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

/* 匯出資料為 Excel 可開的 CSV（UTF-8 BOM，中文不亂碼） */
function exportCSV(headers, rows, filename) {
  const cell = v => {
    let s = (v == null) ? '' : String(v);
    if (/[",\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  };
  const lines = [headers.map(cell).join(',')];
  rows.forEach(r => lines.push(r.map(cell).join(',')));
  const csv = '\uFEFF' + lines.join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0,10);
  a.href = url; a.download = `${filename}_${today}.csv`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
/* 匯出多個工作表為單一 .xls（Excel 可開，含多分頁、中文正常）。
   sheets: [{ name:'土地權狀', headers:[...], rows:[[...],...] }, ...] */
function exportMultiSheetXLS(sheets, filename) {
  const escH = s => (s==null?'':String(s)).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let xml = '<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n';
  xml += '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">';
  sheets.forEach(sh => {
    const safeName = (sh.name||'Sheet').replace(/[\\\/\?\*\[\]:]/g,' ').slice(0,31);
    xml += `<Worksheet ss:Name="${escH(safeName)}"><Table>`;
    xml += '<Row>' + sh.headers.map(h => `<Cell><Data ss:Type="String">${escH(h)}</Data></Cell>`).join('') + '</Row>';
    sh.rows.forEach(r => {
      xml += '<Row>' + r.map(v => {
        const isNum = v !== '' && v != null && !isNaN(v) && typeof v !== 'object';
        return `<Cell><Data ss:Type="${isNum?'Number':'String'}">${escH(v)}</Data></Cell>`;
      }).join('') + '</Row>';
    });
    xml += '</Table></Worksheet>';
  });
  xml += '</Workbook>';
  const blob = new Blob(['\uFEFF'+xml], { type: 'application/vnd.ms-excel;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const today = new Date().toISOString().slice(0,10);
  a.href = url; a.download = `${filename}_${today}.xls`;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
/* 一鍵匯出全部（土地＋建物，未來可加交易/借款）為一個多分頁 .xls */
function exportAll() {
  const lands = query("SELECT * FROM lands ORDER BY deed_physical_location, section_name, land_number");
  const blds = query("SELECT * FROM buildings ORDER BY deed_physical_location, building_number");
  if (!lands.length && !blds.length) { toast('沒有資料可匯出', true); return; }
  const share = r => (r.share_numerator&&r.share_denominator)?`${r.share_numerator}/${r.share_denominator}`:'全部';
  const sheets = [];
  sheets.push({
    name:'土地權狀',
    headers:['權狀正本位置','權狀字號','地段','地號','地目','等則','面積㎡','坪數','持分','所有權人','登記日期','取得方式','取得成本','土地增值稅','贈與稅','印花稅','代書費','仲介費','登記規費','其他費用','狀態','處分日','處分方式','備註'],
    rows: lands.map(r => [
      r.deed_physical_location, r.title_deed_number, r.section_name, r.land_number, r.land_category, r.land_grade,
      r.total_area_sqm, r.total_area_sqm?(r.total_area_sqm*0.3025).toFixed(2):'', share(r), r.owner_name,
      rocDate(r.acquired_at), enumLabel('land_acq',r.acquisition_type), r.acquisition_cost,
      r.fee_land_increment_tax, r.fee_gift_tax, r.fee_stamp_duty, r.fee_lawyer, r.fee_broker, r.fee_registration, r.fee_other,
      enumLabel('land_status',r.lifecycle_status), rocDate(r.disposed_at), enumLabel('land_disposal',r.disposal_type), r.notes
    ])
  });
  sheets.push({
    name:'建物權狀',
    headers:['權狀正本位置','權狀字號','建號','門牌地址','建物型態','主要構造','登記用途','主建物㎡','附屬建物㎡','共有部分㎡','權狀總登記㎡','坪數','持分','所有權人','登記日期','取得方式','取得成本','契稅','贈與稅','印花稅','代書費','仲介費','登記規費','其他費用','狀態','處分日','處分方式','備註'],
    rows: blds.map(r => [
      r.deed_physical_location, r.title_deed_number, r.building_number, r.door_address,
      enumLabel('building_type',r.building_type), r.structure, r.usage_registered,
      r.main_area_sqm, r.auxiliary_area_sqm, r.common_area_sqm, r.total_registered_area_sqm,
      r.total_registered_area_sqm?(r.total_registered_area_sqm*0.3025).toFixed(2):'', share(r), r.owner_name,
      rocDate(r.acquired_at), enumLabel('building_acq',r.acquisition_type), r.acquisition_cost,
      r.fee_deed_tax, r.fee_gift_tax, r.fee_stamp_duty, r.fee_lawyer, r.fee_broker, r.fee_registration, r.fee_other,
      enumLabel('building_status',r.lifecycle_status), rocDate(r.disposed_at), enumLabel('building_disposal',r.disposal_type), r.notes
    ])
  });
  exportMultiSheetXLS(sheets, '不動產總表');
}
function markClean() { dirty = false; $('#dataStatus').textContent = '已儲存 / 無變更'; $('#dataStatus').style.color = 'var(--text-dim)'; }

function toast(msg, isErr) {
  const t = $('#toast'); t.textContent = msg;
  t.className = 'toast show' + (isErr ? ' err' : '');
  setTimeout(() => t.className = 'toast' + (isErr ? ' err' : ''), 2200);
}

/* SQL 查詢輔助：回傳物件陣列 */
function query(sql, params=[]) {
  const stmt = db.prepare(sql);
  stmt.bind(params);
  const rows = [];
  while (stmt.step()) rows.push(stmt.getAsObject());
  stmt.free();
  return rows;
}
function run(sql, params=[]) {
  try {
    db.run(sql, params);
  } catch (e) {
    // 保險絲：若因缺欄位失敗，自動補欄位後重試一次
    if (/no such column|has no column/.test(e.message)) {
      migrate();
      db.run(sql, params); // 重試，補完欄位應該就成功
    } else {
      throw e;
    }
  }
  markDirty();
}

/* ---------- 初始化 ---------- */
/* 自動升級資料庫結構：補上舊 .db 缺少的欄位
   做法：直接解析 SCHEMA 裡每張表的欄位定義，跟實際資料庫比對，缺的自動補。
   不需手動維護清單，永遠不會漏。 */
function migrate() {
  // 從 SCHEMA 字串解析出每張表應有的欄位與型別
  const tableDefs = {};
  const re = /CREATE TABLE IF NOT EXISTS (\w+)\s*\(([\s\S]*?)\);/g;
  let mt;
  while ((mt = re.exec(SCHEMA)) !== null) {
    const tableName = mt[1];
    const body = mt[2];
    const cols = {};
    body.split(',').forEach(line => {
      line = line.trim();
      // 比對「欄位名 型別…」，跳過 PRIMARY KEY 那行等
      const cm = line.match(/^(\w+)\s+(TEXT|INTEGER|REAL|NUMERIC|BLOB)/i);
      if (cm && cm[1].toUpperCase() !== 'PRIMARY') {
        cols[cm[1]] = cm[2];
      }
    });
    tableDefs[tableName] = cols;
  }

  // 逐表比對，補上缺少的欄位
  for (const table in tableDefs) {
    let existing;
    try {
      existing = query(`PRAGMA table_info(${table})`).map(c => c.name);
    } catch(e) { continue; }
    if (!existing.length) continue; // 表不存在，SCHEMA 會建
    for (const col in tableDefs[table]) {
      if (!existing.includes(col)) {
        try {
          db.run(`ALTER TABLE ${table} ADD COLUMN ${col} ${tableDefs[table][col]}`);
          console.log(`已自動補欄位 ${table}.${col}`);
        } catch(e) { /* 忽略 */ }
      }
    }
  }
}

/* 重設：清空瀏覽器暫存與目前資料，重建乾淨的資料庫（修復壞掉的暫存用） */
function resetDatabase() {
  if (!confirm('⚠ 這會清空目前畫面上的資料並重建乾淨的資料庫。\n\n如果你有重要資料，請先按「💾 儲存到檔案」備份！\n\n確定要清空重來嗎？')) return;
  try { localStorage.removeItem('deedDbAutoSave'); } catch(e) {}
  db = new SQL.Database();
  db.run(SCHEMA);
  markClean();
  toast('已清空並重建乾淨的資料庫');
  showPage('dashboard');
}

async function boot() {
  try {
    SQL = await initSqlJs({ locateFile: f => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/${f}` });
    // 嘗試從 localStorage 還原上次工作階段（僅暫存，正式請存檔）
    const saved = localStorage.getItem('deedDbAutoSave');
    if (saved) {
      const bytes = Uint8Array.from(atob(saved), c => c.charCodeAt(0));
      db = new SQL.Database(bytes);
    } else {
      db = new SQL.Database();
      db.run(SCHEMA);
    }
    db.run(SCHEMA); // 確保表存在
    migrate();      // 自動補上舊資料檔缺少的欄位
    $('#boot').style.display = 'none';
    $('#app').style.display = 'flex';
    bindUI();
    showPage('dashboard');
    markClean();
  } catch (e) {
    $('#boot').innerHTML = '載入失敗：' + esc(e.message) + '<br>請確認網路連線（首次需下載 SQLite 引擎）。';
  }
}

/* 自動暫存到 localStorage（避免關掉就不見，但仍建議存檔） */
function autoSave() {
  try {
    const data = db.export();
    let bin = ''; const bytes = new Uint8Array(data);
    for (let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
    localStorage.setItem('deedDbAutoSave', btoa(bin));
  } catch(e) { /* 資料太大時 localStorage 可能失敗，忽略，靠存檔 */ }
}

/* ---------- UI 綁定 ---------- */
function bindUI() {
  document.querySelectorAll('.nav-item').forEach(n =>
    n.addEventListener('click', () => showPage(n.dataset.page)));

  $('#btnSave').addEventListener('click', saveToFile);
  $('#btnLoad').addEventListener('click', () => $('#fileInput').click());
  $('#fileInput').addEventListener('change', loadFromFile);
  $('#btnSeed').addEventListener('click', seedData);
  $('#btnReset').addEventListener('click', resetDatabase);
  $('#modalBg').addEventListener('click', e => { if (e.target === $('#modalBg')) closeModal(); });

  window.addEventListener('beforeunload', e => {
    autoSave();
    if (dirty) { e.preventDefault(); e.returnValue = ''; }
  });
}

const CRUMB = { dashboard:'總覽', lands:'土地權狀', buildings:'建物權狀', deedDetail:'權狀明細', properties:'不動產物件', propDetail:'物件明細', transactions:'買賣交易', txnDetail:'交易明細', loans:'銀行借貸', loanDetail:'貸款明細' };
function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === id));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === id));
  $('#crumb').innerHTML = '<b>' + CRUMB[id] + '</b>';
  if (id === 'dashboard') renderDashboard();
  if (id === 'lands') renderLandList();
  if (id === 'buildings') renderBuildingList();
  if (id === 'properties') renderPropertyList();
  if (id === 'transactions') renderTxnList();
  if (id === 'loans') renderLoanList();
  window.scrollTo(0,0);
}

/* ============================================================
   檔案存取（資料存本機）
   ============================================================ */
function saveToFile() {
  const data = db.export();
  const blob = new Blob([data], { type: 'application/x-sqlite3' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `權狀資料_${now()}.db`;
  a.click();
  URL.revokeObjectURL(a.href);
  markClean();
  toast('已匯出 .db 檔到你的下載資料夾');
}
function loadFromFile(e) {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      db = new SQL.Database(new Uint8Array(reader.result));
      db.run(SCHEMA);
      migrate();   // 載入舊檔也自動補欄位
      markClean(); toast('已載入：' + file.name);
      showPage('dashboard');
    } catch (err) { toast('載入失敗：' + err.message, true); }
  };
  reader.readAsArrayBuffer(file);
  e.target.value = '';
}

/* ============================================================
   總覽頁
   ============================================================ */
let dashSort = '', dashSortDir = 'ASC';
function setDashSort(c) {
  if (dashSort === c) { dashSortDir = dashSortDir === 'ASC' ? 'DESC' : 'ASC'; }
  else { dashSort = c; dashSortDir = 'ASC'; }
  renderDashboard();
}
function dashTh(label, key, cls, extra) {
  const arrow = dashSort===key ? (dashSortDir==='ASC'?' ▲':' ▼') : '';
  return `<th class="${cls||''}" style="cursor:pointer;user-select:none;position:sticky;top:38px;z-index:2;background:var(--surface);${extra||''}" onclick="setDashSort('${key}')">${label}${arrow}</th>`;
}
function renderDashboard() {
  const landTotal = query("SELECT COUNT(*) c FROM lands")[0].c;
  const landHeld = query("SELECT COUNT(*) c FROM lands WHERE lifecycle_status='held'")[0].c;
  const bldTotal = query("SELECT COUNT(*) c FROM buildings")[0].c;
  const bldHeld = query("SELECT COUNT(*) c FROM buildings WHERE lifecycle_status='held'")[0].c;
  const landCost = query("SELECT COALESCE(SUM(acquisition_cost),0) s FROM lands WHERE lifecycle_status='held'")[0].s;
  const bldCost = query("SELECT COALESCE(SUM(acquisition_cost),0) s FROM buildings WHERE lifecycle_status='held'")[0].s;
  const propTotal = query("SELECT COUNT(*) c FROM properties")[0].c;
  const loanActive = query("SELECT COUNT(*) c FROM loans WHERE status='active'")[0].c;
  const loanBalance = query("SELECT COALESCE(SUM(current_principal),0) s FROM loans WHERE status='active'")[0].s;
  const txnOpen = query("SELECT COUNT(*) c FROM transactions WHERE transaction_status NOT IN ('completed','cancelled')")[0].c;

  let html = `<h2 class="page-title">總覽</h2>
    <div class="page-desc">不動產資產管理系統 · 資料儲存在你的本機 · <span style="color:var(--accent)">版本 2026.05.26-o</span></div>
    <div class="stats">
      <div class="stat"><div class="label">土地權狀</div><div class="value" style="color:var(--land)">${landTotal}</div><div class="page-desc" style="margin:4px 0 0">持有中 ${landHeld}</div></div>
      <div class="stat"><div class="label">建物權狀</div><div class="value" style="color:var(--building)">${bldTotal}</div><div class="page-desc" style="margin:4px 0 0">持有中 ${bldHeld}</div></div>
      <div class="stat"><div class="label">不動產物件</div><div class="value">${propTotal}</div></div>
      <div class="stat"><div class="label">進行中交易</div><div class="value">${txnOpen}</div></div>
      <div class="stat"><div class="label">活躍貸款</div><div class="value">${loanActive}</div></div>
      <div class="stat"><div class="label">貸款餘額</div><div class="value" style="font-size:18px">${fmt(loanBalance)}</div></div>
    </div>`;

  if (landTotal === 0 && bldTotal === 0) {
    html += `<div class="note">👋 目前沒有任何資料。你可以點左下角「🌱 載入範例資料」看看系統怎麼運作，或直接到「土地權狀」「建物權狀」開始新增。所有資料只存在你的電腦，記得用「💾 儲存到檔案」匯出備份。</div>`;
  } else {
    const shareTxt = r => (r.share_numerator&&r.share_denominator)?`${r.share_numerator}/${r.share_denominator}`:'全部';
    const props = query("SELECT * FROM properties ORDER BY property_id");
    const money = v => v ? '$'+fmt(v) : '—';
    // 每個物件一列；同物件多筆地/建在格內分行
    const cell = (arr, render) => arr.length ? arr.map(render).join('<hr style="border:none;border-top:1px dashed var(--border);margin:4px 0">') : '<span style="color:var(--text-dim)">—</span>';

    let items = props.map(p => ({
      p,
      las: query("SELECT * FROM lands l WHERE l.land_id IN (SELECT land_id FROM deed_assignments WHERE property_id=? AND deed_type='land' AND is_current=1) ORDER BY deed_physical_location,section_name,land_number", [p.property_id]),
      bls: query("SELECT * FROM buildings b WHERE b.building_id IN (SELECT building_id FROM deed_assignments WHERE property_id=? AND deed_type='building' AND is_current=1) ORDER BY deed_physical_location,building_number", [p.property_id])
    }));
    if (dashSort) {
      const keyOf = it => {
        const L = it.las[0] || {}, B = it.bls[0] || {};
        const map = {
          l_loc:L.deed_physical_location, l_deed:L.title_deed_number, l_sec:L.section_name, l_num:L.land_number,
          l_area:L.total_area_sqm, l_cat:L.land_category, l_share:(L.share_numerator&&L.share_denominator)?L.share_numerator/L.share_denominator:9, l_cost:L.acquisition_cost,
          b_loc:B.deed_physical_location, b_deed:B.title_deed_number, b_num:B.building_number,
          b_area:B.total_registered_area_sqm||B.main_area_sqm, b_addr:B.door_address, b_share:(B.share_numerator&&B.share_denominator)?B.share_numerator/B.share_denominator:9, b_cost:B.acquisition_cost
        };
        return map[dashSort];
      };
      const numeric = ['l_area','l_cost','l_share','b_area','b_cost','b_share'].includes(dashSort);
      items.sort((a,b) => {
        let x = keyOf(a), y = keyOf(b);
        if (numeric) { x = parseFloat(x)||0; y = parseFloat(y)||0; return dashSortDir==='ASC'?x-y:y-x; }
        x = (x==null?'':String(x)); y = (y==null?'':String(y));
        return dashSortDir==='ASC' ? x.localeCompare(y,'zh-Hant') : y.localeCompare(x,'zh-Hant');
      });
    }

    let rows = '';
    items.forEach(({p, las, bls}) => {
      const L = (f) => cell(las, f);
      const B = (f) => cell(bls, f);
      const onL = l => `onclick="openDeedDetail('land',${l.land_id})"`;
      const onB = b => `onclick="openDeedDetail('building',${b.building_id})"`;
      rows += `<tr class="clickable" style="cursor:pointer">
        <td ${las[0]?onL(las[0]):''}>${L(l=>esc(l.deed_physical_location)||'—')}</td>
        <td class="mono">${L(l=>esc(l.title_deed_number)||'—')}</td>
        <td>${L(l=>esc(l.section_name)||'—')}</td>
        <td class="mono"><b>${L(l=>esc(l.land_number)||'—')}</b></td>
        <td class="mono right">${L(l=>fmt(l.total_area_sqm))}</td>
        <td>${L(l=>esc(l.land_category)||'—')}</td>
        <td>${L(l=>shareTxt(l))}</td>
        <td class="mono right">${L(l=>money(l.acquisition_cost))}</td>
        <td class="mono" style="border-left:3px solid var(--building)" ${bls[0]?onB(bls[0]):''}>${B(b=>esc(b.deed_physical_location)||'—')}</td>
        <td class="mono">${B(b=>esc(b.title_deed_number)||'—')}</td>
        <td class="mono"><b>${B(b=>esc(b.building_number)||'—')}</b></td>
        <td class="mono right">${B(b=>fmt(b.total_registered_area_sqm||b.main_area_sqm))}</td>
        <td>${B(b=>esc(b.door_address)||'—')}</td>
        <td>${B(b=>shareTxt(b))}</td>
        <td class="mono right">${B(b=>money(b.acquisition_cost))}</td>
      </tr>`;
    });

    html += `<div class="card">
      <div class="card-head"><h3>不動產物件一覽（一列＝一物件，左半土地 · 右半建物）</h3>
        <div style="margin-left:auto;display:flex;gap:8px">
          <button class="btn ghost" onclick="exportAll()">⬇ 匯出全部 Excel</button>
          <button class="btn ghost" onclick="rebuildProperties()">↻ 重新整理物件</button>
        </div></div>
      <div style="max-height:70vh;overflow:auto">
      <table style="font-size:13px">
        <thead>
          <tr>
            <th colspan="8" style="text-align:center;color:var(--land);background:var(--surface);position:sticky;top:0;z-index:3">● 土地權狀</th>
            <th colspan="7" style="text-align:center;color:var(--building);background:var(--surface);border-left:3px solid var(--building);position:sticky;top:0;z-index:3">● 建物權狀</th>
          </tr>
          <tr>
            ${dashTh('權狀位置','l_loc')}${dashTh('權狀字號','l_deed')}${dashTh('地段','l_sec')}${dashTh('地號','l_num')}${dashTh('面積','l_area','right')}${dashTh('地目','l_cat')}${dashTh('持分','l_share')}${dashTh('成本','l_cost','right')}
            ${dashTh('權狀位置','b_loc','','border-left:3px solid var(--building)')}${dashTh('權狀字號','b_deed')}${dashTh('建號','b_num')}${dashTh('面積','b_area','right')}${dashTh('地址','b_addr')}${dashTh('持分','b_share')}${dashTh('成本','b_cost','right')}
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
      </div>
      <div class="page-desc" style="margin-top:10px">一列代表一個物件：左半邊是土地、右半邊是對應的建物。點欄位標題可排序、點該列進詳細頁；數量不對時按「↻ 重新整理物件」。</div>
    </div>`;
  }
  $('#dashboard').innerHTML = html;
}

/* ============================================================
   土地權狀：列表
   ============================================================ */
let landFilter = 'all', landSearch = '', landSort = 'deed_physical_location', landSortDir = 'ASC';
function renderLandList() {
  let sql = "SELECT * FROM lands";
  const where = [];
  if (landFilter === 'held') where.push("lifecycle_status='held'");
  if (landFilter === 'disposed') where.push("lifecycle_status IN ('sold','split','merged')");
  if (landSearch) where.push(`(land_number LIKE '%${landSearch}%' OR section_name LIKE '%${landSearch}%' OR title_deed_number LIKE '%${landSearch}%')`);
  if (where.length) sql += " WHERE " + where.join(" AND ");
  // 排序：文字欄位用 COLLATE 讓地號自然排序
  const sortMap = { deed_physical_location:'deed_physical_location', title_deed_number:'title_deed_number', land_number:'land_number', section_name:'section_name', land_category:'land_category', total_area_sqm:'total_area_sqm', acquisition_cost:'acquisition_cost', acquired_at:'acquired_at', lifecycle_status:'lifecycle_status' };
  const col = sortMap[landSort] || 'deed_physical_location';
  sql += ` ORDER BY ${col} ${landSortDir==='ASC'?'ASC':'DESC'}`;
  const rows = query(sql);

  // 產生可點擊排序的表頭
  const sortArrow = c => landSort===c ? (landSortDir==='ASC'?' ▲':' ▼') : '';
  const th = (label, c, cls='') => `<th class="${cls}" style="cursor:pointer;user-select:none" onclick="setLandSort('${c}')">${label}${sortArrow(c)}</th>`;

  let html = `<h2 class="page-title">土地權狀</h2>
    <div class="page-desc">每筆地號獨立管理 · 各有生命週期 · 點欄位標題可排序</div>
    <div class="toolbar">
      <button class="chip ${landFilter==='all'?'on':''}" onclick="setLandFilter('all')">全部</button>
      <button class="chip ${landFilter==='held'?'on':''}" onclick="setLandFilter('held')">持有中</button>
      <button class="chip ${landFilter==='disposed'?'on':''}" onclick="setLandFilter('disposed')">已處分</button>
      <input class="search" placeholder="搜尋地號 / 地段 / 權狀字號" value="${esc(landSearch)}" oninput="onLandSearch(this.value)">
      <button class="btn ghost" style="margin-left:auto" onclick="exportLands()">⬇ 匯出 Excel</button>
      <button class="btn" onclick="openLandForm()">+ 新增土地權狀</button>
    </div>`;

  if (rows.length === 0) {
    html += `<div class="card"><div class="empty"><div class="big">▦</div>尚無土地權狀${landSearch?'符合搜尋':''}<br><br><button class="btn" onclick="openLandForm()">+ 新增第一筆</button></div></div>`;
  } else {
    html += `<div class="card" style="overflow-x:auto"><table>
      <thead><tr>${th('權狀正本位置','deed_physical_location')}${th('權狀字號','title_deed_number')}${th('地號','land_number')}${th('地段','section_name')}${th('地目','land_category')}${th('面積㎡','total_area_sqm','right')}<th class="right">坪數</th>${th('取得成本','acquisition_cost','right')}<th>持分</th>${th('登記日期','acquired_at')}${th('狀態','lifecycle_status')}<th>抵押</th><th></th></tr></thead><tbody>`;
    rows.forEach(r => {
      const share = (r.share_numerator && r.share_denominator) ? `${r.share_numerator}/${r.share_denominator}` : '全部';
      html += `<tr class="clickable" onclick="openDeedDetail('land',${r.land_id})">
        <td>${esc(r.deed_physical_location)||'—'}</td>
        <td class="mono">${esc(r.title_deed_number)||'—'}</td>
        <td class="mono">${esc(r.land_number)}</td>
        <td>${esc(r.section_name)||'—'}</td>
        <td>${enumLabel('land_category',r.land_category)}</td>
        <td class="mono right">${fmt(r.total_area_sqm)}</td>
        <td class="mono right">${sqm2ping(r.total_area_sqm)}</td>
        <td class="mono right">${fmt(r.acquisition_cost)}</td>
        <td class="mono">${share}</td>
        <td class="mono">${rocShort(r.acquired_at)}</td>
        <td><span class="badge ${r.lifecycle_status}">${enumLabel('land_status',r.lifecycle_status)}</span></td>
        <td>${r.has_mortgage?'有':'無'}</td>
        <td onclick="event.stopPropagation()"><div class="row-actions">
          <button class="icon-btn" onclick="openLandForm(${r.land_id})">編輯</button>
          <button class="icon-btn" onclick="duplicateLand(${r.land_id})">複製</button>
          <button class="icon-btn del" onclick="deleteLand(${r.land_id})">刪除</button>
        </div></td></tr>`;
    });
    html += `</tbody></table></div><div class="page-desc">共 ${rows.length} 筆</div>`;
  }
  $('#lands').innerHTML = html;
}
function setLandFilter(f) { landFilter = f; renderLandList(); }
function onLandSearch(v) { landSearch = v.replace(/'/g,''); renderLandList(); }
function setLandSort(c) {
  if (landSort === c) { landSortDir = landSortDir === 'ASC' ? 'DESC' : 'ASC'; }
  else { landSort = c; landSortDir = 'ASC'; }
  renderLandList();
}
function exportLands() {
  const rows = query("SELECT * FROM lands ORDER BY deed_physical_location, section_name, land_number");
  if (!rows.length) { toast('沒有土地資料可匯出', true); return; }
  const headers = ['權狀正本位置','權狀字號','地段','地號','地目','等則','面積㎡','坪數','持分','所有權人','登記日期','取得方式','取得成本','土地增值稅','贈與稅','印花稅','代書費','仲介費','登記規費','其他費用','狀態','處分日','處分方式','備註'];
  const share = r => (r.share_numerator&&r.share_denominator)?`${r.share_numerator}/${r.share_denominator}`:'全部';
  const data = rows.map(r => [
    r.deed_physical_location, r.title_deed_number, r.section_name, r.land_number,
    r.land_category, r.land_grade, r.total_area_sqm, r.total_area_sqm?(r.total_area_sqm*0.3025).toFixed(2):'',
    share(r), r.owner_name, rocDate(r.acquired_at), enumLabel('land_acq',r.acquisition_type),
    r.acquisition_cost, r.fee_land_increment_tax, r.fee_gift_tax, r.fee_stamp_duty, r.fee_lawyer, r.fee_broker, r.fee_registration, r.fee_other,
    enumLabel('land_status',r.lifecycle_status), rocDate(r.disposed_at), enumLabel('land_disposal',r.disposal_type), r.notes
  ]);
  exportCSV(headers, data, '土地權狀');
}

/* ============================================================
   建物權狀：列表
   ============================================================ */
let bldFilter = 'all', bldSearch = '', bldSort = 'deed_physical_location', bldSortDir = 'ASC';
function renderBuildingList() {
  let sql = "SELECT * FROM buildings";
  const where = [];
  if (bldFilter === 'held') where.push("lifecycle_status='held'");
  if (bldFilter === 'disposed') where.push("lifecycle_status IN ('sold','demolished')");
  if (bldSearch) where.push(`(building_number LIKE '%${bldSearch}%' OR door_address LIKE '%${bldSearch}%' OR title_deed_number LIKE '%${bldSearch}%')`);
  if (where.length) sql += " WHERE " + where.join(" AND ");
  const sortMap = { deed_physical_location:'deed_physical_location', title_deed_number:'title_deed_number', door_address:'door_address', building_number:'building_number', main_area_sqm:'main_area_sqm', auxiliary_area_sqm:'auxiliary_area_sqm', total_registered_area_sqm:'total_registered_area_sqm', acquisition_cost:'acquisition_cost', acquired_at:'acquired_at', lifecycle_status:'lifecycle_status' };
  const col = sortMap[bldSort] || 'deed_physical_location';
  sql += ` ORDER BY ${col} ${bldSortDir==='ASC'?'ASC':'DESC'}`;
  const rows = query(sql);

  const sortArrow = c => bldSort===c ? (bldSortDir==='ASC'?' ▲':' ▼') : '';
  const th = (label, c, cls='') => `<th class="${cls}" style="cursor:pointer;user-select:none" onclick="setBldSort('${c}')">${label}${sortArrow(c)}</th>`;

  let html = `<h2 class="page-title">建物權狀</h2>
    <div class="page-desc">每筆建號獨立管理 · 各有生命週期（登記日期可與土地不同步）· 點欄位標題可排序</div>
    <div class="toolbar">
      <button class="chip ${bldFilter==='all'?'on':''}" onclick="setBldFilter('all')">全部</button>
      <button class="chip ${bldFilter==='held'?'on':''}" onclick="setBldFilter('held')">持有中</button>
      <button class="chip ${bldFilter==='disposed'?'on':''}" onclick="setBldFilter('disposed')">已處分</button>
      <input class="search" placeholder="搜尋建號 / 門牌 / 權狀字號" value="${esc(bldSearch)}" oninput="onBldSearch(this.value)">
      <button class="btn ghost" style="margin-left:auto" onclick="exportBuildings()">⬇ 匯出 Excel</button>
      <button class="btn" onclick="openBuildingForm()">+ 新增建物權狀</button>
    </div>`;

  if (rows.length === 0) {
    html += `<div class="card"><div class="empty"><div class="big">▦</div>尚無建物權狀${bldSearch?'符合搜尋':''}<br><br><button class="btn" onclick="openBuildingForm()">+ 新增第一筆</button></div></div>`;
  } else {
    html += `<div class="card" style="overflow-x:auto"><table>
      <thead><tr>${th('權狀正本位置','deed_physical_location')}${th('權狀字號','title_deed_number')}${th('門牌','door_address')}${th('建號','building_number')}${th('主建物㎡','main_area_sqm','right')}${th('附屬建物㎡','auxiliary_area_sqm','right')}${th('權狀總登記㎡','total_registered_area_sqm','right')}${th('取得成本','acquisition_cost','right')}<th>持分</th>${th('登記日期','acquired_at')}${th('狀態','lifecycle_status')}<th>抵押</th><th></th></tr></thead><tbody>`;
    rows.forEach(r => {
      const share = (r.share_numerator && r.share_denominator) ? `${r.share_numerator}/${r.share_denominator}` : '全部';
      html += `<tr class="clickable" onclick="openDeedDetail('building',${r.building_id})">
        <td>${esc(r.deed_physical_location)||'—'}</td>
        <td class="mono">${esc(r.title_deed_number)||'—'}</td>
        <td>${esc(r.door_address)||'—'}</td>
        <td class="mono">${esc(r.building_number)}</td>
        <td class="mono right">${fmt(r.main_area_sqm)}</td>
        <td class="mono right">${fmt(r.auxiliary_area_sqm)}</td>
        <td class="mono right">${fmt(r.total_registered_area_sqm)}</td>
        <td class="mono right">${fmt(r.acquisition_cost)}</td>
        <td class="mono">${share}</td>
        <td class="mono">${rocShort(r.acquired_at)}</td>
        <td><span class="badge ${r.lifecycle_status}">${enumLabel('building_status',r.lifecycle_status)}</span></td>
        <td>${r.has_mortgage?'有':'無'}</td>
        <td onclick="event.stopPropagation()"><div class="row-actions">
          <button class="icon-btn" onclick="openBuildingForm(${r.building_id})">編輯</button>
          <button class="icon-btn" onclick="duplicateBuilding(${r.building_id})">複製</button>
          <button class="icon-btn del" onclick="deleteBuilding(${r.building_id})">刪除</button>
        </div></td></tr>`;
    });
    html += `</tbody></table></div><div class="page-desc">共 ${rows.length} 筆</div>`;
  }
  $('#buildings').innerHTML = html;
}
function setBldFilter(f) { bldFilter = f; renderBuildingList(); }
function onBldSearch(v) { bldSearch = v.replace(/'/g,''); renderBuildingList(); }
function setBldSort(c) {
  if (bldSort === c) { bldSortDir = bldSortDir === 'ASC' ? 'DESC' : 'ASC'; }
  else { bldSort = c; bldSortDir = 'ASC'; }
  renderBuildingList();
}
function exportBuildings() {
  const rows = query("SELECT * FROM buildings ORDER BY deed_physical_location, building_number");
  if (!rows.length) { toast('沒有建物資料可匯出', true); return; }
  const headers = ['權狀正本位置','權狀字號','建號','門牌地址','建物型態','主要構造','登記用途','主建物㎡','附屬建物㎡','共有部分㎡','權狀總登記㎡','坪數','持分','所有權人','登記日期','取得方式','取得成本','契稅','贈與稅','印花稅','代書費','仲介費','登記規費','其他費用','狀態','處分日','處分方式','備註'];
  const share = r => (r.share_numerator&&r.share_denominator)?`${r.share_numerator}/${r.share_denominator}`:'全部';
  const data = rows.map(r => [
    r.deed_physical_location, r.title_deed_number, r.building_number, r.door_address,
    enumLabel('building_type',r.building_type), r.structure, r.usage_registered,
    r.main_area_sqm, r.auxiliary_area_sqm, r.common_area_sqm, r.total_registered_area_sqm,
    r.total_registered_area_sqm?(r.total_registered_area_sqm*0.3025).toFixed(2):'',
    share(r), r.owner_name, rocDate(r.acquired_at), enumLabel('building_acq',r.acquisition_type),
    r.acquisition_cost, r.fee_deed_tax, r.fee_gift_tax, r.fee_stamp_duty, r.fee_lawyer, r.fee_broker, r.fee_registration, r.fee_other,
    enumLabel('building_status',r.lifecycle_status), rocDate(r.disposed_at), enumLabel('building_disposal',r.disposal_type), r.notes
  ]);
  exportCSV(headers, data, '建物權狀');
}

window.addEventListener('DOMContentLoaded', boot);
