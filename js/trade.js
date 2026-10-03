// trade.js — 交易中心：和 AI 球隊交易、簽自由球員、升降二軍與釋出、交易紀錄
// 依賴：engine.js（tradeCheck、aiOffer、executeTrade…）、db.js（LEAGUE、saveLeague、queryPlayers）、cards.js（openCard、grade）、ui.js（pick、renderSetup）
'use strict';
const TR={tab:'trade', partner:null, give:new Set(), get:new Set(), lvA:'all', lvB:'all', fa:{type:'all', q:'', sort:'ovr'}, note:null};
const myTeam=()=>teamOf(pick.me);
const money=v=>`${(v/10000).toFixed(2)} 億`;
const P_=id=>LEAGUE.players[id];

function openTrade(){
  if(!TR.partner||TR.partner===pick.me) TR.partner=LEAGUE.teams.find(t=>t.id!==pick.me).id;
  TR.give.clear(); TR.get.clear(); TR.note=null;
  $('#trade').hidden=false; renderTrade();
}
async function afterChange(note){
  TR.note=note; await saveLeague(); renderSetup(); renderTrade();
}
$('#tradeBtn').onclick=openTrade;

function renderTrade(){
  // 重畫時保留清單的捲動位置
  const keep=TR.lastTab===TR.tab?[...document.querySelectorAll('#tradeBody .tr-list')].map(e=>e.scrollTop):[];
  TR.lastTab=TR.tab; drawTrade();
  document.querySelectorAll('#tradeBody .tr-list').forEach((e,i)=>{if(keep[i])e.scrollTop=keep[i];});
}
function drawTrade(){
  const t=myTeam(), pay=payroll(LEAGUE,t);
  const tabs=[['trade','交易'],['fa','自由球員'],['roster','名單管理'],['log','交易紀錄'],['market','玩家市場']];   // 玩家市場在 market.js
  $('#tradeHd').innerHTML=`<h1><i class="dot" style="background:${t.color}"></i>交易市場<small>${t.name}</small></h1>
    <div class="tr-stat"><span>名單 <b>${t.roster.length}</b> 一軍＋<b>${t.farm.length}</b> 二軍／上限 ${ROSTER_MAX}</span>
      <span>薪資 <b>${money(pay)}</b>／上限 ${money(SALARY_CAP)}</span><span class="cap"><i style="width:${Math.min(100,pay/SALARY_CAP*100)}%"></i></span></div>
    <div class="tr-tabs">${tabs.map(([k,l])=>`<button data-tab="${k}" class="${TR.tab===k?'sel':''}">${l}</button>`).join('')}</div>
    ${TR.note?`<p class="tr-note ${TR.note.ok?'ok':'bad'}">${TR.note.msg}</p>`:''}`;
  ({trade:renderTradeTab, fa:renderFATab, roster:renderRosterTab, log:renderLogTab, market:renderMarketTab})[TR.tab]();
}

// 球員列：勾選框、姓名（點了看球員卡）、位置、總評、潛力、年齡、年薪、一二軍、交易價值
function pRow(p, opts={}){
  const g=grade(p.pot);
  return `<tr data-id="${p.id}" class="${opts.sel?'sel':''}">
    ${opts.check?`<td><input type="checkbox" ${opts.sel?'checked':''} aria-label="選擇 ${p.name}"></td>`:''}
    <td class="nm"><button class="lnk" data-card="${p.id}">${p.name}</button></td><td>${posAbbr(p)}</td><td><b>${p.ovr}</b></td>
    <td><span class="gr g-${g}">${g}</span></td><td>${p.age}</td><td>${p.salary.toLocaleString()}</td><td>${p.level===1?'一軍':p.level===2?'二軍':'—'}</td>
    <td>${playerValue(p)}</td>${opts.extra||''}</tr>`;
}
const pHead=(check,extra='')=>`<tr>${check?'<th></th>':''}<th>姓名</th><th>位置</th><th>總評</th><th>潛力</th><th>年齡</th><th>年薪(萬)</th><th>層級</th><th>價值</th>${extra}</tr>`;
const sortIds=ids=>ids.slice().sort((a,b)=>P_(b).ovr-P_(a).ovr);

/* ---------- 交易 ---------- */
function renderTradeTab(){
  const A=myTeam(), B=teamOf(TR.partner);
  const list=(t,lv,sel)=>sortIds(lv==='1'?t.roster:lv==='2'?t.farm:[...t.roster,...t.farm]).map(id=>pRow(P_(id),{check:true, sel:sel.has(id)})).join('');
  const lvSel=(k,v)=>`<select data-lv="${k}">${[['all','一軍＋二軍'],['1','一軍'],['2','二軍']].map(([x,l])=>`<option value="${x}"${x===v?' selected':''}>${l}</option>`).join('')}</select>`;
  const give=[...TR.give], get=[...TR.get], r=tradeCheck(LEAGUE,A.id,B.id,give,get);
  const pct=Math.round(Math.min(1.3,r.ratio)/1.3*100), col=r.ok?'#2e9b56':r.ratio>=0.85?'#d99a1e':'#d9482b';
  const names=ids=>ids.length?ids.map(id=>P_(id).name).join('、'):'（未選）';
  $('#tradeBody').innerHTML=`<div class="tr-grid">
    <section><h2>我方送出 ${lvSel('A',TR.lvA)}</h2><div class="tr-list"><table class="box tr-t" data-side="give">${pHead(true)}${list(A,TR.lvA,TR.give)}</table></div></section>
    <section class="tr-mid">
      <h2>交易對象</h2>
      <select id="trPartner">${LEAGUE.teams.filter(t=>t.id!==A.id).map(t=>`<option value="${t.id}"${t.id===B.id?' selected':''}>${t.name}</option>`).join('')}</select>
      <div class="tr-sum"><div><i>送出</i>${names(give)}<b>價值 ${r.valGive}</b></div><div><i>換來</i>${names(get)}<b>價值 ${r.valGet}</b></div></div>
      <div class="tr-acc"><span>${B.short}的接受度</span><div class="bar"><i style="width:${pct}%;background:${col}"></i></div><p>${give.length||get.length?r.msg:'在兩邊勾選球員'}</p></div>
      <div class="tr-pay"><span>交易後薪資</span><b>${A.short} ${money(r.payA)}</b><b>${B.short} ${money(r.payB)}</b></div>
      <button class="ghost" id="trOffer" ${give.length?'':'disabled'}>請${B.short}開價</button>
      <button class="go" id="trDo" ${r.ok?'':'disabled'}>提出交易</button>
      <button class="ghost" id="trClear">清除選擇</button>
      <p class="tr-tip">價值主要看總評，25 歲以下加計潛力，33 歲以上打折；對方缺的位置會多算 15%，對方要多賺 ${Math.round((AI_MARGIN-1)*100)}% 才肯交易。</p>
    </section>
    <section><h2>${B.name}送出 ${lvSel('B',TR.lvB)}</h2><div class="tr-list"><table class="box tr-t" data-side="get">${pHead(true)}${list(B,TR.lvB,TR.get)}</table></div></section>
  </div>`;
}

/* ---------- 自由球員 ---------- */
function renderFATab(){
  const f=TR.fa, types=[['all','全部'],['H','野手'],['P','投手'],...['C','1B','2B','SS','3B','LF','CF','RF','DH'].map(x=>[x,POS_NAME[x]]),['SP','先發'],['RP','中繼'],['CL','終結']];
  const {total,ids}=queryPlayers({team:'fa', level:'all', type:f.type, q:f.q, sort:f.sort}, 60, 0);
  const t=myTeam(), room=SALARY_CAP-payroll(LEAGUE,t), full=teamSize(t)>=ROSTER_MAX;
  $('#tradeBody').innerHTML=`<div class="tr-fa-ctl">
      <label>位置<select data-fa="type">${types.map(([v,l])=>`<option value="${v}"${v===f.type?' selected':''}>${l}</option>`).join('')}</select></label>
      <label>排序<select data-fa="sort"><option value="ovr"${f.sort==='ovr'?' selected':''}>總評</option><option value="pot"${f.sort==='pot'?' selected':''}>潛力</option><option value="young"${f.sort==='young'?' selected':''}>年輕</option></select></label>
      <label>姓名<input data-fa="q" value="${f.q}" placeholder="搜尋"></label>
      <span>共 ${total} 人（顯示前 60）・薪資空間 ${room.toLocaleString()} 萬${full?'・名單已滿':''}</span></div>
    <div class="tr-list tall"><table class="box tr-t">${pHead(false,'<th></th>')}${ids.map(id=>{const p=P_(id);
      return pRow(p,{extra:`<td><button class="ghost sm" data-sign="${id}" ${full||p.salary>room?'disabled':''}>簽約</button></td>`});}).join('')}</table></div>
    <p class="tr-tip">簽下的球員會先放在二軍，合約 1～3 年（32 歲以上 1 年、24 歲以下 3 年）。</p>`;
}

/* ---------- 名單管理 ---------- */
function renderRosterTab(){
  const t=myTeam(), h=k=>t.roster.filter(id=>P_(id).kind===k).length;
  const rows=(ids,lv)=>sortIds(ids).map(id=>pRow(P_(id),{extra:`<td class="act"><button class="ghost sm" data-lvl="${id}" data-to="${lv===1?2:1}">${lv===1?'降二軍':'升一軍'}</button><button class="ghost sm warn" data-rel="${id}">釋出</button></td>`})).join('');
  $('#tradeBody').innerHTML=`<div class="ad-actions"><button class="hot-btn sm" data-optimize="1">一鍵配置陣容</button><span class="tr-tip">最強 13 野手＋13 投手上一軍，自動排打序、守備、輪值與牛棚</span></div>
  <div class="tr-grid two">
    <section><h2>一軍 ${t.roster.length}／${ACTIVE_MAX}（野手 ${h('H')}・投手 ${h('P')}）</h2><div class="tr-list tall"><table class="box tr-t">${pHead(false,'<th></th>')}${rows(t.roster,1)}</table></div></section>
    <section><h2>二軍 ${t.farm.length}</h2><div class="tr-list tall"><table class="box tr-t">${pHead(false,'<th></th>')}${rows(t.farm,2)}</table></div></section></div>
    <p class="tr-tip">一軍最多 ${ACTIVE_MAX} 人，野手、投手各至少 ${ACTIVE_MIN.H} 人。打序、輪值與牛棚會依一軍名單自動重排。</p>`;
}

/* ---------- 交易紀錄 ---------- */
function renderLogTab(){
  const tn=id=>id&&teamOf(id)?teamOf(id).short:'', nm=ids=>ids.map(id=>P_(id)?P_(id).name:'（已刪除的球員）').join('、');
  const line=e=>e.type==='trade'?`<b>${tn(e.a)}</b> 送出 ${nm(e.aOut)}，換來 <b>${tn(e.b)}</b> 的 ${nm(e.bOut)}`
    :e.type==='sign'?`<b>${tn(e.a)}</b> 簽下自由球員 ${nm(e.bOut)}`:`<b>${tn(e.a)}</b> 釋出 ${nm(e.aOut)}`;
  const log=LEAGUE.log.slice().reverse();
  $('#tradeBody').innerHTML=log.length?`<ul class="tr-log">${log.map(e=>`<li><time>${new Date(e.at).toLocaleString('zh-TW',{hour12:false,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</time>${line(e)}</li>`).join('')}</ul>`:'<p class="lead">還沒有任何交易或簽約。</p>';
}

/* ---------- 事件 ---------- */
$('#trade').addEventListener('click',async e=>{
  if(e.target.id==='trade'||e.target.closest('#tradeClose')) return $('#trade').hidden=true;
  const el=sel=>e.target.closest(sel);
  if(el('[data-tab]')){TR.tab=el('[data-tab]').dataset.tab; TR.note=null; return renderTrade();}
  if(el('[data-card]')) return openCard(el('[data-card]').dataset.card);
  const row=el('.tr-t[data-side] tr[data-id]');
  if(row){const set=row.closest('table').dataset.side==='give'?TR.give:TR.get, id=row.dataset.id; set.has(id)?set.delete(id):set.add(id); TR.note=null; return renderTrade();}
  if(el('#trClear')){TR.give.clear(); TR.get.clear(); TR.note=null; return renderTrade();}
  if(el('#trOffer')){const off=aiOffer(LEAGUE,pick.me,TR.partner,[...TR.give]); TR.get=new Set(off);
    TR.note=off.length?{ok:true,msg:`${teamOf(TR.partner).short}願意用 ${off.map(id=>P_(id).name).join('、')} 交換`}:{ok:false,msg:`${teamOf(TR.partner).short}找不到願意交換的組合`}; return renderTrade();}
  if(el('#trDo')){const give=[...TR.give], get=[...TR.get], r=executeTrade(LEAGUE,pick.me,TR.partner,give,get,pick.me);
    if(r.ok){TR.give.clear(); TR.get.clear(); return afterChange({ok:true, msg:`交易完成：送出 ${give.map(id=>P_(id).name).join('、')}，換來 ${get.map(id=>P_(id).name).join('、')}`});}
    TR.note={ok:false,msg:r.msg}; return renderTrade();}
  if(el('[data-sign]')){const r=signFA(LEAGUE,pick.me,el('[data-sign]').dataset.sign,pick.me); return r.ok?afterChange(r):(TR.note=r,renderTrade());}
  if(el('[data-optimize]')){const r=optimizeRoster(LEAGUE,myTeam()); return afterChange({ok:true, msg:`已重新配置陣容：升上一軍 ${r.up.length} 人、降到二軍 ${r.down.length} 人`});}
  if(el('[data-lvl]')){const b=el('[data-lvl]'), r=setLevel(LEAGUE,b.dataset.lvl,+b.dataset.to); return r.ok?afterChange(r):(TR.note=r,renderTrade());}
  if(el('[data-rel]')){const p=P_(el('[data-rel]').dataset.rel); if(!confirm(`確定釋出 ${p.name}？釋出後會變成自由球員。`))return;
    return afterChange(releasePlayer(LEAGUE,p.id,pick.me));}
});
$('#trade').addEventListener('change',e=>{
  if(e.target.id==='trPartner'){TR.partner=e.target.value; TR.get.clear(); TR.note=null; return renderTrade();}
  if(e.target.dataset.lv){TR['lv'+e.target.dataset.lv]=e.target.value; return renderTrade();}
  if(e.target.dataset.fa&&e.target.tagName==='SELECT'){TR.fa[e.target.dataset.fa]=e.target.value; return renderTrade();}
});
$('#trade').addEventListener('input',e=>{ if(e.target.dataset.fa==='q'){TR.fa.q=e.target.value.trim(); renderFATab(); const i=$('[data-fa="q"]'); i.focus(); i.setSelectionRange(i.value.length,i.value.length);} });
