// admin.js — 管理員：主選單多一個「管理員」，可以修改全部數據
//   球員（全部欄位、新增、刪除）、球隊、雲端玩家（金幣、積分、打開或重置他的聯盟）、這台電腦的玩家，以及直接對 SQLite 下 SQL
// 誰是管理員由雲端資料庫判斷（supabase/admin.sql 的 admins 表、cloud.js 的 cloudCheckAdmin），不看暱稱；
// 只在這台電腦玩的本機玩家沒有管理員權限。
// 依賴：engine.js、db.js（DB、LEAGUE、saveLeague、reloadLeague、persistDB、queryPlayers）、cards.js、home.js（me、PROFILES…）、cloud.js（執行時才用到）
'use strict';
const isAdmin=()=>typeof CLOUD!=='undefined'&&CLOUD.admin&&(!!CLOUD.view||cloudOn());
const viewing=()=>typeof CLOUD!=='undefined'&&CLOUD.view&&isAdmin()?CLOUD.view:null;   // 正在編輯其他玩家的聯盟
const AD={tab:'players', q:'', team:'all', page:0, per:40, sel:null, draft:null, note:null,
  sql:"SELECT id, name, pos, ovr, pot, team_id FROM players ORDER BY ovr DESC LIMIT 20;", result:null};

/* ---------- 主選單：管理員入口 ---------- */
const _renderMenu=renderMenu;
renderMenu=function(){
  _renderMenu();
  const nav=$('#menu .mbtns'), btn=nav.querySelector('[data-go="admin"]');
  if(isAdmin()){
    if(!btn) nav.insertAdjacentHTML('beforeend','<button class="mbtn admin" data-go="admin"><i>08</i><b>管理員</b><span>修改全部數據</span></button>');
    $('#pbar .pb-name b').insertAdjacentHTML('afterend','<em class="adm-badge">管理員</em>');
  } else if(btn) btn.remove();
};
$('#menu').addEventListener('click',e=>{const b=e.target.closest('[data-go="admin"]'); if(b&&isAdmin())openAdmin();});
if(!$('#home').hidden&&me()) renderMenu();

function openAdmin(tab){ if(!isAdmin())return; if(tab)AD.tab=tab; AD.note=null; renderAdmin(); $('#admin').hidden=false; }
$('#admin').addEventListener('click',e=>{if(e.target.id==='admin'&&!viewing()){$('#admin').hidden=true; renderMenu();}});

function renderAdmin(){
  const v=viewing();
  const tabs=v?[['players','球員'],['teams','球隊'],['sql','SQL 主控台']]
    :[['players','球員'],['teams','球隊'],['cloud','雲端玩家'],['accounts','這台電腦的玩家'],['sql','SQL 主控台']];
  if(!tabs.some(([k])=>k===AD.tab)) AD.tab='players';
  const mine=AD.tab==='players'||AD.tab==='teams'||AD.tab==='sql';
  $('#adminBody').innerHTML=`${v?'<button class="hot-btn sm dlg-x" data-adexit="1">結束編輯</button>':closeBtn('admin')}
    <h1>管理員<small>${esc((CLOUD.user&&CLOUD.user.email)||'')}・可修改全部數據</small></h1>
    ${v?`<p class="tr-note ad-view">正在編輯玩家「<b>${esc(v.name||'')}</b>」（${esc(v.email||'')}）的聯盟。改動會直接存回他的雲端存檔，他下次開遊戲就會看到。<span id="adViewSt">${esc(CLOUD.viewStatus||'')}</span></p>`
      :mine?'<p class="tr-tip">「球員」「球隊」「SQL 主控台」改的是你自己的聯盟。要改其他玩家的，到「雲端玩家」按「打開聯盟」。</p>':''}
    <div class="tr-tabs">${tabs.map(([k,l])=>`<button data-adtab="${k}" class="${AD.tab===k?'sel':''}">${l}</button>`).join('')}</div>
    ${AD.note?`<p class="tr-note ${AD.note.ok?'ok':'bad'}">${esc(AD.note.msg)}</p>`:''}
    <div id="adBody"></div>`;
  ({players:renderAdPlayers, teams:renderAdTeams, cloud:renderAdCloud, accounts:renderAdAccounts, sql:renderAdSQL})[AD.tab]();
}
// 編輯其他玩家的聯盟時，存檔狀態（cloud.js 的 pushView 會呼叫）
function adminViewStatus(){ const el=$('#adViewSt'); if(el) el.textContent=CLOUD.viewStatus||''; }
const note=(ok,msg)=>{AD.note={ok,msg}; renderAdmin();};
const clampN=(v,a,b)=>Math.max(a,Math.min(b,Math.round(+v||0)));

/* ---------- 球員 ---------- */
const fld=(label,key,val,type='number',attrs='')=>`<label><span>${label}</span><input data-f="${key}" type="${type}" value="${esc(val??'')}" ${attrs}></label>`;
const sel=(label,key,val,opts)=>`<label><span>${label}</span><select data-f="${key}">${opts.map(([v,l])=>`<option value="${esc(v)}"${String(v)===String(val??'')?' selected':''}>${esc(l)}</option>`).join('')}</select></label>`;
const R99=`min="1" max="${ABIL_MAX}"`;   // 能力上限 150（稀有度的上限只限制訓練，管理員可以直接改）
function renderAdPlayers(){
  const f={team:AD.team, level:'all', type:'all', q:AD.q, sort:'ovr'};
  const {total,ids}=queryPlayers(f,AD.per,AD.page*AD.per), pages=Math.max(1,Math.ceil(total/AD.per));
  if(!AD.sel||!LEAGUE.players[AD.sel]) {AD.sel=ids[0]||null; AD.draft=null;}
  const teamOpts=[['all','全部球隊'],...LEAGUE.teams.map(t=>[t.id,t.name]),['fa','自由球員']];
  $('#adBody').innerHTML=`<div class="ad-grid"><section>
      <div class="tr-fa-ctl"><label>姓名／編號<input data-ad="q" value="${esc(AD.q)}" placeholder="搜尋"></label>
        <label>球隊<select data-ad="team">${teamOpts.map(([v,l])=>`<option value="${v}"${v===AD.team?' selected':''}>${l}</option>`).join('')}</select></label></div>
      <div class="tr-list tall"><table class="box tr-t"><tr><th>編號</th><th>姓名</th><th>球隊</th><th>位置</th><th>總評</th><th>潛力</th></tr>
        ${ids.map(id=>{const p=LEAGUE.players[id], t=teamById(p.team);
          return `<tr data-adsel="${id}" class="${id===AD.sel?'sel':''}"><td>${id}</td><td>${esc(p.name)}${p.enh?` <em class="enh">+${p.enh}</em>`:''}</td><td>${t.short}${p.level===2?'・二軍':''}</td><td>${posAbbr(p)}</td><td><b>${p.ovr}</b></td><td>${p.pot}</td></tr>`;}).join('')}</table></div>
      <div class="dbv-pager"><button class="ghost" data-adpg="-1" ${AD.page?'':'disabled'}>上一頁</button><span>${AD.page+1} / ${pages}・共 ${total} 人</span><button class="ghost" data-adpg="1" ${AD.page<pages-1?'':'disabled'}>下一頁</button></div>
      <div class="roster-btns"><button class="ghost" data-adnew="H">＋ 新增野手</button><button class="ghost" data-adnew="P">＋ 新增投手</button></div>
    </section><section class="ad-edit">${AD.sel?playerForm(AD.draft||LEAGUE.players[AD.sel]):'<p class="lead">沒有符合條件的球員。</p>'}</section></div>`;
}
function playerForm(p){
  const H=p.kind==='H', posOpts=Object.keys(POS_T).map(k=>[k,POS_NAME[k]]);
  const teamOpts=[['','自由球員'],...LEAGUE.teams.map(t=>[t.id,t.name])];
  return `<div class="tm-head"><img src="${avatar(p,teamById(p.team))}" alt=""><div><b>${esc(p.name)}</b><span>${p.id}・${H?'野手':'投手'}</span>
      <button class="lnk" data-card="${p.id}">看球員卡</button></div></div>
    <form class="ad-form" onsubmit="return false">
      <h3>基本資料</h3><div class="ad-f">
        ${fld('姓名','name',p.name,'text','maxlength="12"')}${fld('年齡','age',p.age,'number','min="15" max="50"')}${fld('背號','num',p.num,'number','min="0" max="99"')}
        ${sel('球隊','team',p.team||'',teamOpts)}${sel('一二軍','level',p.level||1,[[1,'一軍'],[2,'二軍']])}${sel('等級','tier',p.tier,Object.entries(TIER_NAME))}${sel('卡片稀有度','rar',rarOf(p).id,RARITY.map(r=>[r.id,r.name]))}
        ${sel('投','throws',p.throws,[['R','右投'],['L','左投']])}${sel('打','bats',p.bats,[['R','右打'],['L','左打']])}
        ${fld('身高','height',p.height,'number','min="150" max="220"')}${fld('體重','weight',p.weight,'number','min="50" max="150"')}${fld('出身','hometown',p.hometown,'text','maxlength="8"')}
      </div>
      <h3>合約與評價</h3><div class="ad-f">
        ${fld('年薪（萬）','salary',p.salary,'number','min="0" max="99999"')}${fld('合約年數','years',p.years,'number','min="0" max="10"')}${fld('強化等級','enh',p.enh||0,'number','min="0" max="5"')}
        ${fld('總評','ovr',p.ovr,'number',R99)}${fld('潛力','pot',p.pot,'number',R99)}
        <label class="ad-chk"><input type="checkbox" data-f="_auto" checked> 儲存時依能力重算總評</label>
      </div>
      ${H?`<h3>守備位置</h3><div class="ad-f">${sel('本職','pos',p.pos,posOpts)}
          <div class="ad-alt"><span>可兼守</span>${posOpts.map(([k,l])=>`<label><input type="checkbox" data-alt="${k}" ${p.alt.includes(k)?'checked':''}>${l}</label>`).join('')}</div></div>
        <h3>打擊與守備能力</h3><div class="ad-f">${[['pow','力量'],['con','技巧'],['eye','選球'],['spd','速度'],['fld','接球'],['thr','傳球'],['arm','臂力']].map(([k,l])=>fld(l,k,p[k],'number',R99)).join('')}</div>
        <h3>冷熱區（捕手視角，−2 冷～+2 熱）</h3><div class="ad-hz">${p.hz.map((v,i)=>`<select data-hz="${i}">${[-2,-1,0,1,2].map(x=>`<option value="${x}"${x===v?' selected':''}>${x>0?'+'+x:x}</option>`).join('')}</select>`).join('')}</div>`
      :`<h3>投手能力</h3><div class="ad-f">${sel('角色','prole',p.prole,[['SP','先發'],['RP','中繼'],['CL','終結']])}${[['velo','球速'],['ctrl','控球'],['stam','體力']].map(([k,l])=>fld(l,k,p[k],'number',R99)).join('')}</div>
        <h3>球種（最多 5 種，至少要有四縫線、二縫線、伸卡其中一種）</h3><div class="ad-pitches">${p.pitches.map((x,i)=>`<div class="ad-pr">
          <select data-pn="${i}">${Object.keys(PITCH_DEFS).map(n=>`<option${n===x.n?' selected':''}>${n}</option>`).join('')}</select>
          <input type="number" data-pr="${i}" value="${x.r}" ${R99}><button class="ghost sm warn" data-prm="${i}" ${p.pitches.length<=1?'disabled':''}>移除</button></div>`).join('')}
          ${p.pitches.length<5?'<button class="ghost sm" data-padd="1">＋ 新增球種</button>':''}</div>`}
      <div class="ad-actions"><button class="hot-btn sm" data-adsave="1">儲存</button><button class="ghost" data-adreset="1">還原修改</button><button class="ghost warn" data-addel="1">刪除球員</button></div>
    </form>`;
}
// 把表單讀成一份草稿（不會動到原始資料）
function readForm(){
  const orig=LEAGUE.players[AD.sel], d=JSON.parse(JSON.stringify(AD.draft||orig)), box=$('#adBody .ad-form');
  box.querySelectorAll('[data-f]').forEach(el=>{const k=el.dataset.f; if(k==='_auto')return d._auto=el.checked; d[k]=el.type==='number'?+el.value:el.value;});
  d.team=d.team||null; d.level=d.team?+d.level:null;
  if(d.kind==='H'){d.alt=[...box.querySelectorAll('[data-alt]')].filter(x=>x.checked&&x.dataset.alt!==d.pos).map(x=>x.dataset.alt);
    d.hz=[...box.querySelectorAll('[data-hz]')].map(x=>+x.value);}
  else d.pitches=[...box.querySelectorAll('[data-pn]')].map((x,i)=>({n:x.value, r:+box.querySelector(`[data-pr="${i}"]`).value}));
  return d;
}
async function savePlayer(){
  const d=readForm(), p=LEAGUE.players[AD.sel];
  if(!d.name.trim()) return note(false,'姓名不能空白');
  if(d.kind==='P'&&!d.pitches.some(x=>FB_BASE.includes(x.n))) return note(false,'投手至少要有四縫線、二縫線、伸卡其中一種');
  const oldTeam=p.team, oldLevel=p.level;
  Object.assign(p,{name:d.name.trim().slice(0,12), age:clampN(d.age,15,50), tier:d.tier, throws:d.throws, bats:d.bats,
    height:clampN(d.height,150,220), weight:clampN(d.weight,50,150), hometown:(d.hometown||'').trim().slice(0,8),
    salary:clampN(d.salary,0,99999), years:clampN(d.years,0,10), enh:clampN(d.enh,0,5), ovr:clampN(d.ovr,1,ABIL_MAX), pot:clampN(d.pot,1,ABIL_MAX), rar:d.rar});
  if(p.kind==='H'){ ['pow','con','eye','spd','fld','thr','arm'].forEach(k=>p[k]=clampN(d[k],1,ABIL_MAX)); p.pos=d.pos; p.alt=d.alt; p.hz=d.hz.map(v=>clampN(v,-2,2)); }
  else { ['velo','ctrl','stam'].forEach(k=>p[k]=clampN(d[k],1,ABIL_MAX)); p.prole=d.prole; p.pitches=d.pitches.slice(0,5).map(x=>({n:x.n, r:clampN(x.r,1,ABIL_MAX)})); }
  if(d._auto) recalcOvr(p);
  const numWanted=clampN(d.num,0,99);
  if(d.team!==oldTeam||d.level!==oldLevel) movePlayer(LEAGUE,p.id,d.team,d.level||1);
  // 背號：同隊沒人用才改
  const t=LEAGUE.teams.find(x=>x.id===p.team), taken=t?new Set([...t.roster,...t.farm].filter(x=>x!==p.id).map(x=>LEAGUE.players[x].num)):new Set();
  const numMsg=taken.has(numWanted)?`（背號 ${numWanted} 已有人使用，維持 ${p.num}）`:''; if(!taken.has(numWanted)) p.num=numWanted;
  [oldTeam,p.team].forEach(id=>{const tt=LEAGUE.teams.find(x=>x.id===id); if(tt){fitRoster(LEAGUE,tt,false);}});
  AD.draft=null; await saveLeague(); renderSetup();
  note(true,`已儲存 ${p.name}（總評 ${p.ovr}）${numMsg}`);
}
function newPlayer(kind){
  const nums=Object.keys(LEAGUE.players).map(id=>+id.slice(1)).filter(Number.isFinite);
  const id=(kind==='H'?'b':'p')+String(Math.max(0,...nums)+1).padStart(4,'0');
  const base={id, kind, name:kind==='H'?'新野手':'新投手', team:null, level:null, num:0, age:22, tier:'bench', salary:100, years:0,
    height:180, weight:80, hometown:'台北市', bats:'R', throws:'R', enh:0, pos:kind==='H'?'CF':'P'};
  const p=kind==='H'?{...base, alt:[], pow:50, con:50, eye:50, spd:50, fld:50, thr:50, arm:50, hz:Array(9).fill(0)}
    :{...base, prole:'RP', velo:50, ctrl:50, stam:45, pitches:[{n:'四縫線', r:50}]};
  recalcOvr(p); p.pot=Math.min(ABIL_MAX,p.ovr+10);
  LEAGUE.players[id]=p; LEAGUE.freeAgents.push(id);
  AD.sel=id; AD.draft=null; AD.q=id; AD.team='all'; AD.page=0;
  return saveLeague().then(()=>note(true,`已新增 ${id}（自由球員），可以在右邊編輯`));
}
async function deletePlayer(){
  const p=LEAGUE.players[AD.sel], t=LEAGUE.teams.find(x=>x.id===p.team);
  if(t){const left=k=>[...t.roster,...t.farm].filter(id=>id!==p.id&&LEAGUE.players[id].kind===k).length;
    if(left('H')<9||left('P')<5) return note(false,`${t.short}的野手或投手會不夠打比賽，請先補人再刪除`);}
  if(!confirm(`永久刪除 ${p.name}（${p.id}）？`))return;
  if(t){t.roster=t.roster.filter(x=>x!==p.id); t.farm=t.farm.filter(x=>x!==p.id); fitRoster(LEAGUE,t,false);}
  LEAGUE.freeAgents=LEAGUE.freeAgents.filter(x=>x!==p.id); delete LEAGUE.players[p.id];
  AD.sel=null; AD.draft=null; await saveLeague(); renderSetup();
  note(true,`已刪除 ${p.name}`);
}

/* ---------- 球隊 ---------- */
function renderAdTeams(){
  $('#adBody').innerHTML=`<div class="tr-list"><table class="box tr-t ad-teams"><tr><th>編號</th><th>名稱</th><th>簡稱</th><th>代表色</th><th>主場</th><th>簡介</th><th>輪值進度</th><th>人數</th><th>薪資（萬）</th></tr>
    ${LEAGUE.teams.map(t=>`<tr data-team="${t.id}"><td>${t.id}</td>
      <td><input data-tf="name" value="${esc(t.name)}" maxlength="8"></td><td><input data-tf="short" value="${esc(t.short)}" maxlength="3" size="4"></td>
      <td><input data-tf="color" type="color" value="${t.color}"></td><td><input data-tf="park" value="${esc(t.park)}" maxlength="10"></td>
      <td><input data-tf="note" value="${esc(t.note)}" maxlength="24"></td><td><input data-tf="rotIdx" type="number" min="0" max="${t.rotation.length-1}" value="${t.rotIdx}"></td>
      <td>${t.roster.length}＋${t.farm.length}</td><td>${payroll(LEAGUE,t).toLocaleString()}</td></tr>`).join('')}</table></div>
    <div class="ad-actions"><button class="hot-btn sm" data-teamsave="1">儲存全部球隊</button></div>`;
}
async function saveTeams(){
  for(const row of $('#adBody').querySelectorAll('tr[data-team]')){
    const t=LEAGUE.teams.find(x=>x.id===row.dataset.team), v=k=>row.querySelector(`[data-tf="${k}"]`).value.trim();
    if(!v('name')||!v('short')) return note(false,'球隊名稱與簡稱不能空白');
    Object.assign(t,{name:v('name'), short:v('short'), color:v('color'), park:v('park'), note:v('note'), rotIdx:clampN(v('rotIdx'),0,Math.max(0,t.rotation.length-1))});
  }
  Object.keys(AVATARS).forEach(k=>delete AVATARS[k]);   // 代表色變了，大頭照重畫
  await saveLeague(); renderSetup(); note(true,'球隊資料已儲存');
}

/* ---------- 雲端玩家（supabase/admin.sql 的 admin_players） ---------- */
AD.cloud={rows:null, err:null, loading:false};
async function loadCloudPlayers(){
  AD.cloud.loading=true; AD.cloud.err=null; if(AD.tab==='cloud') renderAdCloud();
  try{ AD.cloud.rows=await adminPlayers(); }catch(e){ AD.cloud.err=e.message||String(e); }
  AD.cloud.loading=false; if(AD.tab==='cloud'&&!$('#admin').hidden) renderAdCloud();
}
function renderAdCloud(){
  const c=AD.cloud, rows=c.rows||[], fmt=s=>s?new Date(s).toLocaleString('zh-TW',{hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
  if(!c.rows&&!c.loading&&!c.err) loadCloudPlayers();
  const city=id=>{const d=TEAM_DEFS.find(t=>t.id===id); return d?d.city:'（未選隊）';};
  $('#adBody').innerHTML=`<p class="tr-tip">所有註冊過雲端帳號的玩家。改金幣、積分後按「儲存」；「打開聯盟」可以用球員、球隊、SQL 分頁編輯他的聯盟；「重置聯盟」會讓他從全新的聯盟開始（金幣、積分不變）。
      玩家剛好在玩的話，他的遊戲會在切回視窗或回主選單時載入新的進度。<button class="ghost sm" data-clref="1">重新整理清單</button></p>
    ${c.err?`<p class="tr-note bad">讀取失敗：${esc(c.err)}（還沒在 Supabase 執行 supabase/admin.sql 的話，請先執行）</p>`:''}
    ${c.loading&&!c.rows?'<p class="lead">讀取中…</p>':`<div class="tr-list tall"><table class="box tr-t ad-cloud"><tr><th>暱稱</th><th>Email</th><th>主場</th><th>金幣</th><th>積分</th><th>戰績</th><th>最後存檔</th><th>最後登入</th><th></th></tr>
      ${rows.map(r=>{const p=r.profile, me_=CLOUD.user&&r.user_id===CLOUD.user.id;
        return `<tr data-cl="${r.user_id}"><td>${p?esc(p.name||''):'<small>（沒有存檔）</small>'}${me_?' <em class="adm-badge">你</em>':''}</td><td>${esc(r.email||'')}</td>
          <td>${p?city(p.team):''}</td>
          <td>${p?`<input data-cf="coins" type="number" min="0" value="${p.coins||0}">`:''}</td><td>${p?`<input data-cf="pts" type="number" min="0" value="${p.pts||0}">`:''}</td>
          <td>${p?`${p.w||0}-${p.l||0}${p.t?`-${p.t}`:''}`:''}</td><td>${fmt(r.updated_at)}</td><td>${fmt(r.last_sign_in_at)}</td>
          <td class="act">${p?`<button class="ghost sm" data-clsave="1">儲存</button>${me_?'':`<button class="ghost sm" data-clopen="1" ${r.league_size?'':'disabled'}>打開聯盟</button><button class="ghost sm warn" data-clreset="1" ${r.league_size?'':'disabled'}>重置聯盟</button>`}`:''}</td></tr>`;}).join('')}</table></div>`}`;
}
async function cloudRowAction(kind,row){
  const r=(AD.cloud.rows||[]).find(x=>x.user_id===row.dataset.cl); if(!r) return;
  const name=r.profile&&r.profile.name||r.email;
  let res;
  if(kind==='save'){ const v=k=>clampN(row.querySelector(`[data-cf="${k}"]`).value,0,1e9);
    res=await adminSaveProfile(r.user_id,r.rev,{...r.profile, coins:v('coins'), pts:v('pts')}); }
  if(kind==='open'){ if(!confirm(`打開「${name}」的聯盟來編輯？頁面會重新整理，編輯完按「結束編輯」回到你自己的聯盟。`)) return;
    res=await adminOpenLeague(r.user_id,r.email,name); if(res.ok) return; }
  if(kind==='reset'){ if(!confirm(`重置「${name}」的聯盟？他的球隊、抽到的卡、聯賽戰績都會清除，從全新的聯盟開始（金幣、積分不變）。這個動作不能復原。`)) return;
    res=await adminResetLeague(r.user_id,r.rev); }
  AD.note={ok:res.ok, msg:res.msg}; AD.cloud.rows=null; renderAdmin();
}

/* ---------- 這台電腦的玩家 ---------- */
function renderAdAccounts(){
  const list=Object.entries(PROFILES.list).filter(([k])=>!k.startsWith('cloud:')).map(([,p])=>p);
  $('#adBody').innerHTML=`<p class="tr-tip">只在這台電腦玩的玩家（存在瀏覽器的 localStorage，不會同步）。雲端玩家請到「雲端玩家」分頁。</p>
    <div class="tr-list"><table class="box tr-t"><tr><th>暱稱</th><th>主隊</th><th>金幣</th><th>積分</th><th>勝</th><th>敗</th><th>和</th><th>今日已訓練</th><th></th></tr>
    ${list.map(p=>`<tr data-acc="${esc(p.name)}"><td>${esc(p.name)}</td>
      <td><select data-af="team">${LEAGUE.teams.map(t=>`<option value="${t.id}"${t.id===p.team?' selected':''}>${t.short}</option>`).join('')}</select></td>
      <td><input data-af="coins" type="number" min="0" value="${p.coins}"></td><td><input data-af="pts" type="number" min="0" value="${p.pts||0}"></td><td><input data-af="w" type="number" min="0" value="${p.w}"></td>
      <td><input data-af="l" type="number" min="0" value="${p.l}"></td><td><input data-af="t" type="number" min="0" value="${p.t}"></td>
      <td><input data-af="trainUsed" type="number" min="0" max="${TRAIN_FREE}" value="${p.train&&p.train.date===today()?p.train.used:0}"></td>
      <td class="act"><button class="ghost sm" data-accsave="1">儲存</button>${p.name===PROFILES.current?'':'<button class="ghost sm warn" data-accdel="1">刪除</button>'}</td></tr>`).join('')}</table></div>`;
}
function saveAccount(row){
  const p=PROFILES.list[row.dataset.acc], v=k=>row.querySelector(`[data-af="${k}"]`).value;
  p.team=v('team'); p.coins=clampN(v('coins'),0,1e9); p.pts=clampN(v('pts'),0,1e9); p.w=clampN(v('w'),0,1e6); p.l=clampN(v('l'),0,1e6); p.t=clampN(v('t'),0,1e6);
  p.train={date:today(), used:clampN(v('trainUsed'),0,TRAIN_FREE)};
  saveProfiles(); if(p===me())applySettings(); note(true,`已更新玩家 ${p.name}`);
}

/* ---------- SQL 主控台 ---------- */
const SQL_PRESETS=[
  ['總評前 20 名',"SELECT id, name, pos, ovr, pot, team_id FROM players ORDER BY ovr DESC LIMIT 20;"],
  ['各隊薪資',"SELECT team_id, COUNT(*) AS 人數, SUM(salary) AS 薪資 FROM players WHERE team_id IS NOT NULL GROUP BY team_id;"],
  ['交易紀錄',"SELECT * FROM transactions ORDER BY id DESC LIMIT 50;"],
  ['資料表結構',"SELECT name, sql FROM sqlite_master WHERE type='table';"],
];
function renderAdSQL(){
  const r=AD.result;
  $('#adBody').innerHTML=`${DB?'':'<p class="tr-note bad">目前沒有載入 SQLite（sql.js 沒有載入），無法使用 SQL。</p>'}
    <p class="tr-tip">直接對球員資料庫下 SQL。修改後會重新載入聯盟資料並存檔；改壞了可以到「設定 → 還原球員資料庫」。資料表：players、pitches、teams、transactions、meta。</p>
    <div class="roster-btns">${SQL_PRESETS.map(([l],i)=>`<button class="ghost sm" data-sqlp="${i}">${l}</button>`).join('')}</div>
    <textarea id="adSql" class="ad-sql" spellcheck="false">${esc(AD.sql)}</textarea>
    <div class="ad-actions"><button class="hot-btn sm" data-sqlrun="1" ${DB?'':'disabled'}>執行</button><button class="ghost" id="adExport" ${DB?'':'disabled'}>匯出 players.sqlite</button></div>
    ${r?(r.error?`<p class="tr-note bad">${esc(r.error)}</p>`:`<p class="tr-tip">${esc(r.msg)}</p>${r.cols?`<div class="tr-list"><table class="box tr-t"><tr>${r.cols.map(c=>`<th>${esc(c)}</th>`).join('')}</tr>
      ${r.rows.map(row=>`<tr>${row.map(v=>`<td>${esc(v===null?'NULL':v)}</td>`).join('')}</tr>`).join('')}</table></div>`:''}`):''}`;
}
async function runSQL(){
  AD.sql=$('#adSql').value;
  if(!DB||!AD.sql.trim()) return;
  await saveLeague();                                   // 先把記憶體中的變動寫回
  const writes=/\b(insert|update|delete|replace|alter|create|drop)\b/i.test(AD.sql);
  let res;
  try{ res=DB.exec(AD.sql); }catch(e){ AD.result={error:'SQL 錯誤：'+e.message}; return renderAdmin(); }
  const last=res[res.length-1], changed=DB.getRowsModified();
  AD.result={cols:last&&last.columns, rows:last?last.values.slice(0,200):[], msg:last?`共 ${last.values.length} 列${last.values.length>200?'（只顯示前 200 列）':''}`:`執行完成，最後一個指令影響 ${changed} 列`};
  if(writes){
    try{ reloadLeague(); await persistDB(); renderSetup(); AD.result.msg+='・已重新載入聯盟並存檔'; }
    catch(e){ AD.result={error:`資料已改動，但聯盟資料重新載入失敗（${e.message}）。這次改動沒有存檔，重新整理網頁就會回到改之前。`}; }
  }
  renderAdmin();
}

/* ---------- 事件 ---------- */
$('#adminBody').addEventListener('click',async e=>{
  const el=s=>e.target.closest(s);
  if(el('[data-adtab]')){AD.tab=el('[data-adtab]').dataset.adtab; AD.note=null; return renderAdmin();}
  if(el('[data-card]')) return openCard(el('[data-card]').dataset.card);
  const row=el('tr[data-adsel]'); if(row){AD.sel=row.dataset.adsel; AD.draft=null; AD.note=null; return renderAdmin();}
  if(el('[data-adpg]')){AD.page+=+el('[data-adpg]').dataset.adpg; return renderAdmin();}
  if(el('[data-adnew]')) return newPlayer(el('[data-adnew]').dataset.adnew);
  if(el('[data-adsave]')) return savePlayer();
  if(el('[data-adreset]')){AD.draft=null; return note(true,'已還原成目前存檔的資料');}
  if(el('[data-addel]')) return deletePlayer();
  if(el('[data-padd]')){const d=readForm(); d.pitches.push({n:'變速球', r:50}); AD.draft=d; return renderAdPlayers();}
  if(el('[data-prm]')){const d=readForm(); d.pitches.splice(+el('[data-prm]').dataset.prm,1); AD.draft=d; return renderAdPlayers();}
  if(el('[data-teamsave]')) return saveTeams();
  if(el('[data-accsave]')) return saveAccount(el('tr[data-acc]'));
  if(el('[data-accdel]')){const n=el('tr[data-acc]').dataset.acc; if(confirm(`刪除玩家「${n}」？他在這台電腦的聯盟存檔也會一起刪除。`)){delete PROFILES.list[n]; saveProfiles(); await deleteLeagueSave(n); note(true,`已刪除玩家 ${n}`);} return;}
  // 雲端玩家、結束編輯其他玩家的聯盟
  if(el('[data-adexit]')) return adminExitView();
  if(el('[data-clref]')){AD.cloud.rows=null; AD.note=null; return renderAdmin();}
  if(el('[data-clsave]')) return cloudRowAction('save',el('tr[data-cl]'));
  if(el('[data-clopen]')) return cloudRowAction('open',el('tr[data-cl]'));
  if(el('[data-clreset]')) return cloudRowAction('reset',el('tr[data-cl]'));
  if(el('[data-sqlp]')){AD.sql=SQL_PRESETS[+el('[data-sqlp]').dataset.sqlp][1]; AD.result=null; return renderAdmin();}
  if(el('[data-sqlrun]')) return runSQL();
  if(e.target.id==='adExport') return exportLeague();
});
$('#adminBody').addEventListener('change',e=>{const k=e.target.dataset.ad; if(k==='team'){AD.team=e.target.value; AD.page=0; renderAdmin();}});
$('#adminBody').addEventListener('input',e=>{
  if(e.target.dataset.ad==='q'){AD.q=e.target.value.trim(); AD.page=0; renderAdPlayers(); const i=$('[data-ad="q"]'); i.focus(); i.setSelectionRange(i.value.length,i.value.length);}
});
