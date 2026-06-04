/* ============================================================
   擴充模組：不動產物件 / 買賣交易(含金流) / 銀行借貸(含繳款)
   ============================================================ */

/* 依「建物坐落地號」重建所有不動產物件：
   - 每個建物 + 它坐落的土地 = 一個物件
   - 沒有任何建物坐落的土地，各自成為一個純土地物件 */
function rebuildProperties(silent) {
  if (!silent && !confirm('將依「建物坐落地號」重新整理不動產物件：\n\n• 坐落在相同土地的建物，會併成同一個物件（土地一筆、建物多筆）\n• 沒有建物的土地＝各自一個物件\n\n會重建物件清單（不影響土地、建物權狀本身）。確定嗎？')) return;
  run("DELETE FROM properties");
  run("DELETE FROM deed_assignments");
  const usedLand = {};
  const blds = query("SELECT building_id, building_number, door_address FROM buildings WHERE lifecycle_status='held' ORDER BY building_number");

  // 依「坐落土地組合」分群：key = 排序後的 land_id 清單
  const groups = {};  // key -> { landIds:[], buildingIds:[] }
  blds.forEach(b => {
    const lids = query("SELECT land_id FROM building_lands WHERE building_id=? ORDER BY land_id", [b.building_id]).map(r => r.land_id);
    const key = lids.length ? lids.join('-') : ('nobuildingland_' + b.building_id); // 沒坐落地的建物各自成群
    if (!groups[key]) groups[key] = { landIds: lids, buildingIds: [] };
    groups[key].buildingIds.push(b.building_id);
  });

  // 每群建一個物件
  Object.keys(groups).forEach(key => {
    const g = groups[key];
    // 物件名稱：用第一棟建物的門牌，沒有就用建號
    const firstB = query("SELECT building_number, door_address FROM buildings WHERE building_id=?", [g.buildingIds[0]])[0];
    let name = firstB.door_address || ('建號 ' + firstB.building_number);
    if (g.buildingIds.length > 1) name += ` 等${g.buildingIds.length}筆`;
    run("INSERT INTO properties (name,door_address,property_type,current_status,created_at,updated_at) VALUES (?,?,?,?,?,?)",
      [name, firstB.door_address||null, 'land_and_building', 'self_use', now(), now()]);
    const pid = query("SELECT last_insert_rowid() AS id")[0].id;
    // 指派建物（多筆）
    g.buildingIds.forEach(bid => {
      run("INSERT INTO deed_assignments (property_id,deed_type,building_id,start_date,is_current,created_at) VALUES (?,?,?,?,1,?)",
        [pid, 'building', bid, now(), now()]);
    });
    // 指派土地（共用的那些）
    g.landIds.forEach(lid => {
      run("INSERT INTO deed_assignments (property_id,deed_type,land_id,start_date,is_current,notes,created_at) VALUES (?,?,?,?,1,?,?)",
        [pid, 'land', lid, now(), 'auto_by_building', now()]);
      usedLand[lid] = true;
    });
  });

  // 沒被任何建物坐落的土地，各自成純土地物件
  const lands = query("SELECT land_id, land_number, section_name FROM lands WHERE lifecycle_status='held' ORDER BY section_name, land_number");
  lands.forEach(l => {
    if (usedLand[l.land_id]) return;
    const name = ((l.section_name||'')+' '+(l.land_number||'')).trim() || ('地號'+l.land_id);
    run("INSERT INTO properties (name,property_type,current_status,created_at,updated_at) VALUES (?,?,?,?,?)",
      [name, 'land', 'self_use', now(), now()]);
    const pid = query("SELECT last_insert_rowid() AS id")[0].id;
    run("INSERT INTO deed_assignments (property_id,deed_type,land_id,start_date,is_current,created_at) VALUES (?,?,?,?,1,?)",
      [pid, 'land', l.land_id, now(), now()]);
  });
  autoSave();
  if (!silent) { toast('已重新整理不動產物件'); showPage('dashboard'); }
}

/* ====================== 不動產物件 ====================== */
function renderPropertyList() {
  const rows = query("SELECT * FROM properties ORDER BY property_id DESC");
  let html = `<h2 class="page-title">不動產物件</h2>
    <div class="page-desc">把權狀組成可操作的物件 · 買賣與借款都掛在物件上</div>
    <div class="toolbar"><button class="btn" style="margin-left:auto" onclick="openPropertyForm()">+ 新增物件</button></div>`;
  if (rows.length === 0) {
    html += `<div class="card"><div class="empty"><div class="big">⌂</div>尚無物件<br><br><button class="btn" onclick="openPropertyForm()">+ 新增第一個物件</button></div></div>`;
  } else {
    html += `<div class="card"><table><thead><tr><th>編號</th><th>名稱</th><th>地址</th><th>類型</th><th>組成權狀</th><th>狀態</th><th></th></tr></thead><tbody>`;
    rows.forEach(r => {
      const deeds = query("SELECT deed_type FROM deed_assignments WHERE property_id=? AND is_current=1", [r.property_id]);
      const nL = deeds.filter(d=>d.deed_type==='land').length, nB = deeds.filter(d=>d.deed_type==='building').length;
      html += `<tr class="clickable" onclick="openPropDetail(${r.property_id})">
        <td class="mono">${esc(r.property_code)||'P-'+r.property_id}</td>
        <td>${esc(r.name)||'—'}</td>
        <td>${esc(r.door_address)||'—'}</td>
        <td>${enumLabel('property_type',r.property_type)}</td>
        <td>地${nL} · 建${nB}</td>
        <td><span class="badge ${r.current_status==='rented'||r.current_status==='self_use'?'held':r.current_status==='sold'?'sold':'split'}">${enumLabel('property_status',r.current_status)}</span></td>
        <td onclick="event.stopPropagation()"><div class="row-actions">
          <button class="icon-btn" onclick="openPropertyForm(${r.property_id})">編輯</button>
          <button class="icon-btn del" onclick="deleteProperty(${r.property_id})">刪除</button>
        </div></td></tr>`;
    });
    html += `</tbody></table></div>`;
  }
  $('#properties').innerHTML = html;
}

function openPropertyForm(id) {
  const r = id ? query("SELECT * FROM properties WHERE property_id=?", [id])[0] : {};
  openModal(`
    <div class="modal-head"><h3>${id?'編輯':'新增'}不動產物件</h3><button class="x" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
      ${fieldText('property_code','物件編號',r.property_code,{ph:'P-0001'})}
      ${fieldText('name','物件名稱',r.name,{ph:'大安路A棟5F'})}
      ${fieldText('door_address','門牌地址',r.door_address,{full:true})}
      ${fieldSelect('property_type','物件類型','property_type',r.property_type)}
      ${fieldSelect('usage_type','使用類型','usage_type',r.usage_type)}
      ${fieldSelect('current_status','目前狀態','property_status',r.current_status||'self_use')}
      ${fieldText('owner_name','所有權人',r.owner_name)}
      ${fieldText('notes','備註',r.notes,{full:true})}
    </div></div>
    <div class="modal-foot"><span></span><div>
      <button class="btn ghost" onclick="closeModal()">取消</button>
      <button class="btn" onclick="saveProperty(${id||0})">儲存</button></div></div>`);
}
function saveProperty(id) {
  const f = readForm();
  if (!f.name) { toast('物件名稱為必填', true); return; }
  const cols = ['property_code','name','door_address','property_type','usage_type','current_status','owner_name','notes'];
  const vals = cols.map(c => f[c]||null);
  if (id) run(`UPDATE properties SET ${cols.map(c=>c+'=?').join(',')},updated_at=? WHERE property_id=?`, [...vals, now(), id]);
  else run(`INSERT INTO properties (${cols.join(',')},created_at,updated_at) VALUES (${cols.map(()=>'?').join(',')},?,?)`, [...vals, now(), now()]);
  autoSave(); closeModal(); toast(id?'已更新':'已新增物件'); renderPropertyList();
}
function deleteProperty(id) {
  if (!confirm('確定刪除此物件？（不會刪除底層權狀，但會解除權狀與此物件的歸屬關係）')) return;
  run("DELETE FROM properties WHERE property_id=?", [id]);
  run("DELETE FROM deed_assignments WHERE property_id=?", [id]);
  autoSave(); toast('已刪除'); renderPropertyList();
}

/* 物件明細：組成權狀 + 買賣 + 借款 */
function openPropDetail(id) {
  const p = query("SELECT * FROM properties WHERE property_id=?", [id])[0];
  if (!p) { toast('找不到物件', true); return; }
  const assigns = query("SELECT * FROM deed_assignments WHERE property_id=? AND is_current=1", [id]);
  const txns = query("SELECT * FROM transactions WHERE property_id=? ORDER BY transaction_id DESC", [id]);
  const loans = query("SELECT * FROM loans WHERE property_id=? ORDER BY loan_id DESC", [id]);
  const valuations = query("SELECT * FROM property_valuations WHERE property_id=? ORDER BY valuation_date DESC, valuation_id DESC", [id]);

  let deedRows = '';
  assigns.forEach(a => {
    if (a.deed_type === 'land') {
      const l = query("SELECT * FROM lands WHERE land_id=?", [a.land_id])[0];
      if (l) deedRows += `<tr class="clickable" onclick="openDeedDetail('land',${l.land_id})"><td><span class="badge land">土地</span></td><td class="mono">${esc(l.land_number)}</td><td>${esc(l.section_name)||'—'}</td><td onclick="event.stopPropagation()"><button class="icon-btn del" onclick="unassignDeed(${a.assignment_id},${id})">移除</button></td></tr>`;
    } else {
      const b = query("SELECT * FROM buildings WHERE building_id=?", [a.building_id])[0];
      if (b) deedRows += `<tr class="clickable" onclick="openDeedDetail('building',${b.building_id})"><td><span class="badge building">建物</span></td><td class="mono">${esc(b.building_number)}</td><td>${esc(b.door_address)||'—'}</td><td onclick="event.stopPropagation()"><button class="icon-btn del" onclick="unassignDeed(${a.assignment_id},${id})">移除</button></td></tr>`;
    }
  });
  if (!deedRows) deedRows = `<tr><td colspan="4" style="color:var(--text-dim)">尚未指派任何權狀</td></tr>`;

  let txnRows = '';
  txns.forEach(t => txnRows += `<tr class="clickable" onclick="openTxnDetail(${t.transaction_id})"><td>${enumLabel('txn_type',t.transaction_type)}</td><td>${esc(t.counterparty_name)||'—'}</td><td class="mono right">${fmt(t.agreed_price)}</td><td><span class="badge ${t.transaction_status==='completed'?'held':'split'}">${enumLabel('txn_status',t.transaction_status)}</span></td></tr>`);
  if (!txnRows) txnRows = `<tr><td colspan="4" style="color:var(--text-dim)">尚無買賣交易</td></tr>`;

  let loanRows = '';
  loans.forEach(l => loanRows += `<tr class="clickable" onclick="openLoanDetail(${l.loan_id})"><td>${esc(l.bank_name)||'—'}</td><td>${enumLabel('loan_type',l.loan_type)}</td><td class="mono right">${fmt(l.current_principal)}</td><td><span class="badge ${l.status==='active'?'held':'sold'}">${enumLabel('loan_status',l.status)}</span></td></tr>`);
  if (!loanRows) loanRows = `<tr><td colspan="4" style="color:var(--text-dim)">尚無貸款</td></tr>`;

  $('#propDetail').innerHTML = `
    <button class="back-link" onclick="showPage('properties')">← 返回物件列表</button>
    <h2 class="page-title">${esc(p.name)}</h2>
    <div class="page-desc">${esc(p.property_code)||''} · ${esc(p.door_address)||''} · <span class="badge ${p.current_status==='sold'?'sold':'held'}">${enumLabel('property_status',p.current_status)}</span></div>

    <div class="card"><div class="card-head"><h3>① 組成權狀</h3><button class="btn ghost" onclick="openAssignForm(${id})">+ 指派權狀</button></div>
      <table><tbody>${deedRows}</tbody></table></div>

    <div class="card"><div class="card-head"><h3>② 買賣交易</h3><button class="btn ghost" onclick="openTxnForm(0,${id})">+ 新增交易</button></div>
      <table><tbody>${txnRows}</tbody></table></div>

    <div class="card"><div class="card-head"><h3>③ 銀行借貸</h3><button class="btn ghost" onclick="openLoanForm(0,${id})">+ 新增貸款</button></div>
      <table><tbody>${loanRows}</tbody></table></div>

    <div class="card"><div class="card-head"><h3>④ 物件價值</h3>
      ${valuations[0]?`<span style="color:var(--accent);font-weight:700;font-size:18px">$${fmt(valuations[0].market_value)}</span><span style="color:var(--text-dim);font-size:13px">（${esc(valuations[0].valuation_date||'')}　${enumLabel('valuation_source',valuations[0].source)||''}）</span>`:'<span style="color:var(--text-dim)">尚未評估</span>'}
      <button class="btn ghost" style="margin-left:auto" onclick="showPage('valuations')">→ 進入物件價值</button>
      <button class="btn" onclick="openValuationForm(${id})">+ 新增評估</button></div>
      ${valuations.length?`<table><thead><tr><th>日期</th><th>來源</th><th class="right">市值</th><th class="right">每坪</th><th>附註</th></tr></thead><tbody>${valuations.slice(0,5).map(v=>`<tr><td class="mono">${esc(v.valuation_date)||'—'}</td><td>${enumLabel('valuation_source',v.source)||'—'}</td><td class="mono right"><b>$${fmt(v.market_value)}</b></td><td class="mono right">${v.price_per_ping?'$'+fmt(v.price_per_ping):'—'}</td><td style="font-size:13px;color:var(--text-dim)">${esc(v.notes)||''}</td></tr>`).join('')}</tbody></table>${valuations.length>5?`<div style="text-align:right;padding:8px;color:var(--text-dim);font-size:13px">僅顯示最近 5 筆，完整紀錄請至「物件價值」頁</div>`:''}`:'<div style="padding:14px;color:var(--text-dim);text-align:center">尚無評估記錄</div>'}
    </div>`;

  document.querySelectorAll('.page').forEach(x => x.classList.toggle('active', x.id === 'propDetail'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $('#crumb').innerHTML = '不動產物件 / <b>物件明細</b>';
  window.scrollTo(0,0);
}

/* 指派權狀到物件 */
function openAssignForm(propId) {
  const lands = query("SELECT land_id, land_number FROM lands WHERE lifecycle_status='held'");
  const bld = query("SELECT building_id, building_number FROM buildings WHERE lifecycle_status='held'");
  let opts = '<option value="">— 選擇權狀 —</option>';
  lands.forEach(l => opts += `<option value="land:${l.land_id}">土地 ${esc(l.land_number)}</option>`);
  bld.forEach(b => opts += `<option value="building:${b.building_id}">建物 ${esc(b.building_number)}</option>`);
  openModal(`
    <div class="modal-head"><h3>指派權狀到物件</h3><button class="x" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="field full"><label>選擇要納入此物件的權狀 <span class="req">*</span></label><select name="deed_pick">${opts}</select></div>
      ${fieldText('start_date','歸屬起始日',now(),{type:'date'})}
    </div></div>
    <div class="modal-foot"><span></span><div>
      <button class="btn ghost" onclick="closeModal()">取消</button>
      <button class="btn" onclick="saveAssign(${propId})">指派</button></div></div>`);
}
function saveAssign(propId) {
  const f = readForm();
  if (!f.deed_pick) { toast('請選擇權狀', true); return; }
  const [type, did] = f.deed_pick.split(':');
  run("INSERT INTO deed_assignments (property_id,deed_type,land_id,building_id,start_date,is_current,created_at) VALUES (?,?,?,?,?,1,?)",
    [propId, type, type==='land'?did:null, type==='building'?did:null, f.start_date||now(), now()]);
  autoSave(); closeModal(); toast('已指派'); openPropDetail(propId);
}
function unassignDeed(assignId, propId) {
  if (!confirm('解除這張權狀與此物件的歸屬？（不會刪除權狀本身）')) return;
  run("UPDATE deed_assignments SET is_current=0, end_date=? WHERE assignment_id=?", [now(), assignId]);
  autoSave(); toast('已解除歸屬'); openPropDetail(propId);
}

/* ====================== 物件價值（市值評估） ====================== */
function renderValuationList() {
  const props = query("SELECT property_id, name, door_address FROM properties ORDER BY property_id");
  const aprCount = query("SELECT COUNT(*) c FROM actual_price_records")[0].c;
  let html = `<h2 class="page-title">物件價值</h2>
    <div class="page-desc">記錄各物件的市值評估、實價登錄參考、仲介估價等，方便買賣談價時調出資料。</div>
    <div class="toolbar" style="margin-bottom:14px">
      <button class="btn" onclick="importActualPriceCSV()">📥 匯入內政部實價登錄 CSV</button>
      ${aprCount?`<span style="color:var(--text-dim);margin-left:8px">已有 ${aprCount} 筆實價登錄參考資料</span><button class="btn ghost" onclick="clearActualPriceRecords()">🗑 清空實登資料</button>`:''}
    </div>
    <div class="note" style="background:#fef3c7;border-color:#fde68a;color:#92400e;margin-bottom:14px">
      💡 提示：系統無法自動抓市價。請先到內政部下載 CSV、或從實價登錄/591 查到資料後手動填入。<br>
      📥 匯入 CSV 時可輸入「地段關鍵字」（例：國富、花蓮市）只匯入相關區域，避免資料過多。
    </div>`;
  if (!props.length) {
    html += `<div class="note">尚無物件。請先到「不動產物件」或在總覽按「↻ 重新整理物件」建立物件。</div>`;
    $('#valuations').innerHTML = html;
    return;
  }
  props.forEach(p => {
    const vs = query("SELECT * FROM property_valuations WHERE property_id=? ORDER BY valuation_date DESC, valuation_id DESC", [p.property_id]);
    const propFull = query("SELECT * FROM properties WHERE property_id=?", [p.property_id])[0];
    const addr = p.door_address || p.name;
    const enc = encodeURIComponent(addr);
    html += `<div class="card" style="margin-bottom:14px">
      <div class="card-head">
        <h3>${esc(p.name)}</h3>
        ${propFull.suggested_price?`<span style="color:#7c3aed;font-weight:700;font-size:18px">建議售價 $${fmt(propFull.suggested_price)}</span>${propFull.suggested_price_notes?`<span style="color:var(--text-dim);font-size:13px">（${esc(propFull.suggested_price_notes)}）</span>`:''}`:'<span style="color:var(--text-dim);font-size:14px">尚未設定建議售價</span>'}
        <button class="btn ghost" style="margin-left:auto" onclick="openSuggestedPriceForm(${p.property_id})">${propFull.suggested_price?'✏ 編輯建議售價':'💰 設定建議售價'}</button>
        <button class="btn" onclick="openValuationForm(${p.property_id})">+ 新增成交參考</button>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;padding:0 4px 10px">
        <a class="btn ghost" target="_blank" href="https://lvr.land.moi.gov.tw/jsp/list.jsp">🔍 實價登錄</a>
        <a class="btn ghost" target="_blank" href="https://www.591.com.tw/?keyword=${enc}">🔍 591</a>
        <a class="btn ghost" target="_blank" href="https://www.sinyi.com.tw/buy/list/${enc}">🔍 信義房屋</a>
        <a class="btn ghost" target="_blank" href="https://buy.yungching.com.tw/region/${enc}">🔍 永慶房屋</a>
        <a class="btn ghost" target="_blank" href="https://www.google.com/search?q=${enc}+實價登錄">🔍 Google 搜尋</a>
      </div>`;
    if (vs.length) {
      html += `<table style="font-size:13px"><thead><tr><th>成交日</th><th>來源</th><th>地址</th><th>型態</th><th>樓層</th><th>屋齡</th><th>格局</th><th>車位</th><th class="right">主建物㎡</th><th class="right">附屬㎡</th><th class="right">共用㎡</th><th class="right">車位㎡</th><th class="right">總面積㎡</th><th class="right">總價</th><th class="right">每坪</th><th class="right">車位價</th><th>備註</th><th>照片</th><th></th></tr></thead><tbody>`;
      vs.forEach(v => {
        const thumb = v.photo ? `<img src="data:image/jpeg;base64,${v.photo}" style="width:42px;height:42px;object-fit:cover;border-radius:4px;cursor:pointer" onclick="event.stopPropagation();showPhotoFull(${v.valuation_id})">` : '—';
        html += `<tr>
          <td class="mono">${esc(v.valuation_date)||'—'}</td>
          <td>${enumLabel('valuation_source',v.source)||'—'}${v.source_url?` <a href="${esc(v.source_url)}" target="_blank" style="font-size:12px">[連結]</a>`:''}</td>
          <td style="max-width:200px;font-size:12px">${esc(v.ref_address)||'—'}</td>
          <td>${esc(v.ref_building_type)||'—'}</td>
          <td>${esc(v.ref_floor)||'—'}</td>
          <td class="mono right">${v.ref_age?v.ref_age+'年':'—'}</td>
          <td>${esc(v.ref_rooms)||'—'}</td>
          <td>${esc(v.ref_parking)||'—'}</td>
          <td class="mono right">${v.main_area_ping?v.main_area_ping:'—'}</td>
          <td class="mono right">${v.aux_area_ping?v.aux_area_ping:'—'}</td>
          <td class="mono right">${v.common_area_ping?v.common_area_ping:'—'}</td>
          <td class="mono right">${v.parking_area_ping?v.parking_area_ping:'—'}</td>
          <td class="mono right"><b>${v.total_area_ping?v.total_area_ping:'—'}</b></td>
          <td class="mono right"><b>$${fmt(v.market_value)}</b></td>
          <td class="mono right">${v.price_per_ping?'$'+fmt(v.price_per_ping):'—'}</td>
          <td class="mono right">${v.parking_price?'$'+fmt(v.parking_price):'—'}</td>
          <td style="font-size:12px;color:var(--text-dim);max-width:160px">${esc(v.notes)||''}</td>
          <td>${thumb}</td>
          <td><div class="row-actions"><button class="icon-btn" onclick="openValuationForm(${p.property_id},${v.valuation_id})">編輯</button><button class="icon-btn del" onclick="deleteValuation(${v.valuation_id})">刪除</button></div></td>
        </tr>`;
      });
      html += `</tbody></table>`;
    } else {
      html += `<div style="padding:14px;color:var(--text-dim);text-align:center">尚無成交參考記錄</div>`;
    }
    // 鄰近實價登錄參考：抓地址含此物件門牌關鍵字（取門牌前幾個字）
    if (aprCount) {
      const addr = p.door_address || p.name || '';
      // 取地址前4-6字當關鍵字（如「花蓮市國富」），擷取到第一個數字之前
      let kw = addr.replace(/[0-9０-９]+.*/,'').trim();
      if (kw.length >= 3) {
        const aprs = query("SELECT * FROM actual_price_records WHERE address LIKE ? OR district LIKE ? ORDER BY transaction_date DESC LIMIT 10", ['%'+kw+'%','%'+kw+'%']);
        if (aprs.length) {
          html += `<div style="margin:8px 14px 4px;padding:8px 12px;background:#eff6ff;border-radius:6px;font-size:13px;color:#1e40af">
            🔍 鄰近實價登錄參考（地址含「${esc(kw)}」共 ${aprs.length} 筆，顯示最新10筆）
          </div>
          <table style="font-size:12.5px"><thead><tr><th>交易日</th><th>地址</th><th>型態</th><th class="right">總價</th><th class="right">每坪</th><th>建坪</th><th>樓層</th><th>屋齡</th><th>房廳衛</th></tr></thead><tbody>`;
          aprs.forEach(a => {
            html += `<tr>
              <td class="mono">${esc(a.transaction_date)||'—'}</td>
              <td>${esc(a.address)||'—'}</td>
              <td>${esc(a.building_type)||'—'}</td>
              <td class="mono right"><b>$${fmt(a.total_price)}</b></td>
              <td class="mono right">${a.unit_price_per_ping?'$'+fmt(a.unit_price_per_ping):'—'}</td>
              <td class="mono">${a.building_area_sqm?(a.building_area_sqm*0.3025).toFixed(2)+'坪':'—'}</td>
              <td>${esc(a.floor_info)||'—'}</td>
              <td>${a.age?a.age+'年':'—'}</td>
              <td>${esc(a.rooms)||'—'}</td>
            </tr>`;
          });
          html += `</tbody></table>`;
        }
      }
    }
    html += `</div>`;
  });
  $('#valuations').innerHTML = html;
}
function openValuationForm(propId, vid) {
  const v = vid ? query("SELECT * FROM property_valuations WHERE valuation_id=?", [vid])[0] : {};
  const p = query("SELECT * FROM properties WHERE property_id=?", [propId])[0];
  const photoSrc = v.photo ? `data:image/jpeg;base64,${v.photo}` : '';
  openModal(`
    <div class="modal-head"><h3>${vid?'編輯':'新增'}成交參考 · ${esc(p.name)}</h3><button class="x" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="field full" style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:10px">
        <label style="color:#1e40af">📋 貼上文字自動填入（樂屋網／實價登錄／591 複製貼上）</label>
        <textarea id="autoParseText" rows="4" placeholder="例：&#10;114/06 華廈&#10;花蓮市國富十一街32號2樓之2&#10;488 萬  25 萬/坪&#10;主建物 19.49坪  附屬 1.2坪  共用 3.5坪&#10;車位 8坪  車位 80萬" style="width:100%;padding:10px;border:1px solid var(--border);border-radius:6px;font-size:14px;font-family:inherit;background:white"></textarea>
        <button type="button" class="btn" style="margin-top:8px" onclick="parseAndFillValuation()">✨ 解析並填入下方欄位</button>
        <div class="hint" style="color:#1e40af">解析後仍可手動修改欄位內容</div>
      </div>

      <div class="section-label">基本資訊</div>
      ${fieldRocDate('valuation_date','成交日期',v.valuation_date,{hint:'實價登錄的交易月份'})}
      ${fieldSelect('source','資料來源','valuation_source',v.source)}
      ${fieldText('ref_address','地址',v.ref_address,{full:true,ph:'例：花蓮市國富十一街32號2樓之2'})}
      ${fieldText('ref_building_type','物件型態',v.ref_building_type,{ph:'華廈／公寓／透天／套房'})}
      ${fieldText('ref_floor','樓層',v.ref_floor,{ph:'例:2/5樓'})}
      ${fieldText('ref_age','屋齡(年)',v.ref_age,{type:'number',ph:'例:28.7'})}
      ${fieldText('ref_rooms','格局(房/廳/衛)',v.ref_rooms,{ph:'例:2/1/1'})}
      ${fieldText('ref_parking','車位個數',v.ref_parking,{ph:'例:1個、無車位'})}

      <div class="section-label">面積（坪）</div>
      ${fieldText('main_area_ping','主建物面積',v.main_area_ping,{type:'number',ph:'例：19.49'})}
      ${fieldText('aux_area_ping','附屬面積',v.aux_area_ping,{type:'number',ph:'例：1.2'})}
      ${fieldText('common_area_ping','共用面積',v.common_area_ping,{type:'number',ph:'例：3.5'})}
      ${fieldText('parking_area_ping','車位面積',v.parking_area_ping,{type:'number',ph:'例:8'})}
      <div class="field full">
        <label>總面積（坪）</label>
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
          <input name="total_area_ping" type="number" step="any" value="${esc(v.total_area_ping)}" placeholder="總面積" style="width:160px">
          <button type="button" class="btn ghost" style="white-space:nowrap" onclick="fillValuationTotal()">↙ 帶入加總</button>
          <span style="color:var(--text-dim);font-size:13px">主建物＋附屬＋共用＋車位 加總：<span id="valuationAreaSum" style="color:var(--accent);font-weight:600">0</span> 坪</span>
        </div>
      </div>

      <div class="section-label">價格</div>
      ${fieldText('market_value','總價（新台幣）',v.market_value,{type:'number',ph:'例：4880000（488萬）'})}
      ${fieldText('price_per_ping','每坪單價',v.price_per_ping,{type:'number',ph:'例：250000（25萬/坪）'})}
      ${fieldText('parking_price','車位價格',v.parking_price,{type:'number',ph:'例：800000（80萬）'})}
      ${fieldText('source_url','來源連結',v.source_url,{full:true,ph:'https://...實價登錄/591連結'})}

      <div class="section-label">附加</div>
      ${fieldText('notes','備註',v.notes,{full:true,ph:'例：附近100公尺內成交、屋齡相近、含車位等'})}
      <div class="field full">
        <label>照片（實價登錄截圖、現場照等，會自動壓縮）</label>
        <input type="file" accept="image/*" onchange="handleValuationPhoto(event)" style="padding:8px">
        <div id="valuationPhotoPreview" style="margin-top:8px">
          ${photoSrc?`<img src="${photoSrc}" style="max-width:300px;max-height:300px;border-radius:6px;border:1px solid var(--border)"><br><button type="button" class="btn ghost" style="margin-top:6px" onclick="clearValuationPhoto()">移除照片</button>`:''}
        </div>
        <input type="hidden" id="valuationPhotoData" value="${v.photo||''}">
      </div>
    </div></div>
    <div class="modal-foot">
      <span></span>
      <div><button class="btn ghost" onclick="closeModal()">取消</button>
      <button class="btn" onclick="saveValuation(${propId},${vid||0})">儲存</button></div>
    </div>`);
  // 綁定面積欄位變動 → 自動更新加總顯示
  ['main_area_ping','aux_area_ping','common_area_ping','parking_area_ping'].forEach(name => {
    const el = document.querySelector(`#modal [name="${name}"]`);
    if (el) el.addEventListener('input', updateValuationAreaSum);
  });
  updateValuationAreaSum();
}
function handleValuationPhoto(e) {
  const file = e.target.files[0]; if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxW = 1200;
      const scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      const base64 = dataUrl.split(',')[1];
      document.getElementById('valuationPhotoData').value = base64;
      document.getElementById('valuationPhotoPreview').innerHTML = 
        `<img src="${dataUrl}" style="max-width:300px;max-height:300px;border-radius:6px;border:1px solid var(--border)"><br><button type="button" class="btn ghost" style="margin-top:6px" onclick="clearValuationPhoto()">移除照片</button>`;
    };
    img.src = ev.target.result;
  };
  reader.readAsDataURL(file);
}
function clearValuationPhoto() {
  document.getElementById('valuationPhotoData').value = '';
  document.getElementById('valuationPhotoPreview').innerHTML = '';
}

/* 解析貼上的文字，自動填入評估表單欄位
   支援：總價、每坪、坪數、地坪、樓層、屋齡、房廳衛、車位、型態、地址、日期（民國/西元）
   策略：用正則抓「關鍵字+數字+單位」，認到就填，認不到就跳過（保留原值） */
function parseAndFillValuation() {
  const txt = (document.getElementById('autoParseText').value || '').trim();
  if (!txt) { toast('請先貼入文字', true); return; }
  const f = document.querySelector('#modal');
  const set = (name, val) => {
    if (val == null || val === '') return false;
    const el = f.querySelector(`[name="${name}"]`);
    if (!el) return false;
    el.value = val;
    return true;
  };
  const filled = [];
  const lines = txt.split(/[\n\r]+/).map(s=>s.trim()).filter(x=>x);

  // === 1) 評估日期：嚴格抓「年月」格式，避免地址裡的「148巷2弄」誤判 ===
  let m = txt.match(/民國\s*(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (!m) m = txt.match(/(?<![\d巷弄號之])(\d{2,3})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (!m) {
    // 105-06 或 114/06：單獨一行，或行開頭後接型態（樂屋網格式）
    const dateLine = lines.find(l => /^(?:成交年月\s*)?\d{2,3}\s*[-\/]\s*\d{1,2}(?:\s|$|\s+(?:華廈|公寓|大樓|透天|別墅|套房|店面))/.test(l));
    if (dateLine) {
      const dm = dateLine.match(/(\d{2,3})\s*[-\/]\s*(\d{1,2})/);
      if (dm) m = [dm[0], dm[1], dm[2], '1'];
    }
  }
  if (!m) {
    m = txt.match(/(20\d{2})\s*[\/-]\s*(\d{1,2})\s*[\/-]\s*(\d{1,2})/);
    if (m) m = [m[0], String(parseInt(m[1])-1911), m[2], m[3]];
  }
  if (m) {
    let y = parseInt(m[1]); if (y < 1911) y += 1911;
    const mo = parseInt(m[2]), d = parseInt(m[3]) || 1;
    const yEl = f.querySelector('[data-roc="valuation_date"][data-part="y"]');
    const moEl = f.querySelector('[data-roc="valuation_date"][data-part="m"]');
    const dEl = f.querySelector('[data-roc="valuation_date"][data-part="d"]');
    if (yEl && moEl && dEl) {
      yEl.value = y - 1911; moEl.value = mo; dEl.value = d;
      if (typeof updateRocWest === 'function') updateRocWest('valuation_date');
      filled.push(`日期 ${y-1911}/${mo}`);
    }
  }

  // === 2) 總價：所有「N 萬」中取最大（避免抓到車位 0 萬） ===
  const wanMatches = [...txt.matchAll(/(\d{1,5}(?:,\d{3})*(?:\.\d+)?)\s*萬(?!\s*\/)/g)];
  if (wanMatches.length) {
    const values = wanMatches.map(x => parseFloat(x[1].replace(/,/g,'')));
    const max = Math.max(...values);
    if (max > 0) {
      set('market_value', Math.round(max * 10000));
      filled.push(`總價 ${max}萬`);
    }
  }

  // === 3) 每坪單價 ===
  m = txt.match(/(\d+(?:\.\d+)?)\s*萬\s*\/\s*坪/);
  if (m) {
    const wan = parseFloat(m[1]);
    set('price_per_ping', Math.round(wan * 10000));
    filled.push(`每坪 ${wan}萬`);
  } else {
    m = txt.match(/([\d,]{5,})\s*元?\s*\/\s*坪/);
    if (m) { set('price_per_ping', parseFloat(m[1].replace(/,/g,''))); filled.push('每坪'); }
  }

  // === 4) 主建物面積（坪） ===
  m = txt.match(/(?:主建物|主建)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*坪?/);
  if (!m) m = txt.match(/(?:總建坪|建坪)\s*[:：]?\s*(\d+(?:\.\d+)?)/);
  if (!m) m = txt.match(/\d+\s*房\s*\/\s*(\d+(?:\.\d+)?)\s*坪/);
  if (m) { set('main_area_ping', parseFloat(m[1])); filled.push(`主建物 ${m[1]}坪`); }

  // === 5) 附屬面積（坪） ===
  m = txt.match(/附屬(?:建物)?\s*[:：]?\s*(\d+(?:\.\d+)?)\s*坪?/);
  if (m) { set('aux_area_ping', parseFloat(m[1])); filled.push(`附屬 ${m[1]}坪`); }

  // === 6) 共用/公設面積（坪） ===
  m = txt.match(/(?:共用|公設|共有部分)\s*[:：]?\s*(\d+(?:\.\d+)?)\s*坪?/);
  if (m) { set('common_area_ping', parseFloat(m[1])); filled.push(`共用 ${m[1]}坪`); }

  // === 7) 車位面積（坪）與車位價格（萬） ===
  m = txt.match(/車位(?:面積)?\s*[:：]?\s*(\d+(?:\.\d+)?)\s*坪/);
  if (!m) m = txt.match(/(\d+(?:\.\d+)?)\s*坪\s*車位/);
  if (m) { set('parking_area_ping', parseFloat(m[1])); filled.push(`車位 ${m[1]}坪`); }
  m = txt.match(/車位(?:價格|總價|金額)?\s*[:：]?\s*(\d+(?:\.\d+)?)\s*萬/);
  if (m && parseFloat(m[1]) > 0) {
    set('parking_price', Math.round(parseFloat(m[1])*10000));
    filled.push(`車位價 ${m[1]}萬`);
  }

  // === 7.5) 總面積（坪）===
  m = txt.match(/總面積\s*[:：]?\s*(\d+(?:\.\d+)?)\s*坪?/);
  if (m) { set('total_area_ping', parseFloat(m[1])); filled.push(`總面積 ${m[1]}坪`); }

  // === 8) 樓層：「2/5樓」「樓層 3樓」「3樓之2」 ===
  m = txt.match(/(\d+)\s*[\/／]\s*(\d+)\s*樓/);
  if (!m) m = txt.match(/(\d+)樓\s*[\/／]\s*(\d+)樓/);
  if (m) { set('ref_floor', `${m[1]}/${m[2]}樓`); filled.push(`樓層 ${m[1]}/${m[2]}樓`); }
  else {
    const flLine = lines.find(l => /^(?:樓層\s*)?\d+\s*樓(?:之\d+)?$/.test(l));
    if (flLine) {
      const fm = flLine.match(/(\d+\s*樓(?:之\d+)?)/);
      if (fm) { set('ref_floor', fm[1]); filled.push(`樓層 ${fm[1]}`); }
    }
  }

  // === 9) 屋齡：「屋齡 28.7年」「28.7年屋齡」 ===
  m = txt.match(/屋齡\s*[:：]?\s*(\d+(?:\.\d+)?)/);
  if (!m) m = txt.match(/(\d+(?:\.\d+)?)\s*年\s*屋齡/);
  if (m) { set('ref_age', parseFloat(m[1])); filled.push(`屋齡 ${m[1]}年`); }

  // === 9.5) 格局(房廳衛)：「2/1/1」「2房1廳1衛」「1房」 ===
  m = txt.match(/(\d)\s*[\/／]\s*(\d|--|—)\s*[\/／]\s*(\d|--|—)/);
  if (m) {
    const r = m[1], l = (m[2]==='--'||m[2]==='—')?'--':m[2], b = (m[3]==='--'||m[3]==='—')?'--':m[3];
    set('ref_rooms', `${r}/${l}/${b}`);
    filled.push(`格局 ${r}/${l}/${b}`);
  } else {
    m = txt.match(/(\d)\s*房\s*(\d)\s*廳\s*(\d)\s*衛/);
    if (m) { set('ref_rooms', `${m[1]}/${m[2]}/${m[3]}`); filled.push(`格局 ${m[1]}/${m[2]}/${m[3]}`); }
    else {
      m = txt.match(/(\d)\s*房(?!\s*[\/／]\s*\d+\s*[廳衛坪])/);
      if (m) { set('ref_rooms', `${m[1]}/--/--`); filled.push(`${m[1]}房`); }
    }
  }

  // === 9.6) 車位個數：「無車位」「1個車位」「2 車位」 ===
  if (/無車位/.test(txt)) { set('ref_parking', '無車位'); filled.push('無車位'); }
  else {
    const pm = txt.match(/(\d+)\s*個?\s*車位/);
    if (pm) { set('ref_parking', `${pm[1]}個車位`); filled.push(`${pm[1]}個車位`); }
  }

  // === 10) 物件型態 ===
  m = txt.match(/(華廈|電梯大樓|電梯華廈|公寓|透天厝|透天|大樓|別墅|套房|店面|辦公|廠房|農舍|住宅|住家)/);
  if (m) { set('ref_building_type', m[1]); filled.push(`型態 ${m[1]}`); }

  // === 11) 地址：包含 路/街/巷/弄/段/號 且不含坪萬樓等關鍵字 ===
  let addr = lines.find(line =>
    line.length >= 4 && line.length <= 80 &&
    /[路街巷弄段號]/.test(line) &&
    !/坪|萬|車位|樓層|屋齡|單價|總價|成交/.test(line)
  );
  if (addr) {
    addr = addr.replace(/\s*\|\s*/g,' ').replace(/操作$/,'').trim();
    set('ref_address', addr);
    filled.push('地址');
  }

  if (filled.length) toast(`已解析填入:${filled.join('、')}`);
  else toast('沒有解析到任何欄位,請檢查文字格式或手動填寫', true);
}

function saveValuation(propId, vid) {
  const f = document.querySelector('#modal');
  const photoEl = document.getElementById('valuationPhotoData');
  const photoVal = (photoEl && photoEl.value) || null;
  const data = {
    property_id: propId,
    valuation_date: readRocDate('valuation_date'),
    source: (f.querySelector('[name="source"]')||{}).value || null,
    market_value: parseFloat((f.querySelector('[name="market_value"]')||{}).value) || null,
    price_per_ping: parseFloat((f.querySelector('[name="price_per_ping"]')||{}).value) || null,
    parking_price: parseFloat((f.querySelector('[name="parking_price"]')||{}).value) || null,
    main_area_ping: parseFloat((f.querySelector('[name="main_area_ping"]')||{}).value) || null,
    aux_area_ping: parseFloat((f.querySelector('[name="aux_area_ping"]')||{}).value) || null,
    common_area_ping: parseFloat((f.querySelector('[name="common_area_ping"]')||{}).value) || null,
    parking_area_ping: parseFloat((f.querySelector('[name="parking_area_ping"]')||{}).value) || null,
    total_area_ping: parseFloat((f.querySelector('[name="total_area_ping"]')||{}).value) || null,
    source_url: (f.querySelector('[name="source_url"]')||{}).value || null,
    ref_address: (f.querySelector('[name="ref_address"]')||{}).value || null,
    ref_building_type: (f.querySelector('[name="ref_building_type"]')||{}).value || null,
    ref_floor: (f.querySelector('[name="ref_floor"]')||{}).value || null,
    ref_age: parseFloat((f.querySelector('[name="ref_age"]')||{}).value) || null,
    ref_rooms: (f.querySelector('[name="ref_rooms"]')||{}).value || null,
    ref_parking: (f.querySelector('[name="ref_parking"]')||{}).value || null,
    notes: (f.querySelector('[name="notes"]')||{}).value || null,
    photo: photoVal
  };
  try {
    if (vid) {
      const sets = Object.keys(data).filter(k=>k!=='property_id').map(k=>`${k}=?`).join(',');
      run(`UPDATE property_valuations SET ${sets} WHERE valuation_id=?`, [...Object.keys(data).filter(k=>k!=='property_id').map(k=>data[k]), vid]);
    } else {
      data.created_at = now();
      const cols = Object.keys(data);
      run(`INSERT INTO property_valuations (${cols.join(',')}) VALUES (${cols.map(_=>'?').join(',')})`, cols.map(c=>data[c]));
    }
    autoSave();
    closeModal();
    toast(vid?'已更新評估':'已新增評估');
    renderValuationList();
  } catch(e) {
    console.error('儲存評估失敗:', e);
    // 可能是舊 db 缺欄位，跑一次 migrate 後重試
    try {
      migrate();
      data.created_at = data.created_at || now();
      const cols = Object.keys(data);
      if (vid) {
        const sets = Object.keys(data).filter(k=>k!=='property_id').map(k=>`${k}=?`).join(',');
        run(`UPDATE property_valuations SET ${sets} WHERE valuation_id=?`, [...Object.keys(data).filter(k=>k!=='property_id').map(k=>data[k]), vid]);
      } else {
        run(`INSERT INTO property_valuations (${cols.join(',')}) VALUES (${cols.map(_=>'?').join(',')})`, cols.map(c=>data[c]));
      }
      autoSave();
      closeModal();
      toast('已新增評估（已自動補資料表）');
      renderValuationList();
    } catch(e2) {
      alert('儲存失敗：' + e2.message + '\n\n請按 F12 開啟瀏覽器主控台看詳細錯誤，或試試「🗑 清空重來」按鈕重建資料表。');
    }
  }
}
function deleteValuation(vid) {
  if (!confirm('確定刪除這筆評估？')) return;
  try {
    run("DELETE FROM property_valuations WHERE valuation_id=?", [vid]);
    autoSave();
    toast('已刪除');
    // 用 setTimeout 讓 confirm 對話框先確實關閉，再重畫，避免 UI 卡住
    setTimeout(() => renderValuationList(), 50);
  } catch(e) {
    alert('刪除失敗：' + e.message);
  }
}

/* 評估表單面積加總（主+附+共+車） */
function updateValuationAreaSum() {
  const f = document.querySelector('#modal'); if (!f) return;
  const g = name => parseFloat((f.querySelector(`[name="${name}"]`)||{}).value) || 0;
  const sum = g('main_area_ping') + g('aux_area_ping') + g('common_area_ping') + g('parking_area_ping');
  const el = document.getElementById('valuationAreaSum');
  if (el) el.textContent = sum ? sum.toFixed(2).replace(/\.?0+$/,'') : '0';
}
function fillValuationTotal() {
  const f = document.querySelector('#modal'); if (!f) return;
  const g = name => parseFloat((f.querySelector(`[name="${name}"]`)||{}).value) || 0;
  const sum = g('main_area_ping') + g('aux_area_ping') + g('common_area_ping') + g('parking_area_ping');
  const inp = f.querySelector('[name="total_area_ping"]');
  if (inp) inp.value = sum ? parseFloat(sum.toFixed(2)) : '';
}

/* 建議售價：編輯表單與儲存 */
function openSuggestedPriceForm(propId) {
  const p = query("SELECT * FROM properties WHERE property_id=?", [propId])[0];
  openModal(`
    <div class="modal-head"><h3>建議售價 · ${esc(p.name)}</h3><button class="x" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
      ${fieldText('suggested_price','建議售價（新台幣）',p.suggested_price,{type:'number',ph:'例：5500000（550萬）',hint:'你想開的價格，跟人家談價時的參考'})}
      ${fieldText('suggested_price_notes','說明備註',p.suggested_price_notes,{full:true,ph:'例：依鄰近成交均價 +10%、含車位、屋況極佳等'})}
    </div></div>
    <div class="modal-foot">
      <span></span>
      <div><button class="btn ghost" onclick="closeModal()">取消</button>
      <button class="btn" onclick="saveSuggestedPrice(${propId})">儲存</button></div>
    </div>`);
}
function saveSuggestedPrice(propId) {
  const f = document.querySelector('#modal');
  const sp = parseFloat(f.querySelector('[name="suggested_price"]').value) || null;
  const notes = f.querySelector('[name="suggested_price_notes"]').value || null;
  try {
    run("UPDATE properties SET suggested_price=?, suggested_price_notes=?, updated_at=? WHERE property_id=?", [sp, notes, now(), propId]);
    autoSave();
    closeModal();
    toast('已更新建議售價');
    setTimeout(() => renderValuationList(), 50);
  } catch(e) {
    alert('儲存失敗：' + e.message);
  }
}

/* 點縮圖看大圖：用 modal 顯示 */
function showPhotoFull(vid) {
  const v = query("SELECT photo FROM property_valuations WHERE valuation_id=?", [vid])[0];
  if (!v || !v.photo) return;
  openModal(`
    <div class="modal-head"><h3>照片預覽</h3><button class="x" onclick="closeModal()">×</button></div>
    <div class="modal-body" style="text-align:center;padding:10px">
      <img src="data:image/jpeg;base64,${v.photo}" style="max-width:100%;max-height:80vh;border-radius:6px">
    </div>`);
}

/* ====================== 買賣交易 ====================== */
function renderTxnList() {
  const rows = query(`SELECT t.*, p.name pname FROM transactions t LEFT JOIN properties p ON p.property_id=t.property_id ORDER BY t.transaction_id DESC`);
  let html = `<h2 class="page-title">買賣交易</h2>
    <div class="page-desc">追蹤每筆買進/出售的流程與金流</div>
    <div class="toolbar"><button class="btn" style="margin-left:auto" onclick="openTxnForm()">+ 新增交易</button></div>`;
  if (rows.length === 0) {
    html += `<div class="card"><div class="empty"><div class="big">⇄</div>尚無買賣交易<br><br><button class="btn" onclick="openTxnForm()">+ 新增第一筆</button></div></div>`;
  } else {
    html += `<div class="card"><table><thead><tr><th>物件</th><th>類型</th><th>對象</th><th class="right">成交價</th><th>狀態</th><th></th></tr></thead><tbody>`;
    rows.forEach(t => html += `<tr class="clickable" onclick="openTxnDetail(${t.transaction_id})">
      <td>${esc(t.pname)||'（未綁物件）'}</td><td>${enumLabel('txn_type',t.transaction_type)}</td>
      <td>${esc(t.counterparty_name)||'—'}</td><td class="mono right">${fmt(t.agreed_price)}</td>
      <td><span class="badge ${t.transaction_status==='completed'?'held':t.transaction_status==='cancelled'?'sold':'split'}">${enumLabel('txn_status',t.transaction_status)}</span></td>
      <td onclick="event.stopPropagation()"><button class="icon-btn del" onclick="deleteTxn(${t.transaction_id})">刪除</button></td></tr>`);
    html += `</tbody></table></div>`;
  }
  $('#transactions').innerHTML = html;
}

function propSelectOptions(current) {
  let o = '<option value="">— 選擇 —</option>';
  // 物件
  const ps = query("SELECT property_id, name FROM properties ORDER BY property_id");
  if (ps.length) {
    o += '<optgroup label="不動產物件">';
    ps.forEach(p => o += `<option value="prop:${p.property_id}" ${('prop:'+p.property_id)===current||p.property_id==current?'selected':''}>${esc(p.name)}</option>`);
    o += '</optgroup>';
  }
  // 土地權狀
  const lands = query("SELECT land_id, land_number, section_name FROM lands WHERE lifecycle_status='held' ORDER BY section_name, land_number");
  if (lands.length) {
    o += '<optgroup label="土地權狀">';
    lands.forEach(l => o += `<option value="land:${l.land_id}">${esc((l.section_name||'')+' '+l.land_number)}</option>`);
    o += '</optgroup>';
  }
  // 建物權狀
  const blds = query("SELECT building_id, building_number, door_address FROM buildings WHERE lifecycle_status='held' ORDER BY building_number");
  if (blds.length) {
    o += '<optgroup label="建物權狀">';
    blds.forEach(b => o += `<option value="bld:${b.building_id}">${esc(b.building_number+(b.door_address?(' '+b.door_address):''))}</option>`);
    o += '</optgroup>';
  }
  return o;
}
/* 把下拉選的值（prop:/land:/bld:）轉成 property_id。
   若選的是土地或建物權狀，會先確保它有對應物件（沒有就建），回傳物件 id。 */
function resolvePropertyId(pickVal) {
  if (!pickVal) return null;
  if (pickVal.startsWith('prop:')) return parseInt(pickVal.slice(5));
  const [type, idStr] = pickVal.split(':');
  const did = parseInt(idStr);
  const deedType = type === 'land' ? 'land' : 'building';
  const col = deedType === 'land' ? 'land_id' : 'building_id';
  // 找這個權狀目前的物件
  const exist = query(`SELECT property_id FROM deed_assignments WHERE deed_type=? AND ${col}=? AND is_current=1`, [deedType, did]);
  if (exist.length) return exist[0].property_id;
  // 沒有就建一個物件並指派
  let name;
  if (deedType === 'land') {
    const l = query("SELECT section_name, land_number FROM lands WHERE land_id=?", [did])[0];
    name = ((l.section_name||'')+' '+(l.land_number||'')).trim() || ('地號'+did);
  } else {
    const b = query("SELECT building_number, door_address FROM buildings WHERE building_id=?", [did])[0];
    name = (b.door_address||b.building_number||('建號'+did));
  }
  run(`INSERT INTO properties (name,property_type,current_status,created_at,updated_at) VALUES (?,?,?,?,?)`,
    [name, deedType==='land'?'land':'building', 'self_use', now(), now()]);
  const propId = query("SELECT last_insert_rowid() AS id")[0].id;
  run(`INSERT INTO deed_assignments (property_id,deed_type,${col},start_date,is_current,created_at) VALUES (?,?,?,?,1,?)`,
    [propId, deedType, did, now(), now()]);
  return propId;
}
function openTxnForm(id, presetProp) {
  const r = id ? query("SELECT * FROM transactions WHERE transaction_id=?", [id])[0] : {};
  const propId = presetProp ? ('prop:'+presetProp) : (r.property_id ? ('prop:'+r.property_id) : '');
  openModal(`
    <div class="modal-head"><h3>${id?'編輯':'新增'}買賣交易</h3><button class="x" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="field full"><label>所屬物件 / 權狀（可直接選土地或建物）</label><select name="property_pick">${propSelectOptions(propId)}</select></div>
      ${fieldSelect('transaction_type','交易類型','txn_type',r.transaction_type)}
      ${fieldSelect('transaction_status','交易狀態','txn_status',r.transaction_status||'negotiating')}
      ${fieldText('counterparty_name','交易對象',r.counterparty_name,{ph:'買方/賣方姓名'})}
      ${fieldText('agreed_price','成交價',r.agreed_price,{type:'number'})}
      ${fieldText('broker_name','仲介',r.broker_name)}
      ${fieldText('broker_fee','仲介費',r.broker_fee,{type:'number'})}
      ${fieldText('lawyer_name','代書',r.lawyer_name)}
      <div class="field"></div>
      <div class="section-label">關鍵日期</div>
      ${fieldText('first_viewed_at','看屋日',r.first_viewed_at,{type:'date'})}
      ${fieldText('contracted_at','簽約日',r.contracted_at,{type:'date'})}
      ${fieldText('sealed_at','用印日',r.sealed_at,{type:'date'})}
      ${fieldText('title_transferred_at','過戶完成日',r.title_transferred_at,{type:'date'})}
      ${fieldText('handover_at','交屋日',r.handover_at,{type:'date'})}
      <div class="field"></div>
      ${fieldText('special_terms','特殊約定',r.special_terms,{full:true})}
      ${fieldText('notes','備註',r.notes,{full:true})}
    </div></div>
    <div class="modal-foot"><span></span><div>
      <button class="btn ghost" onclick="closeModal()">取消</button>
      <button class="btn" onclick="saveTxn(${id||0},${propId||0})">儲存</button></div></div>`);
}
function saveTxn(id, presetProp) {
  const f = readForm();
  // 把下拉選的（物件/土地/建物）轉成 property_id；選權狀會自動建物件
  f.property_id = f.property_pick ? resolvePropertyId(f.property_pick) : (presetProp || null);
  const cols = ['property_id','transaction_type','transaction_status','counterparty_name','broker_name','broker_fee','lawyer_name','agreed_price','first_viewed_at','contracted_at','sealed_at','title_transferred_at','handover_at','special_terms','notes'];
  const vals = cols.map(c => f[c]||null);
  if (id) run(`UPDATE transactions SET ${cols.map(c=>c+'=?').join(',')},updated_at=? WHERE transaction_id=?`, [...vals, now(), id]);
  else run(`INSERT INTO transactions (${cols.join(',')},created_at,updated_at) VALUES (${cols.map(()=>'?').join(',')},?,?)`, [...vals, now(), now()]);
  autoSave(); closeModal(); toast(id?'已更新':'已新增交易');
  if (presetProp) openPropDetail(presetProp); else renderTxnList();
}
function deleteTxn(id) {
  if (!confirm('確定刪除此交易？相關金流記錄也會一併刪除。')) return;
  run("DELETE FROM transactions WHERE transaction_id=?", [id]);
  run("DELETE FROM cashflows WHERE transaction_id=?", [id]);
  autoSave(); toast('已刪除'); renderTxnList();
}

/* 交易明細 + 金流 */
function openTxnDetail(id) {
  const t = query(`SELECT t.*, p.name pname FROM transactions t LEFT JOIN properties p ON p.property_id=t.property_id WHERE t.transaction_id=?`, [id])[0];
  if (!t) { toast('找不到交易', true); return; }
  const flows = query("SELECT * FROM cashflows WHERE transaction_id=? ORDER BY flow_date", [id]);
  const totalIn = query("SELECT COALESCE(SUM(amount),0) s FROM cashflows WHERE transaction_id=? AND direction='in'", [id])[0].s;
  const totalOut = query("SELECT COALESCE(SUM(amount),0) s FROM cashflows WHERE transaction_id=? AND direction='out'", [id])[0].s;

  const stages = [['first_viewed_at','看屋'],['contracted_at','簽約'],['sealed_at','用印'],['title_transferred_at','過戶'],['handover_at','交屋']];
  let stageHtml = '<div class="timeline">';
  stages.forEach(([k,lbl]) => {
    const d = t[k];
    stageHtml += `<div class="tl-item" style="${d?'':'opacity:0.4'}"><div class="date">${d?rocShort(d):'未完成'}</div><div class="ev">${lbl}</div></div>`;
  });
  stageHtml += '</div>';

  let flowRows = '';
  flows.forEach(c => flowRows += `<tr><td class="mono">${rocShort(c.flow_date)}</td><td>${enumLabel('flow_category',c.category)}</td><td style="color:${c.direction==='in'?'var(--green)':'var(--red)'}">${c.direction==='in'?'收':'付'}</td><td class="mono right" style="color:${c.direction==='in'?'var(--green)':'var(--red)'}">${fmt(c.amount)}</td><td>${esc(c.counterparty)||'—'}</td><td onclick="event.stopPropagation()"><button class="icon-btn del" onclick="deleteFlow(${c.cashflow_id},${id})">刪</button></td></tr>`);
  if (!flowRows) flowRows = `<tr><td colspan="6" style="color:var(--text-dim)">尚無金流記錄</td></tr>`;

  $('#txnDetail').innerHTML = `
    <button class="back-link" onclick="showPage('transactions')">← 返回買賣交易</button>
    <h2 class="page-title">${enumLabel('txn_type',t.transaction_type)} · ${esc(t.pname)||'（未綁物件）'}</h2>
    <div class="page-desc">對象 ${esc(t.counterparty_name)||'—'} · 成交 ${fmt(t.agreed_price)} · <span class="badge ${t.transaction_status==='completed'?'held':'split'}">${enumLabel('txn_status',t.transaction_status)}</span></div>
    <div class="stats">
      <div class="stat"><div class="label">成交價</div><div class="value" style="font-size:18px">${fmt(t.agreed_price)}</div></div>
      <div class="stat"><div class="label">累計收入</div><div class="value" style="font-size:18px;color:var(--green)">${fmt(totalIn)}</div></div>
      <div class="stat"><div class="label">累計支出</div><div class="value" style="font-size:18px;color:var(--red)">${fmt(totalOut)}</div></div>
      <div class="stat"><div class="label">淨額</div><div class="value" style="font-size:18px">${fmt(totalIn-totalOut)}</div></div>
    </div>
    <div class="two-col">
      <div class="card"><div class="card-head"><h3>流程進度</h3><button class="btn ghost" onclick="openTxnForm(${id})">編輯</button></div><div style="padding:18px">${stageHtml}</div></div>
      <div class="card"><div class="card-head"><h3>關係人</h3></div><table><tbody>
        <tr><td>交易對象</td><td>${esc(t.counterparty_name)||'—'}</td></tr>
        <tr><td>仲介</td><td>${esc(t.broker_name)||'—'}${t.broker_fee?` · 費 ${fmt(t.broker_fee)}`:''}</td></tr>
        <tr><td>代書</td><td>${esc(t.lawyer_name)||'—'}</td></tr>
      </tbody></table></div>
    </div>
    <div class="card"><div class="card-head"><h3>金流明細（訂金、期款、稅費、雜支）</h3><button class="btn ghost" onclick="openFlowForm(${id},${t.property_id||0})">+ 新增金流</button></div>
      <table><thead><tr><th>日期</th><th>項目</th><th>收付</th><th class="right">金額</th><th>對象</th><th></th></tr></thead><tbody>${flowRows}</tbody></table></div>
    ${t.special_terms?`<div class="note">特殊約定：${esc(t.special_terms)}</div>`:''}`;

  document.querySelectorAll('.page').forEach(x => x.classList.toggle('active', x.id === 'txnDetail'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $('#crumb').innerHTML = '買賣交易 / <b>交易明細</b>';
  window.scrollTo(0,0);
}

function openFlowForm(txnId, propId) {
  openModal(`
    <div class="modal-head"><h3>新增金流</h3><button class="x" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
      ${fieldText('flow_date','日期',now(),{type:'date',req:true})}
      ${fieldSelect('direction','收/付','flow_direction','in')}
      ${fieldSelect('category','項目','flow_category')}
      ${fieldText('amount','金額',' ',{type:'number',req:true})}
      ${fieldText('counterparty','對象',' ',{ph:'付給誰/誰付的'})}
      ${fieldSelect('payment_method','付款方式','payment_method')}
      ${fieldText('receipt_location','憑證位置',' ',{ph:'發票/收據放哪'})}
      ${fieldText('notes','備註',' ',{full:true})}
    </div></div>
    <div class="modal-foot"><span></span><div>
      <button class="btn ghost" onclick="closeModal()">取消</button>
      <button class="btn" onclick="saveFlow(${txnId},${propId})">儲存</button></div></div>`);
}
function saveFlow(txnId, propId) {
  const f = readForm();
  if (!f.amount) { toast('金額為必填', true); return; }
  run("INSERT INTO cashflows (transaction_id,property_id,flow_date,direction,category,amount,counterparty,payment_method,receipt_location,notes,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)",
    [txnId, propId||null, f.flow_date, f.direction, f.category, f.amount, f.counterparty||null, f.payment_method||null, f.receipt_location||null, f.notes||null, now()]);
  autoSave(); closeModal(); toast('已新增金流'); openTxnDetail(txnId);
}
function deleteFlow(id, txnId) {
  if (!confirm('刪除此筆金流？')) return;
  run("DELETE FROM cashflows WHERE cashflow_id=?", [id]);
  autoSave(); toast('已刪除'); openTxnDetail(txnId);
}

/* ====================== 銀行借貸 ====================== */
function renderLoanList() {
  const rows = query(`SELECT l.*, p.name pname FROM loans l LEFT JOIN properties p ON p.property_id=l.property_id ORDER BY l.loan_id DESC`);
  let html = `<h2 class="page-title">銀行借貸</h2>
    <div class="page-desc">貸款條件、抵押設定、繳款明細與提醒</div>
    <div class="toolbar"><button class="btn" style="margin-left:auto" onclick="openLoanForm()">+ 新增貸款</button></div>`;
  if (rows.length === 0) {
    html += `<div class="card"><div class="empty"><div class="big">$</div>尚無貸款<br><br><button class="btn" onclick="openLoanForm()">+ 新增第一筆</button></div></div>`;
  } else {
    html += `<div class="card"><table><thead><tr><th>物件</th><th>銀行</th><th>類型</th><th class="right">核貸</th><th class="right">餘額</th><th>利率</th><th>狀態</th><th></th></tr></thead><tbody>`;
    rows.forEach(l => html += `<tr class="clickable" onclick="openLoanDetail(${l.loan_id})">
      <td>${esc(l.pname)||'—'}</td><td>${esc(l.bank_name)||'—'}</td><td>${enumLabel('loan_type',l.loan_type)}</td>
      <td class="mono right">${fmt(l.approved_amount)}</td><td class="mono right">${fmt(l.current_principal)}</td>
      <td class="mono">${l.interest_rate?l.interest_rate+'%':'—'}</td>
      <td><span class="badge ${l.status==='active'?'held':'sold'}">${enumLabel('loan_status',l.status)}</span></td>
      <td onclick="event.stopPropagation()"><button class="icon-btn del" onclick="deleteLoan(${l.loan_id})">刪除</button></td></tr>`);
    html += `</tbody></table></div>`;
  }
  $('#loans').innerHTML = html;
}

function openLoanForm(id, presetProp) {
  const r = id ? query("SELECT * FROM loans WHERE loan_id=?", [id])[0] : {};
  const propId = presetProp ? ('prop:'+presetProp) : (r.property_id ? ('prop:'+r.property_id) : '');
  openModal(`
    <div class="modal-head"><h3>${id?'編輯':'新增'}貸款</h3><button class="x" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
      <div class="field full"><label>擔保物件 / 權狀（可直接選土地或建物）</label><select name="property_pick">${propSelectOptions(propId)}</select></div>
      ${fieldText('loan_code','貸款編號',r.loan_code,{ph:'L-0001'})}
      ${fieldSelect('collateral_scope','擔保範圍','collateral_scope',r.collateral_scope)}
      ${fieldText('bank_name','銀行',r.bank_name,{req:true})}
      ${fieldText('branch','分行',r.branch)}
      ${fieldText('contact_person','承辦人',r.contact_person)}
      ${fieldSelect('loan_type','貸款類型','loan_type',r.loan_type)}
      <div class="section-label">核貸條件</div>
      ${fieldText('approved_amount','核貸金額',r.approved_amount,{type:'number'})}
      ${fieldText('approved_ratio','核貸成數%',r.approved_ratio,{type:'number'})}
      ${fieldText('interest_rate','利率%',r.interest_rate,{type:'number'})}
      ${fieldSelect('rate_type','利率類型','rate_type',r.rate_type)}
      ${fieldText('term_months','年限(月)',r.term_months,{type:'number'})}
      ${fieldText('grace_period_months','寬限期(月)',r.grace_period_months,{type:'number'})}
      ${fieldText('current_principal','目前本金餘額',r.current_principal,{type:'number'})}
      ${fieldSelect('repayment_method','還款方式','repayment_method',r.repayment_method)}
      ${fieldText('repayment_day','每月扣款日',r.repayment_day,{type:'number'})}
      <div class="section-label">抵押設定</div>
      ${fieldText('mortgage_amount','設定金額',r.mortgage_amount,{type:'number'})}
      ${fieldText('lien_certificate_no','他項權利證明書字號',r.lien_certificate_no)}
      ${fieldText('disbursed_at','撥款日',r.disbursed_at,{type:'date'})}
      <div class="field"></div>
      <div class="section-label">提醒日期</div>
      ${fieldText('grace_period_end_at','寬限期到期',r.grace_period_end_at,{type:'date'})}
      ${fieldText('rate_reset_at','利率重訂日',r.rate_reset_at,{type:'date'})}
      ${fieldText('lockup_end_at','綁約到期',r.lockup_end_at,{type:'date'})}
      ${fieldText('maturity_at','整體到期',r.maturity_at,{type:'date'})}
      <div class="section-label">狀態</div>
      ${fieldSelect('status','貸款狀態','loan_status',r.status||'active')}
      ${fieldText('notes','備註',r.notes,{full:true})}
    </div></div>
    <div class="modal-foot"><span></span><div>
      <button class="btn ghost" onclick="closeModal()">取消</button>
      <button class="btn" onclick="saveLoan(${id||0},${propId||0})">儲存</button></div></div>`);
}
function saveLoan(id, presetProp) {
  const f = readForm();
  if (!f.bank_name) { toast('銀行為必填', true); return; }
  f.property_id = f.property_pick ? resolvePropertyId(f.property_pick) : (presetProp || null);
  const cols = ['property_id','loan_code','collateral_scope','bank_name','branch','contact_person','loan_type','approved_amount','approved_ratio','interest_rate','rate_type','term_months','grace_period_months','current_principal','repayment_method','repayment_day','mortgage_amount','lien_certificate_no','disbursed_at','grace_period_end_at','rate_reset_at','lockup_end_at','maturity_at','status','notes'];
  const vals = cols.map(c => f[c]||null);
  if (id) run(`UPDATE loans SET ${cols.map(c=>c+'=?').join(',')},updated_at=? WHERE loan_id=?`, [...vals, now(), id]);
  else run(`INSERT INTO loans (${cols.join(',')},created_at,updated_at) VALUES (${cols.map(()=>'?').join(',')},?,?)`, [...vals, now(), now()]);
  autoSave(); closeModal(); toast(id?'已更新':'已新增貸款');
  if (presetProp) openPropDetail(presetProp); else renderLoanList();
}
function deleteLoan(id) {
  if (!confirm('確定刪除此貸款？繳款明細也會一併刪除。')) return;
  run("DELETE FROM loans WHERE loan_id=?", [id]);
  run("DELETE FROM loan_payments WHERE loan_id=?", [id]);
  autoSave(); toast('已刪除'); renderLoanList();
}

/* 貸款明細 + 繳款 */
function openLoanDetail(id) {
  const l = query(`SELECT l.*, p.name pname FROM loans l LEFT JOIN properties p ON p.property_id=l.property_id WHERE l.loan_id=?`, [id])[0];
  if (!l) { toast('找不到貸款', true); return; }
  const pays = query("SELECT * FROM loan_payments WHERE loan_id=? ORDER BY period_no", [id]);

  let cells = '';
  const add = (k,v) => cells += `<div class="cell"><div class="k">${k}</div><div class="v">${v}</div></div>`;
  add('銀行', `${esc(l.bank_name)||'—'}${l.branch?' · '+esc(l.branch):''}`);
  add('貸款類型', enumLabel('loan_type',l.loan_type));
  add('核貸金額', `<span class="mono">${fmt(l.approved_amount)}</span>${l.approved_ratio?` · ${l.approved_ratio}成`:''}`);
  add('目前餘額', `<span class="mono">${fmt(l.current_principal)}</span>`);
  add('利率', `${l.interest_rate?l.interest_rate+'%':'—'} · ${enumLabel('rate_type',l.rate_type)}`);
  add('還款方式', `${enumLabel('repayment_method',l.repayment_method)}${l.repayment_day?` · 每月${l.repayment_day}日`:''}`);
  add('年限/寬限', `${l.term_months?l.term_months+'月':'—'}${l.grace_period_months?` · 寬限${l.grace_period_months}月`:''}`);
  add('抵押設定金額', `<span class="mono">${fmt(l.mortgage_amount)}</span>`);

  const reminders = [['grace_period_end_at','寬限期到期'],['rate_reset_at','利率重訂'],['lockup_end_at','綁約到期'],['maturity_at','整體到期']].filter(([k])=>l[k]);
  let remHtml = reminders.length ? '<div class="timeline">' + reminders.map(([k,lbl])=>`<div class="tl-item"><div class="date">${rocDate(l[k])}</div><div class="ev">${lbl}</div></div>`).join('') + '</div>' : '<div class="page-desc">未設定提醒日期</div>';

  let payRows = '';
  pays.forEach(p => payRows += `<tr><td class="mono">${p.period_no||'—'}</td><td class="mono">${rocShort(p.due_date)}</td><td class="mono right">${fmt(p.principal_amount)}</td><td class="mono right">${fmt(p.interest_amount)}</td><td class="mono right">${fmt(p.total_amount)}</td><td class="mono right">${fmt(p.principal_balance_after)}</td><td><span class="badge ${p.payment_status==='paid'?'held':'split'}">${enumLabel('pay_status',p.payment_status)}</span></td><td onclick="event.stopPropagation()"><button class="icon-btn del" onclick="deletePay(${p.payment_id},${id})">刪</button></td></tr>`);
  if (!payRows) payRows = `<tr><td colspan="8" style="color:var(--text-dim)">尚無繳款記錄</td></tr>`;

  $('#loanDetail').innerHTML = `
    <button class="back-link" onclick="showPage('loans')">← 返回銀行借貸</button>
    <h2 class="page-title">${esc(l.bank_name)} · ${enumLabel('loan_type',l.loan_type)}</h2>
    <div class="page-desc">${esc(l.pname)||'（未綁物件）'} · <span class="badge ${l.status==='active'?'held':'sold'}">${enumLabel('loan_status',l.status)}</span></div>
    <div class="card"><div class="card-head"><h3>貸款條件</h3><button class="btn ghost" onclick="openLoanForm(${id})">編輯</button></div>
      <div style="padding:0"><div class="detail-grid">${cells}</div></div></div>
    <div class="card"><div class="card-head"><h3>提醒日期</h3></div><div style="padding:18px">${remHtml}</div></div>
    <div class="card"><div class="card-head"><h3>繳款明細（本息拆解）</h3><button class="btn ghost" onclick="openPayForm(${id})">+ 新增繳款</button></div>
      <table><thead><tr><th>期</th><th>應繳日</th><th class="right">本金</th><th class="right">利息</th><th class="right">合計</th><th class="right">餘額</th><th>狀態</th><th></th></tr></thead><tbody>${payRows}</tbody></table></div>
    <div class="note">💡 繳款明細可手動新增，或將來擴充銀行對帳單匯入功能。</div>`;

  document.querySelectorAll('.page').forEach(x => x.classList.toggle('active', x.id === 'loanDetail'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  $('#crumb').innerHTML = '銀行借貸 / <b>貸款明細</b>';
  window.scrollTo(0,0);
}

function openPayForm(loanId) {
  const last = query("SELECT MAX(period_no) m FROM loan_payments WHERE loan_id=?", [loanId])[0].m;
  openModal(`
    <div class="modal-head"><h3>新增繳款</h3><button class="x" onclick="closeModal()">×</button></div>
    <div class="modal-body"><div class="form-grid">
      ${fieldText('period_no','期數',(last||0)+1,{type:'number'})}
      ${fieldText('due_date','應繳日',now(),{type:'date',req:true})}
      ${fieldText('principal_amount','本金',' ',{type:'number'})}
      ${fieldText('interest_amount','利息',' ',{type:'number'})}
      ${fieldText('total_amount','合計',' ',{type:'number'})}
      ${fieldText('principal_balance_after','繳款後餘額',' ',{type:'number'})}
      ${fieldSelect('payment_status','狀態','pay_status','paid')}
    </div></div>
    <div class="modal-foot"><span></span><div>
      <button class="btn ghost" onclick="closeModal()">取消</button>
      <button class="btn" onclick="savePay(${loanId})">儲存</button></div></div>`);
}
function savePay(loanId) {
  const f = readForm();
  if (!f.due_date) { toast('應繳日為必填', true); return; }
  run("INSERT INTO loan_payments (loan_id,period_no,due_date,principal_amount,interest_amount,total_amount,principal_balance_after,payment_status,created_at) VALUES (?,?,?,?,?,?,?,?,?)",
    [loanId, f.period_no||null, f.due_date, f.principal_amount||null, f.interest_amount||null, f.total_amount||null, f.principal_balance_after||null, f.payment_status, now()]);
  // 自動更新貸款餘額
  if (f.principal_balance_after) run("UPDATE loans SET current_principal=? WHERE loan_id=?", [f.principal_balance_after, loanId]);
  autoSave(); closeModal(); toast('已新增繳款'); openLoanDetail(loanId);
}
function deletePay(id, loanId) {
  if (!confirm('刪除此筆繳款記錄？')) return;
  run("DELETE FROM loan_payments WHERE payment_id=?", [id]);
  autoSave(); toast('已刪除'); openLoanDetail(loanId);
}
