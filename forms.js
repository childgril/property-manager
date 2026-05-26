/* ============================================================
   表單、明細頁、刪除、範例資料
   ============================================================ */

function closeModal() { $('#modalBg').classList.remove('show'); }
function openModal(html) {
  $('#modal').innerHTML = html;
  $('#modalBg').classList.add('show');
  // 若表單有合計欄，綁定費用欄位即時加總並先算一次
  if (document.getElementById('costTotal')) {
    $('#modal').addEventListener('input', e => {
      if (e.target.name && (e.target.name === 'acquisition_cost' || e.target.name.startsWith('fee_'))) updateCostTotal();
    });
    updateCostTotal();
  }
  // 若是建物表單（有面積加總提示），綁定主建物面積變動更新加總
  if (document.getElementById('areaSumHint')) {
    $('#modal').addEventListener('input', e => {
      if (e.target.name === 'main_area_sqm') updateAreaSum();
    });
  }
}

/* 即時把平方公尺換算成坪，顯示在指定的提示元素 */
function updatePing(input, hintId) {
  const v = parseFloat(input.value);
  const el = document.getElementById(hintId);
  if (!el) return;
  el.textContent = (v && v > 0) ? `≈ ${(v * 0.3025).toFixed(2)} 坪` : '';
}

/* 即時加總「取得成本＋各項費用」，顯示在合計欄 */
function updateCostTotal() {
  const names = ['acquisition_cost','fee_land_increment_tax','fee_deed_tax','fee_gift_tax','fee_stamp_duty','fee_lawyer','fee_broker','fee_registration','fee_other'];
  let sum = 0;
  names.forEach(n => {
    const el = document.querySelector(`#modal [name="${n}"]`);
    if (el) sum += parseFloat(el.value) || 0;
  });
  const out = document.getElementById('costTotal');
  if (out) out.textContent = sum > 0 ? sum.toLocaleString('zh-TW') : '0';
}

/* 民國年日期欄位（年/月/日三格），name 為基底，存檔時組成西元
   用法：fieldRocDate('acquired_at','取得日', r.acquired_at) */
function fieldRocDate(name, label, westValue, opts={}) {
  const roc = westToRoc(westValue);
  return `<div class="field full">
    <label>${label}（民國年）${opts.req?' <span class="req">*</span>':''}</label>
    <div style="display:flex;align-items:center;gap:8px;flex-wrap:nowrap">
      <span style="color:var(--text-dim)">民國</span>
      <input data-roc="${name}" data-part="y" type="number" value="${roc.y}" placeholder="108" style="width:90px;text-align:center" oninput="updateRocWest('${name}')">
      <span style="color:var(--text-dim)">年</span>
      <input data-roc="${name}" data-part="m" type="number" value="${roc.m}" placeholder="3" style="width:72px;text-align:center" oninput="updateRocWest('${name}')">
      <span style="color:var(--text-dim)">月</span>
      <input data-roc="${name}" data-part="d" type="number" value="${roc.d}" placeholder="15" style="width:72px;text-align:center" oninput="updateRocWest('${name}')">
      <span style="color:var(--text-dim)">日</span>
      <span id="west_${name}" style="color:var(--accent);font-weight:600;white-space:nowrap;margin-left:6px">${westValue?'= 西元'+westValue:''}</span>
    </div>
    ${opts.hint?`<div class="hint">${opts.hint}</div>`:''}
  </div>`;
}
/* 三格輸入時即時顯示換算的西元年 */
function updateRocWest(name) {
  const y = document.querySelector(`[data-roc="${name}"][data-part="y"]`).value;
  const m = document.querySelector(`[data-roc="${name}"][data-part="m"]`).value;
  const d = document.querySelector(`[data-roc="${name}"][data-part="d"]`).value;
  const west = rocToWest(y, m, d);
  const el = document.getElementById('west_' + name);
  if (el) el.textContent = west ? '= 西元' + west : '';
}
/* 從表單讀出某個民國年欄位，回傳西元字串（給 saveXXX 用） */
function readRocDate(name) {
  const yEl = document.querySelector(`[data-roc="${name}"][data-part="y"]`);
  if (!yEl) return null;
  const y = yEl.value;
  const m = document.querySelector(`[data-roc="${name}"][data-part="m"]`).value;
  const d = document.querySelector(`[data-roc="${name}"][data-part="d"]`).value;
  return rocToWest(y, m, d);
}

function selectOptions(group, current) {
  return ENUMS[group].map(([v,l]) => `<option value="${v}" ${v===current?'selected':''}>${l}</option>`).join('');
}
function fieldText(name, label, val, opts={}) {
  return `<div class="field ${opts.full?'full':''}">
    <label>${label}${opts.req?' <span class="req">*</span>':''}</label>
    <input name="${name}" value="${esc(val)}" ${opts.type?`type="${opts.type}"`:''} ${opts.ph?`placeholder="${opts.ph}"`:''}>
    ${opts.hint?`<div class="hint">${opts.hint}</div>`:''}</div>`;
}
function fieldSelect(name, label, group, val) {
  return `<div class="field"><label>${label}</label><select name="${name}"><option value="">—</option>${selectOptions(group,val)}</select></div>`;
}
/* 下拉選常見選項 + 可手動輸入。options 為字串陣列。
   若現值不在選項中（編輯舊資料），自動切到「其他」並帶入手動框。 */
function fieldSelectOrText(name, label, options, val, opts={}) {
  const inList = val && options.includes(val);
  const showText = val && !inList; // 現值不在清單→顯示手動框
  const opt = ['<option value="">—</option>']
    .concat(options.map(o => `<option value="${esc(o)}" ${val===o?'selected':''}>${esc(o)}</option>`))
    .concat(`<option value="__other__" ${showText?'selected':''}>其他（手動輸入）</option>`).join('');
  return `<div class="field ${opts.full?'full':''}">
    <label>${label}</label>
    <select name="${name}_sel" onchange="onSelectOrText('${name}', this.value)">${opt}</select>
    <input name="${name}" value="${esc(val)}" placeholder="手動輸入${label}" style="margin-top:6px;display:${showText?'block':'none'}" id="txt_${name}">
  </div>`;
}
/* 下拉選到「其他」就顯示手動框；選一般選項就把值填進去並隱藏手動框 */
function onSelectOrText(name, selVal) {
  const txt = document.getElementById('txt_' + name);
  if (!txt) return;
  if (selVal === '__other__') {
    txt.style.display = 'block';
    txt.value = '';
    txt.focus();
  } else {
    txt.style.display = 'none';
    txt.value = selVal; // 把選到的值寫進實際送出的欄位
  }
}
function readForm() {
  const obj = {};
  $('#modal').querySelectorAll('input,select,textarea').forEach(el => {
    obj[el.name] = el.value.trim();
  });
  return obj;
}

/* ---------- 土地表單 ---------- */
function openLandForm(id) {
  const r = id ? query("SELECT * FROM lands WHERE land_id=?", [id])[0] : (window.__landPreset || {});
  window.__landPreset = null;
  openModal(`
    <div class="modal-head"><h3>${id?'編輯':'新增'}土地權狀</h3><button class="x" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="section-label">地籍標示</div>
      ${fieldText('county','縣市',r.county,{ph:'台北市'})}
      ${fieldText('district','鄉鎮市區',r.district,{ph:'大安區'})}
      ${fieldText('section_name','段/小段',r.section_name,{ph:'大安段三小段'})}
      ${fieldText('land_number','地號',r.land_number,{req:true,ph:'0512-0000'})}
      ${fieldText('title_deed_number','權狀字號',r.title_deed_number)}
      ${fieldText('deed_physical_location','權狀正本位置',r.deed_physical_location,{ph:'保險箱A-3'})}
      ${fieldSelect('land_category','地目（權狀上的字）','land_category',r.land_category)}
      ${fieldText('zoning','使用分區（都市計畫）',r.zoning,{ph:'第三種住宅區（無則免填）'})}
      ${fieldText('land_grade','等則（農地地價等級，無則免填）',r.land_grade,{ph:'例：19'})}
      <div class="field"></div>

      <div class="section-label">面積與持分</div>
      <div class="field">
        <label>地號總面積㎡</label>
        <div style="display:flex;align-items:center;gap:10px">
          <input name="total_area_sqm" type="number" value="${esc(r.total_area_sqm)}" oninput="updatePing(this,'ping_total')" style="flex:1">
          <span id="ping_total" style="color:var(--accent);font-weight:600;white-space:nowrap;min-width:80px">${r.total_area_sqm?'≈ '+sqm2ping(r.total_area_sqm)+' 坪':''}</span>
        </div>
      </div>
      <div class="field"></div>
      ${fieldText('share_numerator','持分分子',r.share_numerator,{type:'number',ph:'不填=全部持有'})}
      ${fieldText('share_denominator','持分分母',r.share_denominator,{type:'number',ph:'不填=全部持有'})}
      ${fieldText('announced_value_per_sqm','公告現值/㎡',r.announced_value_per_sqm,{type:'number',hint:'影響土地增值稅'})}
      ${fieldText('announced_value_date','公告現值年期',r.announced_value_date,{type:'date'})}

      <div class="section-label">生命週期</div>
      ${fieldRocDate('acquired_at','登記日期',r.acquired_at,{hint:'這張權狀的「出生」'})}
      ${fieldSelect('lifecycle_status','生命週期狀態','land_status',r.lifecycle_status||'held')}
      <div class="field full">
        <div style="display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap">
          <div>
            <label style="display:block;font-size:15px;color:var(--text);font-weight:500;margin-bottom:6px">處分日（民國年）</label>
            <div style="display:flex;align-items:center;gap:6px;white-space:nowrap">
              <span style="color:var(--text-dim)">民國</span>
              <input data-roc="disposed_at" data-part="y" type="number" value="${westToRoc(r.disposed_at).y}" placeholder="108" style="width:80px;text-align:center" oninput="updateRocWest('disposed_at')">
              <span style="color:var(--text-dim)">年</span>
              <input data-roc="disposed_at" data-part="m" type="number" value="${westToRoc(r.disposed_at).m}" placeholder="3" style="width:60px;text-align:center" oninput="updateRocWest('disposed_at')">
              <span style="color:var(--text-dim)">月</span>
              <input data-roc="disposed_at" data-part="d" type="number" value="${westToRoc(r.disposed_at).d}" placeholder="15" style="width:60px;text-align:center" oninput="updateRocWest('disposed_at')">
              <span style="color:var(--text-dim)">日</span>
            </div>
            <span id="west_disposed_at" style="color:var(--accent);font-weight:600;font-size:13px">${r.disposed_at?'= 西元'+r.disposed_at:''}</span>
          </div>
          <div>
            <label style="display:block;font-size:15px;color:var(--text);font-weight:500;margin-bottom:6px">處分方式</label>
            <select name="disposal_type" style="width:140px">${['<option value="">—</option>'].concat(ENUMS.land_disposal.map(([v,l])=>`<option value="${v}" ${r.disposal_type===v?'selected':''}>${l}</option>`)).join('')}</select>
          </div>
        </div>
        <div class="hint">出售/分割/合併/贈與才填</div>
      </div>

      <div class="section-label">取得相關費用（買進時的各項花費，選填）</div>
      ${fieldSelect('acquisition_type','取得方式','land_acq',r.acquisition_type)}
      ${fieldText('acquisition_cost','取得時價值／成本',r.acquisition_cost,{type:'number',hint:'買賣填買價；贈與填贈與財產明細的核定價值；繼承填繼承時核定價值'})}
      ${fieldText('fee_land_increment_tax','土地增值稅',r.fee_land_increment_tax,{type:'number'})}
      ${fieldText('fee_gift_tax','贈與稅',r.fee_gift_tax,{type:'number',hint:'贈與取得才填'})}
      ${fieldText('fee_stamp_duty','印花稅',r.fee_stamp_duty,{type:'number'})}
      ${fieldText('fee_lawyer','代書費',r.fee_lawyer,{type:'number'})}
      ${fieldText('fee_broker','仲介費',r.fee_broker,{type:'number'})}
      ${fieldText('fee_registration','登記規費',r.fee_registration,{type:'number'})}
      ${fieldText('fee_other','其他費用',r.fee_other,{type:'number'})}
      <div class="field full" style="background:var(--accent-dim);border-radius:8px;padding:12px 16px;margin-top:4px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:16px;font-weight:600;color:var(--accent)">總投入成本（買價＋費用）</span>
          <span style="font-size:20px;font-weight:700;color:var(--accent)" class="mono">$ <span id="costTotal">0</span></span>
        </div>
      </div>

      <div class="section-label">他項權利與文件</div>
      <div class="field"><label>是否設定抵押</label><select name="has_mortgage"><option value="0" ${!r.has_mortgage?'selected':''}>否</option><option value="1" ${r.has_mortgage?'selected':''}>是</option></select></div>
      ${fieldText('other_rights_notes','其他他項權利',r.other_rights_notes,{full:true,ph:'地上權、地役權等'})}
      ${fieldText('owner_name','所有權人',r.owner_name,{ph:'登記名義人'})}
      ${fieldText('notes','備註',r.notes,{full:true})}
    </div></div>
    <div class="modal-foot">
      <span></span>
      <div><button class="btn ghost" onclick="closeModal()">取消</button>
      <button class="btn" onclick="saveLand(${id||0})">儲存</button></div>
    </div>`);
}
function saveLand(id) {
  const f = readForm();
  if (!f.land_number) { toast('地號為必填', true); return; }
  // 民國年日期欄位：從三格組成西元
  f.acquired_at = readRocDate('acquired_at');
  f.disposed_at = readRocDate('disposed_at');
  const cols = ['deed_code','county','district','section_name','land_number','title_deed_number','land_category','zoning','land_grade','total_area_sqm','share_numerator','share_denominator','announced_value_per_sqm','announced_value_date','has_mortgage','other_rights_notes','owner_name','deed_physical_location','acquired_at','acquisition_type','acquisition_cost','fee_land_increment_tax','fee_gift_tax','fee_stamp_duty','fee_lawyer','fee_broker','fee_registration','fee_other','disposed_at','disposal_type','lifecycle_status','notes'];
  const vals = cols.map(c => f[c] === '' || f[c] === undefined ? null : f[c]);
  let lid = id;
  if (id) {
    run(`UPDATE lands SET ${cols.map(c=>c+'=?').join(',')}, updated_at=? WHERE land_id=?`, [...vals, now(), id]);
    toast('已更新土地權狀');
  } else {
    run(`INSERT INTO lands (${cols.join(',')},created_at,updated_at) VALUES (${cols.map(()=>'?').join(',')},?,?)`, [...vals, now(), now()]);
    lid = query("SELECT last_insert_rowid() AS id")[0].id;
    toast('已新增土地權狀');
  }
  autoLinkLandProperty(lid, f);
  autoSave(); closeModal(); renderLandList();
}
/* 土地存檔後，自動建立對應的不動產物件（純土地物件），讓買賣交易可選到。
   若此土地已歸屬某物件（例如已被建物帶入），則不重複建。 */
function autoLinkLandProperty(landId, f) {
  const exists = query("SELECT property_id FROM deed_assignments WHERE deed_type='land' AND land_id=? AND is_current=1", [landId]);
  if (exists.length) return; // 已屬於某物件（可能被建物帶入），不重複建
  const pname = (f.section_name?f.section_name:'') + (f.land_number?(' '+f.land_number):'') || ('地號 ' + (f.land_number||''));
  run(`INSERT INTO properties (name,property_type,current_status,created_at,updated_at) VALUES (?,?,?,?,?)`,
    [pname.trim()||('地號'+landId), 'land', 'self_use', now(), now()]);
  const propId = query("SELECT last_insert_rowid() AS id")[0].id;
  run("INSERT INTO deed_assignments (property_id,deed_type,land_id,start_date,is_current,created_at) VALUES (?,?,?,?,1,?)",
    [propId, 'land', landId, now(), now()]);
}
function deleteLand(id) {
  const r = query("SELECT land_number FROM lands WHERE land_id=?", [id])[0];
  if (!confirm(`確定刪除土地權狀 ${r.land_number}？此動作無法復原。`)) return;
  run("DELETE FROM lands WHERE land_id=?", [id]);
  run("DELETE FROM deed_events WHERE deed_type='land' AND deed_id=?", [id]);
  autoSave(); toast('已刪除'); renderLandList();
}
/* 複製土地權狀：帶入所有欄位，但清空地號、權狀字號（這兩個一定不同） */
function duplicateLand(id) {
  const r = query("SELECT * FROM lands WHERE land_id=?", [id])[0];
  if (!r) return;
  const preset = Object.assign({}, r);
  delete preset.land_id;
  // 清空：識別欄、費用、日期、處分（這些每筆都不同，不帶）
  ['land_number','title_deed_number',
   'acquisition_cost','fee_land_increment_tax','fee_gift_tax','fee_stamp_duty','fee_lawyer','fee_broker','fee_registration','fee_other',
   'acquired_at','disposed_at','disposal_type','announced_value_date'
  ].forEach(k => preset[k] = '');
  window.__landPreset = preset;
  openLandForm();
  toast('已複製基本資料，請填入地號等資料');
}

/* ---------- 建物表單 ---------- */
function openBuildingForm(id) {
  const r = id ? query("SELECT * FROM buildings WHERE building_id=?", [id])[0] : (window.__bldPreset || {});
  window.__bldPreset = null;
  openModal(`
    <div class="modal-head"><h3>${id?'編輯':'新增'}建物權狀</h3><button class="x" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="section-label">建物標示</div>
      ${fieldText('county','縣市',r.county)}
      ${fieldText('district','鄉鎮市區',r.district)}
      ${fieldText('section_name','段/小段',r.section_name)}
      ${fieldText('building_number','建號',r.building_number,{req:true,ph:'02841-000'})}
      ${fieldText('door_address','門牌',r.door_address,{full:true})}
      ${fieldText('title_deed_number','權狀字號',r.title_deed_number)}
      ${fieldText('deed_physical_location','權狀正本位置',r.deed_physical_location,{ph:'保險箱A-3'})}
      ${fieldSelectOrText('building_type','建物型態',['公寓','電梯大樓','透天厝','套房','店面','辦公','廠房','華廈','別墅'],r.building_type?enumLabel('building_type',r.building_type):'')}
      ${fieldSelectOrText('structure','主要構造',['鋼筋混凝土造','加強磚造','鋼骨鋼筋混凝土造','鋼骨造','磚造','木造','土造','石造'],r.structure)}
      ${fieldText('total_floors','總樓層',r.total_floors,{type:'number'})}
      ${fieldText('floor_located','所在層次',r.floor_located,{ph:'五層'})}
      ${fieldRocDate('completion_date','建築完成日',r.completion_date,{hint:'影響屋齡'})}
      ${fieldSelectOrText('usage_registered','登記用途',['住家用','商業用','辦公室','店鋪','住商用','工業用','廠房','倉庫','停車空間'],r.usage_registered)}
      <div class="field full">
        <label>坐落地號（從下拉選單加入此建物坐落的土地，可多筆）</label>
        <select id="landPickDropdown" onchange="addLandPick(this.value)" style="background:var(--surface);border:1px solid var(--border);color:var(--text);padding:10px;border-radius:7px;font-size:16px;width:100%"></select>
        <div id="landPickChosen" style="display:flex;flex-wrap:wrap;gap:8px;margin-top:10px"></div>
        <div class="hint">從下拉選單選土地加入；已加入的可按 ✕ 移除。若下拉是空的，請先到「土地權狀」新增地號。</div>
      </div>

      <div class="section-label">面積</div>
      <div class="field">
        ${fieldText('main_area_sqm','主建物㎡',r.main_area_sqm,{type:'number'})}
        <div style="display:flex;align-items:center;gap:8px;margin-top:8px;flex-wrap:nowrap;white-space:nowrap">
          <span style="color:var(--text-dim);font-size:14px">權利範圍</span>
          <input name="share_numerator" type="number" value="${esc(r.share_numerator)}" placeholder="分子" style="width:72px;text-align:center">
          <span style="color:var(--text-dim)">/</span>
          <input name="share_denominator" type="number" value="${esc(r.share_denominator)}" placeholder="分母" style="width:72px;text-align:center">
          <span style="color:var(--text-dim);font-size:13px">不填=全部</span>
        </div>
      </div>
      <div class="field"></div>
      <div class="field full">
        <label>其他面積項目（夾層、地下室等，可多筆）</label>
        <div id="extraAreaList"></div>
        <button type="button" class="btn ghost" style="margin-top:6px" onclick="addExtraAreaRow()">+ 新增面積項目</button>
      </div>
      <div class="field full">
        <label>權狀總登記㎡</label>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <input name="total_registered_area_sqm" type="number" value="${esc(r.total_registered_area_sqm)}" oninput="updatePing(this,'ping_bld_total')" style="flex:1;min-width:160px">
          <span id="ping_bld_total" style="color:var(--accent);font-weight:600;white-space:nowrap;min-width:80px">${r.total_registered_area_sqm?'≈ '+sqm2ping(r.total_registered_area_sqm)+' 坪':''}</span>
          <button type="button" class="btn ghost" style="white-space:nowrap" onclick="fillTotalFromSum()">↙ 帶入加總</button>
        </div>
        <div class="hint">主建物＋其他面積項目 自動加總：<span id="areaSumHint" style="color:var(--accent);font-weight:600">0</span> ㎡（可按「帶入加總」填入，或自行輸入權狀上的數字）</div>
      </div>

      <div class="section-label">附屬建物（陽台、雨遮等，可多筆）</div>
      <div class="field full"><div id="auxList"></div>
        <button type="button" class="btn ghost" style="margin-top:6px" onclick="addAuxRow()">+ 新增附屬建物</button></div>

      <div class="section-label">共同使用部分（可多筆）</div>
      <div class="field full"><div id="commonList"></div>
        <button type="button" class="btn ghost" style="margin-top:6px" onclick="addCommonRow()">+ 新增共同使用部分</button></div>

      <div class="section-label">生命週期</div>
      ${fieldRocDate('acquired_at','登記日期',r.acquired_at,{hint:'自地自建為保存登記日'})}
      ${fieldSelect('lifecycle_status','生命週期狀態','building_status',r.lifecycle_status||'held')}
      <div class="field full">
        <div style="display:flex;align-items:flex-end;gap:20px;flex-wrap:wrap">
          <div>
            <label style="display:block;font-size:15px;color:var(--text);font-weight:500;margin-bottom:6px">處分日（民國年）</label>
            <div style="display:flex;align-items:center;gap:6px;white-space:nowrap">
              <span style="color:var(--text-dim)">民國</span>
              <input data-roc="disposed_at" data-part="y" type="number" value="${westToRoc(r.disposed_at).y}" placeholder="108" style="width:80px;text-align:center" oninput="updateRocWest('disposed_at')">
              <span style="color:var(--text-dim)">年</span>
              <input data-roc="disposed_at" data-part="m" type="number" value="${westToRoc(r.disposed_at).m}" placeholder="3" style="width:60px;text-align:center" oninput="updateRocWest('disposed_at')">
              <span style="color:var(--text-dim)">月</span>
              <input data-roc="disposed_at" data-part="d" type="number" value="${westToRoc(r.disposed_at).d}" placeholder="15" style="width:60px;text-align:center" oninput="updateRocWest('disposed_at')">
              <span style="color:var(--text-dim)">日</span>
            </div>
            <span id="west_disposed_at" style="color:var(--accent);font-weight:600;font-size:13px">${r.disposed_at?'= 西元'+r.disposed_at:''}</span>
          </div>
          <div>
            <label style="display:block;font-size:15px;color:var(--text);font-weight:500;margin-bottom:6px">處分方式</label>
            <select name="disposal_type" style="width:140px">${['<option value="">—</option>'].concat(ENUMS.building_disposal.map(([v,l])=>`<option value="${v}" ${r.disposal_type===v?'selected':''}>${l}</option>`)).join('')}</select>
          </div>
        </div>
        <div class="hint">出售/拆除/徵收/贈與才填</div>
      </div>

      <div class="section-label">取得相關費用（買進時的各項花費，選填）</div>
      ${fieldSelect('acquisition_type','取得方式','building_acq',r.acquisition_type)}
      ${fieldText('acquisition_cost','取得時價值／成本',r.acquisition_cost,{type:'number',hint:'買賣填買價；自地自建填營造成本；贈與填贈與財產明細的核定價值'})}
      ${fieldText('fee_deed_tax','契稅',r.fee_deed_tax,{type:'number'})}
      ${fieldText('fee_gift_tax','贈與稅',r.fee_gift_tax,{type:'number',hint:'贈與取得才填'})}
      ${fieldText('fee_stamp_duty','印花稅',r.fee_stamp_duty,{type:'number'})}
      ${fieldText('fee_lawyer','代書費',r.fee_lawyer,{type:'number'})}
      ${fieldText('fee_broker','仲介費',r.fee_broker,{type:'number'})}
      ${fieldText('fee_registration','登記規費',r.fee_registration,{type:'number'})}
      ${fieldText('fee_other','其他費用',r.fee_other,{type:'number'})}
      <div class="field full" style="background:var(--accent-dim);border-radius:8px;padding:12px 16px;margin-top:4px">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:16px;font-weight:600;color:var(--accent)">總投入成本（買價＋費用）</span>
          <span style="font-size:20px;font-weight:700;color:var(--accent)" class="mono">$ <span id="costTotal">0</span></span>
        </div>
      </div>

      <div class="section-label">他項權利與文件</div>
      <div class="field"><label>是否設定抵押</label><select name="has_mortgage"><option value="0" ${!r.has_mortgage?'selected':''}>否</option><option value="1" ${r.has_mortgage?'selected':''}>是</option></select></div>
      ${fieldText('other_rights_notes','其他他項權利',r.other_rights_notes,{full:true})}
      ${fieldText('owner_name','所有權人',r.owner_name,{ph:'登記名義人'})}
      ${fieldText('notes','備註',r.notes,{full:true})}
    </div></div>
    <div class="modal-foot"><span></span>
      <div><button class="btn ghost" onclick="closeModal()">取消</button>
      <button class="btn" onclick="saveBuilding(${id||0})">儲存</button></div>
    </div>`);
  // 載入既有的附屬建物與共同使用部分（編輯時）
  auxRows = id ? query("SELECT * FROM building_auxiliaries WHERE building_id=?", [id]).map(a => ({aux_type:a.aux_type, area_sqm:a.area_sqm, share_numerator:a.share_numerator, share_denominator:a.share_denominator})) : (window.__bldPresetAux || []);
  commonRows = id ? query("SELECT * FROM common_areas WHERE building_id=?", [id]).map(c => ({section_name:c.section_name, common_building_number:c.common_building_number, area_sqm:c.area_sqm, share_numerator:c.share_numerator, share_denominator:c.share_denominator})) : (window.__bldPresetCommon || []);
  window.__bldPresetAux = null; window.__bldPresetCommon = null;
  extraRows = id ? query("SELECT * FROM building_extra_areas WHERE building_id=?", [id]).map(e => ({area_label:e.area_label, area_sqm:e.area_sqm})) : (window.__bldPresetExtra || []);
  window.__bldPresetExtra = null;
  renderAuxList();
  renderCommonList();
  renderExtraAreaList();
  // 載入土地權狀勾選清單
  renderLandPickList(id);
}

/* 坐落地號：下拉選單 + 已選標籤 */
let pickedLands = [];      // 已選土地 [{land_id, land_number, section_name}]
let allLandsCache = [];    // 全部可選土地

function renderLandPickList(buildingId) {
  allLandsCache = query("SELECT land_id, land_number, section_name, title_deed_number FROM lands WHERE lifecycle_status='held' ORDER BY section_name, land_number");
  // 編輯時帶入已連結的土地
  if (buildingId) {
    const linkedIds = query("SELECT land_id FROM building_lands WHERE building_id=?", [buildingId]).map(r => r.land_id);
    pickedLands = allLandsCache.filter(l => linkedIds.includes(l.land_id));
  } else {
    pickedLands = [];
  }
  renderLandDropdown();
  renderLandChosen();
}
function landLabel(l) {
  const parts = [];
  if (l.section_name) parts.push(l.section_name);
  parts.push(l.land_number || '');
  let s = parts.join(' ');
  if (l.title_deed_number) s += `（${l.title_deed_number}）`;
  return s;
}
function renderLandDropdown() {
  const dd = document.getElementById('landPickDropdown');
  if (!dd) return;
  const pickedIds = pickedLands.map(p => p.land_id);
  const avail = allLandsCache.filter(l => !pickedIds.includes(l.land_id));
  if (!allLandsCache.length) {
    dd.innerHTML = '<option value="">（尚無土地權狀，請先到「土地權狀」新增）</option>';
  } else if (!avail.length) {
    dd.innerHTML = '<option value="">（已全部加入）</option>';
  } else {
    dd.innerHTML = '<option value="">＋ 選擇土地加入…</option>' +
      avail.map(l => `<option value="${l.land_id}">${esc(landLabel(l))}</option>`).join('');
  }
}
function renderLandChosen() {
  const box = document.getElementById('landPickChosen');
  if (!box) return;
  if (!pickedLands.length) { box.innerHTML = '<span style="color:var(--text-dim);font-size:14px">尚未選擇坐落土地</span>'; return; }
  box.innerHTML = pickedLands.map(l => `
    <span style="display:inline-flex;align-items:center;gap:6px;background:var(--accent-dim);color:var(--accent);padding:6px 12px;border-radius:20px;font-size:15px">
      ${esc(landLabel(l))}
      <span style="cursor:pointer;font-weight:700" onclick="removeLandPick(${l.land_id})">✕</span>
    </span>`).join('');
}
function addLandPick(landId) {
  if (!landId) return;
  const l = allLandsCache.find(x => x.land_id == landId);
  if (l && !pickedLands.some(p => p.land_id == landId)) pickedLands.push(l);
  renderLandDropdown(); renderLandChosen();
}
function removeLandPick(landId) {
  pickedLands = pickedLands.filter(p => p.land_id != landId);
  renderLandDropdown(); renderLandChosen();
}

/* ===== 附屬建物 / 共同使用部分 的動態清單 ===== */
let auxRows = [], commonRows = [], extraRows = [];

/* 其他面積項目（夾層等）動態清單 */
function renderExtraAreaList() {
  const box = document.getElementById('extraAreaList');
  if (!box) return;
  if (!extraRows.length) { box.innerHTML = '<div style="color:var(--text-dim);font-size:14px;padding:4px 0">尚無其他面積項目</div>'; updateAreaSum(); return; }
  box.innerHTML = extraRows.map((a,i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <input placeholder="名稱（如：夾層）" value="${esc(a.area_label)??''}" oninput="extraRows[${i}].area_label=this.value" style="width:160px;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:9px;border-radius:7px;font-size:15px">
      <input type="number" placeholder="面積㎡" value="${a.area_sqm??''}" oninput="extraRows[${i}].area_sqm=this.value;updateAreaSum()" style="width:110px;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:9px;border-radius:7px;font-size:15px">
      <span style="color:var(--text-dim);font-size:14px">㎡</span>
      <button type="button" class="icon-btn del" onclick="removeExtraAreaRow(${i})">刪除</button>
    </div>`).join('');
  updateAreaSum();
}
function addExtraAreaRow() { extraRows.push({area_label:'', area_sqm:''}); renderExtraAreaList(); }
function removeExtraAreaRow(i) { extraRows.splice(i,1); renderExtraAreaList(); }
/* 計算 主建物＋其他項目 的加總，顯示在提示 */
function updateAreaSum() {
  const main = parseFloat((document.querySelector('#modal [name="main_area_sqm"]')||{}).value) || 0;
  const extra = extraRows.reduce((s,a)=> s + (parseFloat(a.area_sqm)||0), 0);
  const sum = main + extra;
  const el = document.getElementById('areaSumHint');
  if (el) el.textContent = sum ? sum.toFixed(2).replace(/\.?0+$/,'') : '0';
}
/* 按「帶入加總」把加總填進權狀總登記欄 */
function fillTotalFromSum() {
  const main = parseFloat((document.querySelector('#modal [name="main_area_sqm"]')||{}).value) || 0;
  const extra = extraRows.reduce((s,a)=> s + (parseFloat(a.area_sqm)||0), 0);
  const sum = main + extra;
  const input = document.querySelector('#modal [name="total_registered_area_sqm"]');
  if (input) { input.value = sum ? parseFloat(sum.toFixed(2)) : ''; updatePing(input, 'ping_bld_total'); }
}

function renderAuxList() {
  const box = document.getElementById('auxList');
  if (!box) return;
  if (!auxRows.length) { box.innerHTML = '<div style="color:var(--text-dim);font-size:14px;padding:4px 0">尚無附屬建物</div>'; return; }
  box.innerHTML = auxRows.map((a,i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <select onchange="auxRows[${i}].aux_type=this.value" style="background:var(--surface);border:1px solid var(--border);color:var(--text);padding:9px;border-radius:7px;font-size:15px">
        ${ENUMS.aux_type.map(([v,l])=>`<option value="${v}" ${a.aux_type===v?'selected':''}>${l}</option>`).join('')}
      </select>
      <input type="number" placeholder="面積㎡" value="${a.area_sqm??''}" oninput="auxRows[${i}].area_sqm=this.value" style="width:100px;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:9px;border-radius:7px;font-size:15px">
      <span style="color:var(--text-dim);font-size:14px">權利範圍</span>
      <input type="number" placeholder="分子" value="${a.share_numerator??''}" oninput="auxRows[${i}].share_numerator=this.value" style="width:70px;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:9px;border-radius:7px;font-size:15px;text-align:center">
      <span style="color:var(--text-dim)">/</span>
      <input type="number" placeholder="分母" value="${a.share_denominator??''}" oninput="auxRows[${i}].share_denominator=this.value" style="width:70px;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:9px;border-radius:7px;font-size:15px;text-align:center">
      <button type="button" class="icon-btn del" onclick="removeAuxRow(${i})">刪除</button>
    </div>`).join('');
}
function addAuxRow() { auxRows.push({aux_type:'balcony', area_sqm:'', share_numerator:'', share_denominator:''}); renderAuxList(); }
function removeAuxRow(i) { auxRows.splice(i,1); renderAuxList(); }

function renderCommonList() {
  const box = document.getElementById('commonList');
  if (!box) return;
  if (!commonRows.length) { box.innerHTML = '<div style="color:var(--text-dim);font-size:14px;padding:4px 0">尚無共同使用部分</div>'; return; }
  box.innerHTML = commonRows.map((c,i) => `
    <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;flex-wrap:wrap">
      <input placeholder="段" value="${esc(c.section_name)??''}" oninput="commonRows[${i}].section_name=this.value" style="width:120px;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:9px;border-radius:7px;font-size:15px">
      <input placeholder="建號" value="${esc(c.common_building_number)??''}" oninput="commonRows[${i}].common_building_number=this.value" style="width:130px;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:9px;border-radius:7px;font-size:15px">
      <input type="number" placeholder="面積㎡" value="${c.area_sqm??''}" oninput="commonRows[${i}].area_sqm=this.value" style="width:100px;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:9px;border-radius:7px;font-size:15px">
      <span style="color:var(--text-dim);font-size:14px">權利範圍</span>
      <input type="number" placeholder="分子" value="${c.share_numerator??''}" oninput="commonRows[${i}].share_numerator=this.value" style="width:70px;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:9px;border-radius:7px;font-size:15px;text-align:center">
      <span style="color:var(--text-dim)">/</span>
      <input type="number" placeholder="分母" value="${c.share_denominator??''}" oninput="commonRows[${i}].share_denominator=this.value" style="width:70px;background:var(--surface);border:1px solid var(--border);color:var(--text);padding:9px;border-radius:7px;font-size:15px;text-align:center">
      <button type="button" class="icon-btn del" onclick="removeCommonRow(${i})">刪除</button>
    </div>`).join('');
}
function addCommonRow() { commonRows.push({section_name:'', common_building_number:'', area_sqm:'', share_numerator:'', share_denominator:''}); renderCommonList(); }
function removeCommonRow(i) { commonRows.splice(i,1); renderCommonList(); }
function saveBuilding(id) {
  const f = readForm();
  if (!f.building_number) { toast('建號為必填', true); return; }
  // 民國年日期欄位：從三格組成西元
  f.completion_date = readRocDate('completion_date');
  f.acquired_at = readRocDate('acquired_at');
  f.disposed_at = readRocDate('disposed_at');
  // 附屬建物面積合計、共有部分面積合計（自動由清單加總）
  f.auxiliary_area_sqm = auxRows.reduce((s,a)=> s + (parseFloat(a.area_sqm)||0), 0) || null;
  f.common_area_sqm = commonRows.reduce((s,c)=> s + (parseFloat(c.area_sqm)||0), 0) || null;
  const cols = ['deed_code','county','district','section_name','building_number','door_address','title_deed_number','building_type','structure','total_floors','floor_located','completion_date','usage_registered','main_area_sqm','auxiliary_area_sqm','common_area_sqm','share_numerator','share_denominator','total_registered_area_sqm','located_land_numbers','has_mortgage','other_rights_notes','owner_name','deed_physical_location','acquired_at','acquisition_type','acquisition_cost','fee_deed_tax','fee_gift_tax','fee_stamp_duty','fee_lawyer','fee_broker','fee_registration','fee_other','disposed_at','disposal_type','lifecycle_status','notes'];
  const vals = cols.map(c => f[c] === '' || f[c] === undefined ? null : f[c]);
  let bid = id;
  if (id) {
    run(`UPDATE buildings SET ${cols.map(c=>c+'=?').join(',')}, updated_at=? WHERE building_id=?`, [...vals, now(), id]);
    toast('已更新建物權狀');
  } else {
    run(`INSERT INTO buildings (${cols.join(',')},created_at,updated_at) VALUES (${cols.map(()=>'?').join(',')},?,?)`, [...vals, now(), now()]);
    bid = query("SELECT last_insert_rowid() AS id")[0].id;
    toast('已新增建物權狀');
  }
  // 重寫附屬建物子表
  run("DELETE FROM building_auxiliaries WHERE building_id=?", [bid]);
  auxRows.forEach(a => {
    if (a.area_sqm || a.aux_type) run("INSERT INTO building_auxiliaries (building_id,aux_type,area_sqm,share_numerator,share_denominator,created_at) VALUES (?,?,?,?,?,?)",
      [bid, a.aux_type||null, a.area_sqm||null, a.share_numerator||null, a.share_denominator||null, now()]);
  });
  // 重寫共同使用部分子表
  run("DELETE FROM common_areas WHERE building_id=?", [bid]);
  commonRows.forEach(c => {
    if (c.section_name || c.common_building_number || c.area_sqm) run("INSERT INTO common_areas (building_id,section_name,common_building_number,area_sqm,share_numerator,share_denominator,created_at) VALUES (?,?,?,?,?,?,?)",
      [bid, c.section_name||null, c.common_building_number||null, c.area_sqm||null, c.share_numerator||null, c.share_denominator||null, now()]);
  });
  // 重寫其他面積項目子表（夾層等）
  run("DELETE FROM building_extra_areas WHERE building_id=?", [bid]);
  extraRows.forEach(e => {
    if (e.area_label || e.area_sqm) run("INSERT INTO building_extra_areas (building_id,area_label,area_sqm,created_at) VALUES (?,?,?,?)",
      [bid, e.area_label||null, e.area_sqm||null, now()]);
  });
  // 重寫坐落土地關聯（從已選清單 pickedLands）
  run("DELETE FROM building_lands WHERE building_id=?", [bid]);
  pickedLands.forEach(l => {
    run("INSERT INTO building_lands (building_id,land_id,created_at) VALUES (?,?,?)", [bid, l.land_id, now()]);
  });
  // 自動建立 / 更新對應的不動產物件
  autoLinkProperty(bid, f);
  autoSave(); closeModal(); renderBuildingList();
}

/* 建物存檔後，自動建立對應的不動產物件並指派權狀（建物+坐落土地）。
   若此建物已屬於某物件，則只更新該物件的土地指派，不重複建。 */
function autoLinkProperty(buildingId, f) {
  // 查這個建物目前是否已歸屬某物件
  let pa = query("SELECT property_id FROM deed_assignments WHERE deed_type='building' AND building_id=? AND is_current=1", [buildingId]);
  let propId;
  if (pa.length) {
    propId = pa[0].property_id;
  } else {
    // 建新物件，名稱用門牌，沒有就用建號
    const pname = (f.door_address && f.door_address.trim()) ? f.door_address.trim() : ('建號 ' + (f.building_number||''));
    run(`INSERT INTO properties (name,door_address,property_type,current_status,created_at,updated_at) VALUES (?,?,?,?,?,?)`,
      [pname, f.door_address||null, 'land_and_building', 'self_use', now(), now()]);
    propId = query("SELECT last_insert_rowid() AS id")[0].id;
    // 指派這個建物
    run("INSERT INTO deed_assignments (property_id,deed_type,building_id,start_date,is_current,created_at) VALUES (?,?,?,?,1,?)",
      [propId, 'building', buildingId, now(), now()]);
  }
  // 同步坐落土地到該物件：先移除此物件舊的土地指派，再加入目前 pickedLands
  // （只動「由建物坐落帶入」的土地關聯，用 notes 標記來區分手動指派）
  run("DELETE FROM deed_assignments WHERE property_id=? AND deed_type='land' AND notes='auto_by_building' AND is_current=1", [propId]);
  pickedLands.forEach(l => {
    // 若該土地已在此物件（不論來源），就不重複加
    const exists = query("SELECT 1 FROM deed_assignments WHERE property_id=? AND deed_type='land' AND land_id=? AND is_current=1", [propId, l.land_id]);
    if (!exists.length) {
      run("INSERT INTO deed_assignments (property_id,deed_type,land_id,start_date,is_current,notes,created_at) VALUES (?,?,?,?,1,?,?)",
        [propId, 'land', l.land_id, now(), 'auto_by_building', now()]);
    }
  });
}
function deleteBuilding(id) {
  const r = query("SELECT building_number FROM buildings WHERE building_id=?", [id])[0];
  if (!confirm(`確定刪除建物權狀 ${r.building_number}？此動作無法復原。`)) return;
  run("DELETE FROM buildings WHERE building_id=?", [id]);
  run("DELETE FROM building_lands WHERE building_id=?", [id]);
  run("DELETE FROM deed_events WHERE deed_type='building' AND deed_id=?", [id]);
  run("DELETE FROM building_auxiliaries WHERE building_id=?", [id]);
  run("DELETE FROM common_areas WHERE building_id=?", [id]);
  run("DELETE FROM building_extra_areas WHERE building_id=?", [id]);
  autoSave(); toast('已刪除'); renderBuildingList();
}
/* 複製建物權狀：只帶基本資料，費用/日期不帶。附屬建物/共同使用部分一併複製 */
function duplicateBuilding(id) {
  const r = query("SELECT * FROM buildings WHERE building_id=?", [id])[0];
  if (!r) return;
  const preset = Object.assign({}, r);
  delete preset.building_id;
  ['building_number','title_deed_number',
   'acquisition_cost','fee_deed_tax','fee_gift_tax','fee_stamp_duty','fee_lawyer','fee_broker','fee_registration','fee_other',
   'acquired_at','disposed_at','disposal_type','completion_date'
  ].forEach(k => preset[k] = '');
  window.__bldPreset = preset;
  // 複製附屬建物與共同使用部分（不含坐落土地關聯，避免誤連）
  window.__bldPresetAux = query("SELECT aux_type,area_sqm,share_numerator,share_denominator FROM building_auxiliaries WHERE building_id=?", [id]);
  window.__bldPresetCommon = query("SELECT section_name,common_building_number,area_sqm,share_numerator,share_denominator FROM common_areas WHERE building_id=?", [id]);
  window.__bldPresetExtra = query("SELECT area_label,area_sqm FROM building_extra_areas WHERE building_id=?", [id]);
  openBuildingForm();
  toast('已複製，請填入新的建號與權狀字號');
}

/* ============================================================
   權狀明細頁（含生命週期事件）
   ============================================================ */
function openDeedDetail(type, id) {
  const tbl = type === 'land' ? 'lands' : 'buildings';
  const pk = type === 'land' ? 'land_id' : 'building_id';
  const r = query(`SELECT * FROM ${tbl} WHERE ${pk}=?`, [id])[0];
  if (!r) { toast('找不到權狀', true); return; }
  const events = query("SELECT * FROM deed_events WHERE deed_type=? AND deed_id=? ORDER BY event_date", [type, id]);

  const badge = type==='land' ? '<span class="badge land">土地</span>' : '<span class="badge building">建物</span>';
  const num = type==='land' ? r.land_number : r.building_number;
  const statusGroup = type==='land' ? 'land_status' : 'building_status';

  let cells = '';
  const add = (k,v) => cells += `<div class="cell"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  if (type === 'land') {
    add('權狀正本位置', esc(r.deed_physical_location)||'—');
    add('地號', `<span class="mono">${esc(r.land_number)}</span>`);
    add('地段', esc(r.section_name)||'—');
    add('地目', enumLabel('land_category',r.land_category) + (r.land_grade?` · ${esc(r.land_grade)}等則`:''));
    add('面積', `<span class="mono">${fmt(r.total_area_sqm)} ㎡</span>`);
    add('坪數', `<span class="mono">${sqm2ping(r.total_area_sqm)} 坪</span>`);
    add('取得成本', `<span class="mono">${fmt(r.acquisition_cost)}</span>`);
    { const fees = (r.fee_land_increment_tax||0)+(r.fee_gift_tax||0)+(r.fee_stamp_duty||0)+(r.fee_lawyer||0)+(r.fee_broker||0)+(r.fee_registration||0)+(r.fee_other||0);
      const total = (r.acquisition_cost||0) + fees;
      const feeDetail = [['土地增值稅',r.fee_land_increment_tax],['贈與稅',r.fee_gift_tax],['印花稅',r.fee_stamp_duty],['代書費',r.fee_lawyer],['仲介費',r.fee_broker],['登記規費',r.fee_registration],['其他',r.fee_other]].filter(x=>x[1]).map(x=>`${x[0]} ${fmt(x[1])}`).join('、');
      if (fees>0) add('取得費用', `<span class="mono">${fmt(fees)}</span>${feeDetail?`<br><span style="font-size:13px;color:var(--text-dim)">${feeDetail}</span>`:''}`);
      if (total>0) add('總投入成本', `<span class="mono" style="font-weight:700;color:var(--accent)">${fmt(total)}</span>`);
    }
    add('持分', (r.share_numerator&&r.share_denominator)?`<span class="mono">${r.share_numerator}/${r.share_denominator}</span>`:'全部（1/1）');
    add('登記日期', rocDate(r.acquired_at));
    add('狀態', `<span class="badge ${r.lifecycle_status}">${enumLabel('land_status',r.lifecycle_status)}</span>`);
    add('是否設定抵押', r.has_mortgage?'已設定':'無');
    add('權狀字號', `<span class="mono">${esc(r.title_deed_number)||'—'}</span>`);
    add('公告現值/㎡', `<span class="mono">${fmt(r.announced_value_per_sqm)}</span>`);
  } else {
    add('建號', `<span class="mono">${esc(r.building_number)}</span>`);
    add('權狀字號', `<span class="mono">${esc(r.title_deed_number)||'—'}</span>`);
    add('門牌', esc(r.door_address)||'—');
    add('型態', enumLabel('building_type',r.building_type) + (r.floor_located?` · ${esc(r.floor_located)}`:''));
    add('構造', esc(r.structure)||'—');
    add('建築完成', rocDate(r.completion_date));
    add('主建物', `<span class="mono">${fmt(r.main_area_sqm)} ㎡</span>`);
    // 其他面積項目（夾層等）
    const extraList = query("SELECT area_label, area_sqm FROM building_extra_areas WHERE building_id=?", [id]);
    if (extraList.length) {
      const extraStr = extraList.map(e => `${esc(e.area_label)||'其他'} ${fmt(e.area_sqm)}㎡`).join('<br>');
      add('其他面積', extraStr);
    }
    add('總登記面積', `<span class="mono">${fmt(r.total_registered_area_sqm)} ㎡（${sqm2ping(r.total_registered_area_sqm)} 坪）</span>`);
    add('取得成本', `<span class="mono">${fmt(r.acquisition_cost)}</span>`);
    { const fees = (r.fee_deed_tax||0)+(r.fee_gift_tax||0)+(r.fee_stamp_duty||0)+(r.fee_lawyer||0)+(r.fee_broker||0)+(r.fee_registration||0)+(r.fee_other||0);
      const total = (r.acquisition_cost||0) + fees;
      const feeDetail = [['契稅',r.fee_deed_tax],['贈與稅',r.fee_gift_tax],['印花稅',r.fee_stamp_duty],['代書費',r.fee_lawyer],['仲介費',r.fee_broker],['登記規費',r.fee_registration],['其他',r.fee_other]].filter(x=>x[1]).map(x=>`${x[0]} ${fmt(x[1])}`).join('、');
      if (fees>0) add('取得費用', `<span class="mono">${fmt(fees)}</span>${feeDetail?`<br><span style="font-size:13px;color:var(--text-dim)">${feeDetail}</span>`:''}`);
      if (total>0) add('總投入成本', `<span class="mono" style="font-weight:700;color:var(--accent)">${fmt(total)}</span>`);
    }
    add('登記日期', rocDate(r.acquired_at));
    add('權狀正本位置', esc(r.deed_physical_location)||'—');
    // 坐落地號（從關聯表，可點擊跳到土地權狀）
    const sittingLands = query("SELECT l.land_id, l.land_number FROM building_lands bl JOIN lands l ON l.land_id=bl.land_id WHERE bl.building_id=?", [id]);
    const landLinks = sittingLands.length ? sittingLands.map(l => `<a style="color:var(--accent);cursor:pointer" onclick="openDeedDetail('land',${l.land_id})">${esc(l.land_number)}</a>`).join('、') : '—';
    add('坐落地號', landLinks);
    // 附屬建物
    const auxList = query("SELECT aux_type, area_sqm, share_numerator, share_denominator FROM building_auxiliaries WHERE building_id=?", [id]);
    const auxStr = auxList.length ? auxList.map(a => `${enumLabel('aux_type',a.aux_type)} ${fmt(a.area_sqm)}㎡${(a.share_numerator&&a.share_denominator)?`（${a.share_numerator}/${a.share_denominator}）`:''}`).join('<br>') : '—';
    add('附屬建物', auxStr);
    // 共同使用部分
    const comList = query("SELECT section_name, common_building_number, area_sqm, share_numerator, share_denominator FROM common_areas WHERE building_id=?", [id]);
    const comStr = comList.length ? comList.map(c => `${esc(c.section_name)||''} ${esc(c.common_building_number)||''}建號 ${fmt(c.area_sqm)}㎡${(c.share_numerator&&c.share_denominator)?` 權利範圍${c.share_numerator}/${c.share_denominator}`:''}`).join('<br>') : '—';
    add('共同使用部分', comStr);
  }

  let evHtml = '';
  if (events.length === 0) {
    evHtml = `<div class="page-desc" style="padding:8px 0">尚無生命週期事件</div>`;
  } else {
    evHtml = '<div class="timeline">';
    events.forEach(e => {
      const amt = e.amount ? ` · ${fmt(e.amount)}` : '';
      evHtml += `<div class="tl-item"><div class="date">${rocShort(e.event_date)}</div><div class="ev">${esc(e.description)}${amt} <span class="badge" style="background:var(--surface-2);color:var(--text-dim);font-size:13px">${enumLabel('event_kind',e.event_kind)}</span></div></div>`;
    });
    evHtml += '</div>';
  }

  $('#deedDetail').innerHTML = `
    <button class="back-link" onclick="showPage('${type==='land'?'lands':'buildings'}')">← 返回${type==='land'?'土地':'建物'}權狀</button>
    <h2 class="page-title">${badge} ${esc(num)}</h2>
    <div class="page-desc">生命週期狀態：<span class="badge ${r.lifecycle_status}">${enumLabel(statusGroup,r.lifecycle_status)}</span></div>
    <div class="card"><div class="card-head"><h3>權狀資料</h3>
      <button class="btn ghost" onclick="${type==='land'?`openLandForm(${id})`:`openBuildingForm(${id})`}">編輯</button></div>
      <div style="padding:0"><div class="detail-grid">${cells}</div></div>
    </div>
    <div class="card"><div class="card-head"><h3>生命週期事件</h3>
      <button class="btn ghost" onclick="openEventForm('${type}',${id})">+ 新增事件</button></div>
      <div style="padding:18px">${evHtml}</div>
    </div>
    <div class="note">💡 這張權狀有自己獨立的生命週期。將來接上「物件 / 買賣 / 借款」模組後，這裡會自動顯示相關的抵押設定、買賣交易等事件。</div>`;

  document.querySelectorAll('.page').forEach(p => p.classList.toggle('active', p.id === 'deedDetail'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $('#crumb').innerHTML = `${type==='land'?'土地權狀':'建物權狀'} / <b>權狀明細</b>`;
  window.scrollTo(0,0);
}

/* ---------- 生命週期事件表單 ---------- */
function openEventForm(type, deedId) {
  openModal(`
    <div class="modal-head"><h3>新增生命週期事件</h3><button class="x" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
      ${fieldText('event_date','日期',now(),{type:'date',req:true})}
      ${fieldSelect('event_kind','事件類型','event_kind','other')}
      ${fieldText('description','說明',' ',{full:true,ph:'例：設定抵押權給合庫'})}
      ${fieldText('amount','金額（選填）','',{type:'number'})}
    </div></div>
    <div class="modal-foot"><span></span>
      <div><button class="btn ghost" onclick="closeModal()">取消</button>
      <button class="btn" onclick="saveEvent('${type}',${deedId})">儲存</button></div>
    </div>`);
}
function saveEvent(type, deedId) {
  const f = readForm();
  if (!f.event_date) { toast('日期為必填', true); return; }
  run("INSERT INTO deed_events (deed_type,deed_id,event_date,event_kind,description,amount,created_at) VALUES (?,?,?,?,?,?,?)",
    [type, deedId, f.event_date, f.event_kind, f.description||'', f.amount||null, now()]);
  autoSave(); closeModal(); toast('已新增事件'); openDeedDetail(type, deedId);
}

/* ============================================================
   範例資料
   ============================================================ */
function seedData() {
  if (query("SELECT COUNT(*) c FROM lands")[0].c > 0 || query("SELECT COUNT(*) c FROM buildings")[0].c > 0) {
    if (!confirm('目前已有資料，載入範例會「新增」幾筆示範資料（不會刪除現有）。繼續？')) return;
  }
  const t = now();
  // 三筆土地（公寓基地持分）
  [['0512-0000','大安段三小段','建',486.30,152,10000,328000,'2019-03-15','purchase',null],
   ['0513-0000','大安段三小段','建',312.55,152,10000,328000,'2019-03-15','purchase',null],
   ['0145-0000','中壢中央段','建',330.00,1,1,null,'2018-04-12','purchase',9800000]
  ].forEach(d => {
    run(`INSERT INTO lands (land_number,section_name,land_category,total_area_sqm,share_numerator,share_denominator,announced_value_per_sqm,acquired_at,acquisition_type,acquisition_cost,county,district,lifecycle_status,deed_physical_location,has_mortgage,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,'held',?,?,?,?)`,
      [d[0],d[1],d[2],d[3],d[4],d[5],d[6],d[7],d[8],d[9],'','','保險箱A-3',1,t,t]);
  });
  // 兩筆建物
  run(`INSERT INTO buildings (building_number,door_address,building_type,structure,total_floors,floor_located,completion_date,usage_registered,main_area_sqm,auxiliary_area_sqm,common_area_sqm,total_registered_area_sqm,acquired_at,acquisition_type,acquisition_cost,lifecycle_status,deed_physical_location,has_mortgage,section_name,created_at,updated_at)
    VALUES ('02841-000','台北市大安區大安路一段××號5樓','elevator_building','鋼筋混凝土造',12,'五層','2015-08-01','住家用',78.42,9.86,19.24,107.52,'2019-03-15','purchase',21800000,'held','保險箱A-3',1,'大安段三小段',?,?)`,[t,t]);
  run(`INSERT INTO buildings (building_number,door_address,building_type,structure,total_floors,floor_located,completion_date,usage_registered,main_area_sqm,total_registered_area_sqm,acquired_at,acquisition_type,acquisition_cost,lifecycle_status,deed_physical_location,section_name,created_at,updated_at)
    VALUES ('00872-000','桃園市中壢區中央路××號','townhouse','鋼筋混凝土造',4,'全棟','2021-03-20','住家用',180.50,226.00,'2021-03-20','self_build',12700000,'held','保險箱A-5','中壢中央段',?,?)`,[t,t]);

  // 幾筆生命週期事件
  const land1 = query("SELECT land_id FROM lands WHERE land_number='0512-0000'")[0].land_id;
  run("INSERT INTO deed_events (deed_type,deed_id,event_date,event_kind,description,created_at) VALUES ('land',?,?,?,?,?)",[land1,'2019-03-15','acquire','買賣取得登記',t]);
  run("INSERT INTO deed_events (deed_type,deed_id,event_date,event_kind,description,created_at) VALUES ('land',?,?,?,?,?)",[land1,'2019-03-15','mortgage','設定抵押權給合作金庫（與建物一併）',t]);
  const bld1 = query("SELECT building_id FROM buildings WHERE building_number='02841-000'")[0].building_id;
  run("INSERT INTO deed_events (deed_type,deed_id,event_date,event_kind,description,amount,created_at) VALUES ('building',?,?,?,?,?,?)",[bld1,'2019-05-20','improvement','裝潢',850000,t]);
  run("INSERT INTO deed_events (deed_type,deed_id,event_date,event_kind,description,amount,created_at) VALUES ('building',?,?,?,?,?,?)",[bld1,'2024-11-03','improvement','浴室翻新',120000,t]);

  // 物件：把大安路的權狀組成一個物件
  run(`INSERT INTO properties (property_code,name,door_address,property_type,usage_type,current_status,owner_name,created_at,updated_at)
    VALUES ('P-0001','大安路A棟5F','台北市大安區大安路一段××號5樓','land_and_building','residential','rented','老闆',?,?)`,[t,t]);
  const prop1 = query("SELECT property_id FROM properties WHERE property_code='P-0001'")[0].property_id;
  // 指派 0512、0513 兩筆土地 + 02841 建物到此物件
  ['0512-0000','0513-0000'].forEach(num => {
    const lid = query("SELECT land_id FROM lands WHERE land_number=?",[num])[0];
    if (lid) run("INSERT INTO deed_assignments (property_id,deed_type,land_id,start_date,is_current,created_at) VALUES (?,?,?,?,1,?)",[prop1,'land',lid.land_id,'2019-03-15',t]);
  });
  run("INSERT INTO deed_assignments (property_id,deed_type,building_id,start_date,is_current,created_at) VALUES (?,?,?,?,1,?)",[prop1,'building',bld1,'2019-03-15',t]);

  // 買賣交易：2019 買進，含金流
  run(`INSERT INTO transactions (property_id,transaction_type,transaction_status,counterparty_name,broker_name,broker_fee,lawyer_name,agreed_price,contracted_at,title_transferred_at,handover_at,created_at,updated_at)
    VALUES (?,'purchase','completed','賣方陳先生','大誠房屋',436000,'王代書',21800000,'2019-02-10','2019-03-15','2019-04-01',?,?)`,[prop1,t,t]);
  const txn1 = query("SELECT transaction_id FROM transactions WHERE property_id=?",[prop1])[0].transaction_id;
  [['2019-02-10','out','deposit',2180000,'賣方陳先生'],
   ['2019-03-01','out','second_payment',2180000,'賣方陳先生'],
   ['2019-03-15','out','deed_tax',95000,'稅捐處'],
   ['2019-03-15','out','lawyer_fee',45000,'王代書'],
   ['2019-04-01','out','final_payment',17440000,'賣方陳先生'],
   ['2019-04-01','out','broker_fee',436000,'大誠房屋']
  ].forEach(c => run("INSERT INTO cashflows (transaction_id,property_id,flow_date,direction,category,amount,counterparty,created_at) VALUES (?,?,?,?,?,?,?,?)",[txn1,prop1,c[0],c[1],c[2],c[3],c[4],t]));

  // 貸款：合庫房貸 + 兩期繳款
  run(`INSERT INTO loans (property_id,loan_code,collateral_scope,bank_name,branch,loan_type,approved_amount,approved_ratio,interest_rate,rate_type,base_rate_name,rate_adjustment,term_months,grace_period_months,current_principal,repayment_method,repayment_day,mortgage_amount,disbursed_at,grace_period_end_at,maturity_at,status,created_at,updated_at)
    VALUES (?,'L-0001','land_and_building','合作金庫','大安分行','mortgage',15000000,70,2.15,'floating','郵儲二年期',0.59,360,36,11200000,'equal_payment',5,18000000,'2019-03-15','2022-03-15','2049-03-15','active',?,?)`,[prop1,t,t]);
  const loan1 = query("SELECT loan_id FROM loans WHERE loan_code='L-0001'")[0].loan_id;
  [[82,'2026-04-05',42710,20130,62840,11242710,'paid'],
   [83,'2026-05-05',42786,20054,62840,11199924,'paid']
  ].forEach(p => run("INSERT INTO loan_payments (loan_id,period_no,due_date,principal_amount,interest_amount,total_amount,principal_balance_after,payment_status,created_at) VALUES (?,?,?,?,?,?,?,?,?)",[loan1,p[0],p[1],p[2],p[3],p[4],p[5],p[6],t]));

  autoSave(); toast('已載入範例資料'); showPage('dashboard');
}
