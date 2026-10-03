// cards.js — 球員卡介面：大張球員卡（openCard）、球員資料庫瀏覽（openDBV）
// 依賴：engine.js（PITCH_DEFS、POS_NAME、pitchMove…）、render.js（avatar）、db.js（LEAGUE、queryPlayers…）
'use strict';
const FA_TEAM={id:'fa', name:'自由球員', short:'FA', color:'#6b7785'};
const teamById=id=>LEAGUE.teams.find(t=>t.id===id)||FA_TEAM;
// 能力等級（仿實況野球）
// 能力破百之後：110 以上 SS、130 以上 SSS
const GRADES=[[130,'SSS'],[110,'SS'],[90,'S'],[80,'A'],[70,'B'],[60,'C'],[50,'D'],[40,'E'],[30,'F'],[0,'G']];
const grade=v=>GRADES.find(([m])=>v>=m)[1];
// 稀有度（engine.js 的 RARITY）：回傳 [CSS class, 名稱]
const rarity=p=>{const r=rarOf(p); return ['r-'+r.id, r.name];};   // 卡片上固定的稀有度
const levelTxt=p=>p.level===1?'一軍':p.level===2?'二軍':'自由球員';
const posTxt=p=>p.kind==='P'?PROLE[p.prole]+'投手':POS_NAME[p.pos];
const posAbbr=p=>p.kind==='P'?p.prole:p.pos;
const handTxt=p=>`${p.throws==='R'?'右':'左'}投${p.bats==='R'?'右':'左'}打`;
const mphOf=p=>topMph(p.velo);   // 全力投球的最快球速

// cap：這張卡這項能力的上限（依稀有度），在能力條上畫一條刻度
function statRow(label, v, shown, cap){
  const g=grade(v);
  return `<div class="pc-r"><span class="pc-l">${label}</span><span class="gr g-${g}">${g}</span><span class="pc-v">${shown??v}</span><span class="pc-b"><i class="g-${g}" style="width:${abilPct(v)}%"></i>${cap?`<b class="pc-cap" style="left:${abilPct(cap)}%" title="上限 ${cap}"></b>`:''}</span></div>`;
}
// 球路變化圖：捕手視角，點的位置 = 該球種旋轉造成的位移（engine.js 的 pitchMove，不含重力，和 Statcast 的位移圖一樣）
function moveChart(p){
  const arm=p.throws==='R'?-1:1, k=26, c=78;
  const pts=p.pitches.map(x=>{const m=pitchMove(p,x);
    const X=clamp(c+m.hb*arm*k,10,146), Y=clamp(c-m.ivb*k,10,146);
    return {X, Y, ly:Y+4, left:X<c, g:grade(x.r), n:x.n};});
  // 位移相近的球種（例如伸卡、二縫線、變速球）標籤往上下錯開，不疊在一起
  [true,false].forEach(side=>{const s=pts.filter(q=>q.left===side).sort((a,b)=>a.ly-b.ly);
    for(let i=1;i<s.length;i++) if(s[i].ly-s[i-1].ly<10) s[i].ly=s[i-1].ly+10;});
  const dots=pts.map(({X,Y,ly,left,g,n})=>`<line x1="${c}" y1="${c}" x2="${X}" y2="${Y}" class="mv-l"/><circle cx="${X}" cy="${Y}" r="5" class="mv-d g-${g}"/>
      <text x="${X+(left?-7:7)}" y="${ly}" text-anchor="${left?'end':'start'}" class="mv-t">${SHORT[n]}</text>`).join('');
  return `<svg viewBox="0 0 156 156" class="mv"><rect x="1" y="1" width="154" height="154" rx="6" class="mv-bg"/>
    <line x1="${c}" y1="8" x2="${c}" y2="148" class="mv-a"/><line x1="8" y1="${c}" x2="148" y2="${c}" class="mv-a"/>
    <text x="150" y="${c-4}" text-anchor="end" class="mv-ax">一壘側</text><text x="${c+4}" y="16" class="mv-ax">上竄</text><text x="${c+4}" y="146" class="mv-ax">下墜</text>
    ${dots}</svg>`;
}
function hotZone(p){
  return `<div class="hz">${p.hz.map(v=>`<i class="hz${v}"></i>`).join('')}</div><div class="hz-cap">冷熱區（捕手視角）</div>`;
}
function cardHTML(p){
  const t=teamById(p.team), [rc,rn]=rarity(p);
  const body=p.kind==='H'
    ? `<div class="pc-g">${[['力量','pow'],['技巧','con'],['選球','eye'],['速度','spd'],['接球','fld'],['傳球','thr'],['臂力','arm']].map(([l,k])=>statRow(l,p[k],null,abilCap(p,k))).join('')}</div>
       <div class="pc-side">${hotZone(p)}<div class="pc-alt">可兼守：${p.alt.length?p.alt.map(x=>POS_NAME[x]).join('、'):'無'}</div></div>`
    : `<div class="pc-g">${statRow(`球速<small class="pc-mph">${mphOf(p)}mph</small>`,p.velo,null,abilCap(p,'velo'))}${statRow('控球',p.ctrl,null,abilCap(p,'ctrl'))}${statRow('體力',p.stam,null,abilCap(p,'stam'))}
       ${p.pitches.map(x=>statRow(x.n,x.r,null,abilCap(p,'pitch'))).join('')}</div><div class="pc-side">${moveChart(p)}<div class="hz-cap">球路變化（捕手視角）</div></div>`;
  return `<div class="pc ${rc}" style="--tc:${t.color}">
    <div class="pc-top"><div class="pc-ovr"><b>${p.ovr}</b><span>總評</span></div>
      <div class="pc-ti"><div class="pc-pos">${posTxt(p)}</div><div class="pc-tm">${t.name}・${levelTxt(p)}</div></div>
      <div class="pc-rar">${rn}</div></div>
    <div class="pc-art"><img src="${avatar(p,t,192)}" alt=""><span class="pc-num">${p.num}</span><span class="pc-tier">${TIER_NAME[p.tier]||''}</span></div>
    <div class="pc-name">${p.name}${p.enh?`<em class="enh">+${p.enh}</em>`:''}<small>${handTxt(p)}</small></div>
    <div class="pc-body">${body}</div>
    <div class="pc-bio">
      <span><i>年齡</i>${p.age}</span><span><i>身高</i>${p.height}</span><span><i>體重</i>${p.weight}</span><span><i>出身</i>${p.hometown}</span>
      <span><i>總評上限</i>${rarCap(p)}</span><span><i>能力上限</i>${abilCap(p,'pow')}${p.kind==='P'?`・球速 ${abilCap(p,'velo')}（${topMph(abilCap(p,'velo'))} mph）`:''}</span><span><i>潛力</i><b class="pc-pot"><em class="gr g-${grade(p.pot)}">${grade(p.pot)}</em>${p.pot}</b></span><span><i>年薪</i>${p.salary.toLocaleString()}萬</span><span><i>合約</i>${p.years?p.years+' 年':'—'}</span>
    </div>
    <div class="pc-id">${p.id}</div>
  </div>`;
}
function miniCard(p){
  const t=teamById(p.team), [rc]=rarity(p);
  return `<button class="mc ${rc}" data-id="${p.id}" style="--tc:${t.color}">
    <span class="mc-ovr">${p.ovr}</span><span class="mc-pos">${posAbbr(p)}</span>
    <img src="${avatar(p,t)}" alt="" loading="lazy"><b>${p.name}${p.enh?` <em class="enh">+${p.enh}</em>`:''}</b>
    <small><span class="mc-rar">${rarity(p)[1]}</span>${t.short}・${levelTxt(p)}・${p.age}歲</small><em class="gr g-${grade(p.pot)}" title="潛力">${grade(p.pot)}</em></button>`;
}

/* ---------- 大張球員卡 ---------- */
function openCard(id){
  const p=LEAGUE.players[id]; if(!p)return;
  $('#cardBody').innerHTML=cardHTML(p)+`<button class="go" id="cardClose">關閉</button>`;
  $('#cardm').hidden=false;
}
$('#cardm').onclick=e=>{if(e.target.id==='cardm'||e.target.closest('#cardClose'))$('#cardm').hidden=true;};

/* ---------- 球員資料庫瀏覽 ---------- */
const DBV={f:{team:'all', level:'all', type:'all', rar:'all', q:'', sort:'ovr'}, page:0, per:40};
function openDBV(f){
  if(f) Object.assign(DBV.f,{team:'all',level:'all',type:'all',rar:'all',q:''},f);
  DBV.page=0; $('#dbv').hidden=false; renderDBVControls(); renderDBV();
}
function renderDBVControls(){
  const f=DBV.f, opt=(v,l,cur)=>`<option value="${v}"${v===cur?' selected':''}>${l}</option>`;
  const types=[['all','全部'],['H','全部野手'],['P','全部投手'],...['C','1B','2B','SS','3B','LF','CF','RF','DH'].map(x=>[x,POS_NAME[x]]),['SP','先發投手'],['RP','中繼投手'],['CL','終結投手']];
  $('#dbvCtl').innerHTML=`
    <label>球隊<select data-k="team">${opt('all','全部',f.team)}${LEAGUE.teams.map(t=>opt(t.id,t.name,f.team)).join('')}${opt('fa','自由球員',f.team)}</select></label>
    <label>層級<select data-k="level">${opt('all','全部',f.level)}${opt('1','一軍',f.level)}${opt('2','二軍',f.level)}</select></label>
    <label>位置<select data-k="type">${types.map(([v,l])=>opt(v,l,f.type)).join('')}</select></label>
    <label>稀有度<select data-k="rar">${opt('all','全部',f.rar)}${RARITY.map(r=>opt(r.id,r.name,f.rar)).join('')}</select></label>
    <label>排序<select data-k="sort">${opt('ovr','總評高→低',f.sort)}${opt('pot','潛力高→低',f.sort)}${opt('young','年齡小→大',f.sort)}${opt('salary','年薪高→低',f.sort)}${opt('num','背號',f.sort)}</select></label>
    <label class="q">姓名<input data-k="q" value="${f.q}" placeholder="搜尋"></label>`;
}
function renderDBV(){
  const {total,ids}=queryPlayers(DBV.f, DBV.per, DBV.page*DBV.per), pages=Math.max(1,Math.ceil(total/DBV.per));
  $('#dbvGrid').innerHTML=ids.length?ids.map(id=>miniCard(LEAGUE.players[id])).join(''):'<p class="lead">沒有符合條件的球員。</p>';
  $('#dbvPager').innerHTML=`<button class="ghost" data-pg="-1" ${DBV.page?'':'disabled'}>上一頁</button><span>第 ${DBV.page+1} / ${pages} 頁・共 ${total} 人</span><button class="ghost" data-pg="1" ${DBV.page<pages-1?'':'disabled'}>下一頁</button>`;
  const src={saved:'SQLite（已存在這個瀏覽器）', bundled:'SQLite（data/players.sqlite 初始資料）', generated:'內建產生器（sql.js 沒有載入，無法存檔）'}[DB_SOURCE];
  $('#dbvSrc').textContent=`資料來源：${src}・聯盟共 ${Object.keys(LEAGUE.players).length} 人`;
  $('#dbvExport').disabled=!DB;
}
$('#dbvCtl').addEventListener('input',e=>{const k=e.target.dataset.k; if(!k)return; DBV.f[k]=e.target.value.trim(); DBV.page=0; renderDBV();});
$('#dbvPager').onclick=e=>{const b=e.target.closest('[data-pg]'); if(!b)return; DBV.page+=+b.dataset.pg; renderDBV(); $('#dbvGrid').scrollTop=0;};
$('#dbvGrid').onclick=e=>{const b=e.target.closest('.mc'); if(b)openCard(b.dataset.id);};
$('#dbv').onclick=e=>{if(e.target.id==='dbv'||e.target.closest('#dbvClose'))$('#dbv').hidden=true;};
$('#dbvExport').onclick=exportLeague;
$('#dbvReset').onclick=()=>{if(confirm('把球員資料庫還原成初始狀態？這個瀏覽器裡的存檔（輪值進度、之後的交易）都會清除。'))resetLeague();};
