/* ============================================================
   擴充模組：不動產物件 / 買賣交易(含金流) / 銀行借貸(含繳款)
   ============================================================ */

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
      <table><tbody>${loanRows}</tbody></table></div>`;

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
