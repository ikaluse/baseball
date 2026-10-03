// home.js — 登入頁與主選單：玩家檔案、金幣、商城（球員卡包）、設定、連線對戰（準備中）、熱血風格動態背景
// 依賴：engine.js、db.js（LEAGUE、saveLeague…）、cards.js（cardHTML、openDBV…）、ui.js（pick、renderSetup…）、trade.js（openTrade）
'use strict';

/* ---------- 玩家檔案（存在這個瀏覽器的 localStorage） ---------- */
const PROFILE_KEY='baseball-profiles';
const DEFAULT_SETTINGS={cam:'auto', intro:true, theme:'hot'};
const TRAIN_FREE=5, TRAIN_COST=100;  // 每天免費訓練次數、之後每次的金幣
const REWARD={win:300, loss:120, tie:200}, DAILY_BONUS=200, START_COINS=1000, WIN_PER_LV=10;  // 贏球再加 對手等級×10
let PROFILES={current:null, list:{}};
try{const raw=localStorage.getItem(PROFILE_KEY); if(raw)PROFILES=JSON.parse(raw);}catch(e){}
// 舊玩家的外觀預設是「跟隨系統」，改成新的熱血配色（只轉換一次）
Object.values(PROFILES.list).forEach(p=>{if(p.settings&&!p.settings.v2){if(p.settings.theme==='auto')p.settings.theme='hot'; p.settings.v2=true;}});
// 電腦難度改成積分解鎖：舊玩家依過去的勝場換算積分（每勝 10 分），難度從普通開始
Object.values(PROFILES.list).forEach(p=>{if(p.pts===undefined){p.pts=(p.w||0)*10; p.tier=0;}});
const saveProfiles=()=>{try{localStorage.setItem(PROFILE_KEY,JSON.stringify(PROFILES));}catch(e){} if(typeof cloudDirty==='function') cloudDirty();};   // 雲端玩家：排程上傳（cloud.js）
const me=()=>PROFILES.list[PROFILES.current];
// 還沒選隊（新玩家，或舊存檔的球隊在 20 隊改版後不存在了）要先到選隊畫面
const hasTeam=()=>{const p=me(); return !!p&&LEAGUE.teams.some(t=>t.id===p.team);};
const SETTINGS=()=>({...DEFAULT_SETTINGS,...(me()&&me().settings)});
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const today=()=>new Date().toLocaleDateString('sv');   // YYYY-MM-DD（本地時間）

function login(name){
  name=name.trim();
  if(!PROFILES.list[name]) PROFILES.list[name]={name, team:null, coins:START_COINS, pts:0, tier:0, w:0, l:0, t:0, settings:{...DEFAULT_SETTINGS, v2:true}, purchases:[], created:new Date().toISOString()};
  PROFILES.current=name;
  const p=me(); let bonus=0;
  if(p.lastLogin!==today()){ if(p.lastLogin){p.coins+=DAILY_BONUS; bonus=DAILY_BONUS;} p.lastLogin=today(); }
  saveProfiles(); applySettings();
  return bonus;
}
function applySettings(){
  const s=SETTINGS();
  UI.camMode=s.cam; if($('#camBtn'))$('#camBtn').textContent=`視角：${CAM_MODES[UI.camMode]}`;
  if(s.theme==='auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme=s.theme;
  if(hasTeam()){pick.me=me().team; if(pick.op===pick.me)pick.op=LEAGUE.teams.find(t=>t.id!==pick.me).id; renderSetup();}
}
function setSetting(k,v){const p=me(); if(!p)return; p.settings={...SETTINGS(),[k]:v}; saveProfiles(); applySettings();}
// ui.js 的視角按鈕切換時同步到玩家設定
function onCamChange(mode){const p=me(); if(p){p.settings={...SETTINGS(),cam:mode}; saveProfiles();}}
// 電腦難度：累積積分到門檻就開啟（積分只會增加，不會花掉）
const tierOpen=i=>{const p=me(); return !!p&&(p.pts||0)>=AI_TIERS[i].unlock;};
const curTier=()=>{const p=me(), i=p?p.tier||0:0; return tierOpen(i)?i:0;};
function setTier(i){const p=me(); if(!p||!tierOpen(i))return; p.tier=i; saveProfiles();}
// 比賽結束給金幣和積分（ui.js 的 showOver 會呼叫）；tier＝這場的難度，myLv＝你這場的球隊等級
function awardGame(result,aiLv=1,tier=0,myLv=aiLv){
  const p=me(); if(!p)return '';
  const bonus=result==='win'?aiLv*WIN_PER_LV:0, c=REWARD[result]+bonus; p.coins+=c; p[{win:'w',loss:'l',tie:'t'}[result]]++;
  const before=AI_TIERS.filter((_,i)=>tierOpen(i)).length, pts=tierPoints(tier,result,myLv,aiLv);
  p.pts=(p.pts||0)+pts;
  if(result==='win'){p.tierW=p.tierW||{}; p.tierW[tier]=(p.tierW[tier]||0)+1;}
  const opened=AI_TIERS.filter((_,i)=>tierOpen(i)).slice(before);
  saveProfiles();
  const k=tierMult(myLv,aiLv), T=AI_TIERS[tier];
  return `獲得 ${c} 金幣${bonus?`（含對手 Lv ${aiLv} 加成 ${bonus}）`:''}（目前 ${p.coins.toLocaleString()}）<br>`+
    `積分 +${pts}`+(pts?`（${T.name}難度 ${T.win}${result==='tie'?' ÷ 2':''} × 等級差 ${k.toFixed(1)}）`:'（輸球沒有積分）')+`，累積 ${p.pts.toLocaleString()}`+
    opened.map(o=>`<br><b class="tier-new" style="--c:${o.color}">解鎖新難度：${o.name}（對手 Lv ${o.lv}）</b>`).join('');
}

/* ---------- 畫面切換 ---------- */
function showHome(){
  ['setup','over','manage','shop','settings','online','admin','league','teamPick'].forEach(id=>$('#'+id).hidden=true);
  $('#home').hidden=false;
  if(typeof playMusic==='function') playMusic('title');
  if(me()&&!hasTeam()){$('#login').hidden=true; $('#menu').hidden=true; openTeamPick();}
  else if(me()){$('#login').hidden=true; $('#menu').hidden=false; renderMenu();}
  else {$('#login').hidden=false; $('#menu').hidden=true; renderLogin();}
  startBg();
}
function hideHome(){ $('#home').hidden=true; stopBg(); }

function renderLogin(){
  const names=Object.keys(PROFILES.list).filter(n=>!n.startsWith('cloud:'));   // 雲端玩家要用雲端帳號登入
  $('#profList').innerHTML=names.length?`<span>只在這台電腦的玩家</span>${names.map(n=>{const p=PROFILES.list[n], t=teamOf(p.team);
    return `<button class="prof" data-name="${esc(n)}"><i style="background:${t?t.color:'#888'}"></i>${esc(n)}<small>${(p.coins||0).toLocaleString()} 金幣</small></button>`;}).join('')}`:'';
  $('#loginErr').textContent='';
}
// 每位玩家有自己的聯盟存檔（db.js）：登入的人和目前載入的聯盟不同時，重新整理頁面改載入他的存檔。
// 例外：還沒載入任何人的存檔（DB_OWNER 是 null，用的是全新的內建資料）而且是新玩家，就直接把這份給他
function enterAs(name, isNew, msg){
  if(DB_OWNER!==name){
    if(DB_OWNER===null&&isNew){ DB_OWNER=name; saveLeague(); }
    else { try{sessionStorage.setItem('baseball-toast',msg||'');}catch(e){} location.reload(); return; }
  }
  showHome(); if(msg) toast(msg);
}
$('#profList').onclick=e=>{const b=e.target.closest('.prof'); if(!b)return; const n=b.dataset.name; const bonus=login(n); enterAs(n,false,bonus?`每日登入獎勵 +${bonus} 金幣`:'');};
function doLogin(){
  const n=$('#loginName').value.trim();
  if(!n){$('#loginErr').textContent='請輸入暱稱'; return;}
  if(n.length>12){$('#loginErr').textContent='暱稱最多 12 個字'; return;}
  const isNew=!PROFILES.list[n], bonus=login(n);
  enterAs(n,isNew,isNew?`歡迎加入，${n}！送你 ${START_COINS} 金幣，先選一支球隊吧`:bonus?`每日登入獎勵 +${bonus} 金幣`:`歡迎回來，${n}`);
}

/* ---------- 選隊：第一次進場選一個縣市的球隊，再替球隊取名 ---------- */
const TP={sel:null, nick:'', change:false, err:''};
function openTeamPick(change=false){
  TP.change=change; TP.err='';
  const cur=me()&&me().team; TP.sel=hasTeam()?cur:null; TP.nick=TP.sel?teamOf(TP.sel).short:'';
  renderTeamPick(); $('#teamPick').hidden=false;
}
function renderTeamPick(){
  const t=TP.sel&&teamOf(TP.sel);
  const btn=x=>`<button class="tp-t${x.id===TP.sel?' sel':''}" data-tp="${x.id}" style="--c:${x.color}">
      <b><i class="dot" style="background:${x.color}"></i>${x.city}</b><span>${esc(x.name)}<em class="lv">Lv${teamLevel(LEAGUE,x)}</em></span><small>${x.note}</small></button>`;
  $('#teamPickBody').innerHTML=`${TP.change?'<button class="ghost dlg-x" data-tpx="1">取消</button>':''}
    <h1>${TP.change?'更換球隊':'選擇你的球隊'}<small>全台 20 個縣市各一隊・卡皮聯盟與巴拉聯盟</small></h1>
    <p class="lead">${TP.change?'換隊後你的金幣、積分不變，但交易、訓練、抽卡都會改成用新的球隊。':'先挑一個縣市當主場，再替球隊取名。之後要改隊名可以到「設定」。'}</p>
    <div class="tp-lgs">${LEAGUES.map(l=>`<section class="tp-lg" style="--lc:${l.color}"><h2>${l.name}</h2>
      ${l.divs.map(d=>`<h3>${d.name}</h3><div class="tp-grid">${LEAGUE.teams.filter(x=>x.lg===l.id&&x.div===d.id).map(btn).join('')}</div>`).join('')}</section>`).join('')}</div>
    <div class="tp-form">${t?`<span class="tp-city"><i class="dot" style="background:${t.color}"></i>${t.city}・${lgName(t.lg)}${divName(t)}</span>
      <label>隊名<span class="tp-name"><b>${t.pre||''}</b><input id="tpNick" maxlength="4" value="${esc(TP.nick)}" placeholder="1～4 個字"></span></label>
      <span class="tp-prev">「${esc((t.pre||'')+TP.nick)}」</span>
      <button class="hot-btn" id="tpGo">${TP.change?'確定換隊':'加入聯盟'}</button>`:'<span class="tp-city">點上面的縣市選擇球隊</span>'}
      ${TP.err?`<p class="login-err">${esc(TP.err)}</p>`:''}</div>`;
}
$('#teamPickBody').addEventListener('click',async e=>{
  if(e.target.closest('[data-tpx]')){$('#teamPick').hidden=true; return;}
  const b=e.target.closest('[data-tp]'); if(b){TP.sel=b.dataset.tp; TP.nick=teamOf(TP.sel).short; TP.err=''; return renderTeamPick();}
  if(e.target.id!=='tpGo') return;
  const t=teamOf(TP.sel), nick=$('#tpNick').value.trim();
  if(!nick||nick.length>4){TP.nick=nick; TP.err='隊名要 1～4 個字'; return renderTeamPick();}
  if(LEAGUE.teams.some(x=>x!==t&&(x.short===nick||x.name===(t.pre||'')+nick))){TP.nick=nick; TP.err='和其他球隊撞名了，換一個吧'; return renderTeamPick();}
  if(TP.change&&t.id!==me().team&&!confirm(`改成帶領${t.city}的球隊？原本球隊的球員（包含抽到的卡）會留在原隊。`)) return;
  t.short=nick; t.name=(t.pre||'')+nick; me().team=t.id; pick.me=t.id; if(pick.op===t.id) pick.op=LEAGUE.teams.find(x=>x.id!==t.id).id;
  saveProfiles(); await saveLeague(); renderSetup();
  $('#teamPick').hidden=true; showHome();
  toast(`${TP.change?'已更換球隊':'歡迎加入'}：${lgName(t.lg)}${divName(t)}・${t.name}`);
});
$('#teamPickBody').addEventListener('input',e=>{ if(e.target.id==='tpNick'){TP.nick=e.target.value.trim(); const pv=$('.tp-prev'), t=teamOf(TP.sel); if(pv&&t) pv.textContent=`「${(t.pre||'')+TP.nick}」`;} });
$('#teamPickBody').addEventListener('keydown',e=>{ if(e.target.id==='tpNick'&&e.key==='Enter') $('#tpGo').click(); });
$('#loginGo').onclick=doLogin;
$('#loginName').addEventListener('keydown',e=>{if(e.key==='Enter')doLogin();});

function renderMenu(){
  if(!hasTeam()) return;
  const p=me(), t=teamOf(p.team), s=LEAGUE.season, S=seasonStandings(LEAGUE), m=S[t.id];
  const rank=LEAGUE.teams.filter(x=>x.lg===t.lg&&x.div===t.div).map(x=>x.id).sort(standCmp(S)).indexOf(t.id)+1;
  $('#pbar').innerHTML=`<div class="pb-name"><i style="background:${t.color}"></i><b>${esc(p.name)}</b><span>${t.name}</span><em class="lv big">Lv ${teamLevel(LEAGUE,t)}</em><span class="pb-pow">戰力 ${teamPower(LEAGUE,t).toFixed(1)}</span></div>
    <div class="pb-coin"><em>●</em>${p.coins.toLocaleString()}</div><div class="pb-pts">積分 <b>${(p.pts||0).toLocaleString()}</b>${(()=>{const n=AI_TIERS.find((_,i)=>!tierOpen(i)); return n?`<small>・${n.name}難度還差 ${n.unlock-(p.pts||0)}</small>`:'<small>・全部難度已開啟</small>';})()}</div><div class="pb-rec" title="你親自打的比賽：${p.w} 勝 ${p.l} 敗 ${p.t} 和">第 ${s.year} 季 ${m.w} 勝 ${m.l} 敗${m.t?` ${m.t} 和`:''}<small>・${lgName(t.lg)}${divName(t)}${m.g?`第 ${rank} 名`:"・開季前"}</small></div>
    <button class="pb-out" id="logout">登出</button>`;
  $('#logout').onclick=()=>{PROFILES.current=null; saveProfiles(); showHome();};
}
$('#menu').addEventListener('click',e=>{
  const b=e.target.closest('.mbtn'); if(!b)return;
  const go=b.dataset.go;
  if(go==='single'){pick.me=me().team; if(pick.op===pick.me)pick.op=LEAGUE.teams.find(t=>t.id!==pick.me).id; renderSetup(); hideHome(); $('#setup').hidden=false;}
  if(go==='league') openLeague();
  if(go==='online') openOnline();
  if(go==='manage') openManage();
  if(go==='trade'){pick.me=me().team; openTrade();}
  if(go==='shop') openShop();
  if(go==='settings') openSettings();
});
$('#toHome').onclick=showHome;
let toastTimer=null;
function toast(msg){let el=$('#toast'); if(!el){el=document.createElement('div'); el.id='toast'; el.className='toast'; document.body.appendChild(el);}
  el.textContent=msg; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),2600);}
const closeBtn=id=>`<button class="ghost dlg-x" data-close="${id}">關閉</button>`;
document.addEventListener('click',e=>{const b=e.target.closest('[data-close]'); if(b){$('#'+b.dataset.close).hidden=true; if(!$('#home').hidden)renderMenu();}});
['manage','shop','settings','online','league'].forEach(id=>$('#'+id).addEventListener('click',e=>{if(e.target.id===id){$('#'+id).hidden=true; renderMenu();}}));

/* ---------- 聯賽：季賽 → 季後賽 → 總冠軍（engine.js 的 seasonPending、applyResult…） ----------
   自己打的比賽：季賽贏球拿金幣＋積分，電腦對手比你低 2 級；季後賽獎勵更多、對手和你同級。
   模擬的比賽（包含你的球隊）只拿少量金幣、沒有積分。晉級季後賽、聯盟冠軍、總冠軍另有獎金。 */
const SEASON_PTS={win:15, tie:7, loss:0};
const POST_COINS={win:500, tie:0, loss:150}, POST_PTS={win:30, tie:0, loss:0};
const SIM_COINS={win:100, tie:70, loss:40};
const LG={tab:'stand', note:null, sp:null};
const myTeamId=()=>me().team;
function openLeague(){ LG.note=null; renderLeague(); $('#league').hidden=false; }
// 晉級、聯盟冠軍、總冠軍的獎金（每個玩家每一季各領一次）
function seasonAwards(){
  const s=LEAGUE.season, pf=me(), id=pf.team, aw=pf.seasonAw||(pf.seasonAw={}), key=s.id||s.year, out=[];
  const give=(k,c,p,msg)=>{ if(aw[key+k]) return; aw[key+k]=1; pf.coins+=c; pf.pts=(pf.pts||0)+p; out.push(`${msg}：+${c.toLocaleString()} 金幣${p?`、積分 +${p}`:''}`); };
  const t=teamOf(id);
  if(s.post&&Object.values(s.post.field).some(f=>f.includes(id))) give('po',500,50,'晉級季後賽');
  if(s.post&&s.post.series.some(x=>x.round===1&&x.winner===id)) give('lg',1000,80,`${lgName(t.lg)}冠軍`);
  if(s.champ===id) give('ch',3000,200,'🏆 總冠軍');
  return out;
}
// 比賽結束（ui.js 的 showOver 呼叫）：寫入賽程、季賽成績進排行榜、發獎勵；回傳顯示的文字
function finishSeasonGame(g,result){
  const it=g.season, ra=runs(0), rh=runs(1), pf=me(), s=LEAGUE.season;
  const ok=applyResult(LEAGUE,it,ra,rh);
  if(!ok){ saveLeague(); return it.kind==='post'&&ra===rh?'季後賽不能和局，這場不算，回到聯賽再打一次':'這場比賽已經有結果了，不重複計算'; }
  if(it.kind==='reg') recordGame(LEAGUE,g);
  const c=it.kind==='reg'?REWARD[result]:POST_COINS[result], p=it.kind==='reg'?SEASON_PTS[result]:POST_PTS[result];
  pf.coins+=c; pf.pts=(pf.pts||0)+p; pf[{win:'w',loss:'l',tie:'t'}[result]]++;
  let txt=`獲得 ${c} 金幣${p?`、積分 +${p}`:''}（目前 ${pf.coins.toLocaleString()} 金幣）`;
  if(it.kind==='post'){const x=s.post.series[it.si], T=id=>teamOf(id).short;
    txt+=`<br>${POST_ROUNDS[x.round].name}：${T(x.hi)} ${x.w[0]} - ${x.w[1]} ${T(x.lo)}${x.winner?`，${T(x.winner)}晉級${x.round===2?'，奪得總冠軍！':''}`:''}`;}
  if(s.phase==='post'&&it.kind==='reg') txt+='<br>季賽打完了，季後賽開始！';
  txt+=seasonAwards().map(m=>`<br><b class="tier-new" style="--c:#ffd84a">${m}</b>`).join('');
  saveProfiles(); saveLeague();
  return txt;
}
const gameLabel=(it,s=LEAGUE.season)=>it.kind==='reg'?`第 ${s.year} 季・季賽第 ${it.d+1} 天`:`第 ${s.year} 季・${POST_ROUNDS[it.round].name}第 ${it.gi+1} 戰`;
// 開打：先把排在你前面（和同一天其他場）的比賽模擬完，再進入你的比賽
async function playSeasonGame(){
  const id=myTeamId(); let mine=null;
  for(let guard=0;guard<200&&!mine;guard++){
    const pend=seasonPending(LEAGUE); if(!pend.length) break;
    mine=pend.find(x=>x.a===id||x.h===id)||null;
    pend.filter(x=>x!==mine).forEach(x=>simPending(LEAGUE,x));
  }
  if(!mine){ await saveLeague(); LG.note={ok:false, msg:'你的球隊目前沒有比賽'}; return renderLeague(); }
  const my=teamOf(id), oppId=mine.a===id?mine.h:mine.a, opp=teamOf(oppId);
  const mySP=my.rotation.includes(LG.sp)?LG.sp:nextStarter(my), oppSP=nextStarter(opp);
  opp.rotIdx=(opp.rotIdx+1)%Math.max(1,opp.rotation.length); LG.sp=null;
  mine.label=gameLabel(mine);
  hideHome(); $('#league').hidden=true;
  startMatch({awayId:mine.a, homeId:mine.h, side:mine.h===id?1:0, sp:{[id]:mySP, [oppId]:oppSP}, season:mine});
}
// 模擬：day＝一天、week＝七天、mine＝到你的下一場打完、phase＝到季賽（或季後賽）結束
async function simSeason(mode){
  const id=myTeamId(), pf=me(), ph=LEAGUE.season.phase, my={win:0,loss:0,tie:0}; let coins=0, days=0, n=0;
  for(let guard=0;guard<400;guard++){
    const pend=seasonPending(LEAGUE); if(!pend.length) break;
    const hasMine=pend.some(x=>x.a===id||x.h===id);
    pend.forEach(x=>{const r=simPending(LEAGUE,x); n++; if(!r||(x.a!==id&&x.h!==id)) return;
      const [a,h]=r.r, mine=x.a===id?a:h, op=x.a===id?h:a, res=mine>op?'win':mine<op?'loss':'tie';
      my[res]++; coins+=SIM_COINS[res];});
    days++;
    if(mode==='day'||(mode==='week'&&days>=7)||(mode==='mine'&&hasMine)||(mode==='phase'&&LEAGUE.season.phase!==ph)) break;
  }
  pf.coins+=coins; const aw=seasonAwards(); saveProfiles(); await saveLeague();
  const played=my.win+my.loss+my.tie;
  LG.note={ok:true, msg:`模擬了 ${days} 天、${n} 場。`+(played?`${teamOf(id).short} ${my.win} 勝 ${my.loss} 敗${my.tie?` ${my.tie} 和`:''}，獲得 ${coins} 金幣（模擬的比賽沒有積分）。`:'')+aw.join('；')};
  renderLeague(); renderMenu();
}
async function nextSeason(){
  const s=LEAGUE.season;
  if(!confirm(`開始第 ${s.year+1} 季？戰績、本季排行榜會歸零（歷屆冠軍會保留）。`)) return;
  LEAGUE.season=newSeason(LEAGUE,s.year+1,s.history); LEAGUE.season.id=String(Date.now());
  await saveLeague(); LG.note={ok:true, msg:`第 ${s.year+1} 季開打！`}; LG.tab='stand'; renderLeague(); renderMenu();
}
// 戰績表的小工具
const pct3=v=>v.toFixed(3).replace(/^0/,'');
const streak=r=>{if(!r.length)return '-'; const k=r[r.length-1]; let n=0; for(let i=r.length-1;i>=0&&r[i]===k;i--)n++; return `連${n}${{W:'勝',L:'敗',T:'和'}[k]}`;};
const last10=r=>{const x=r.slice(-10); return `${x.filter(v=>v==='W').length}-${x.filter(v=>v==='L').length}`;};
const gbTxt=v=>v<=0?'-':String(v);
const tName=(id,cls='')=>{const t=teamOf(id); return `<span class="lg-tn ${cls}${id===myTeamId()?' me':''}"><i class="dot" style="background:${t.color}"></i>${esc(t.name)}</span>`;};
function divTable(S, lg, div){
  const ids=LEAGUE.teams.filter(t=>t.lg===lg&&t.div===div.id).map(t=>t.id).sort(standCmp(S)), lead=S[ids[0]];
  return `<table class="box lg-t"><tr><th>${div.name}</th><th>勝</th><th>敗</th><th>和</th><th>勝率</th><th>勝差</th><th>得失分</th><th>近10場</th><th>連續</th></tr>
    ${ids.map(id=>{const x=S[id]; return `<tr class="${id===myTeamId()?'sel':''}"><td>${tName(id)}</td><td>${x.w}</td><td>${x.l}</td><td>${x.t}</td><td><b>${x.g?pct3(x.pct):'-'}</b></td>
      <td>${gbTxt(gamesBack(lead,x))}</td><td class="${x.diff>0?'up':x.diff<0?'dn':''}">${x.diff>0?'+':''}${x.diff}</td><td>${last10(x.res)}</td><td>${streak(x.res)}</td></tr>`;}).join('')}</table>`;
}
function wildTable(S, lg){
  const seeds=playoffSeeds(LEAGUE,lg,S), winners=seeds.slice(0,2);
  const rest=LEAGUE.teams.filter(t=>t.lg===lg&&!winners.includes(t.id)).map(t=>t.id).sort(standCmp(S));
  const row=(id,tag,gb)=>{const x=S[id]; return `<tr class="${id===myTeamId()?'sel':''}${tag?' in':''}"><td>${tag||''}</td><td>${tName(id)}</td><td>${x.w}</td><td>${x.l}</td><td><b>${x.g?pct3(x.pct):'-'}</b></td><td>${gb}</td></tr>`;};
  return `<table class="box lg-t"><tr><th>種子</th><th>球隊</th><th>勝</th><th>敗</th><th>勝率</th><th>外卡勝差</th></tr>
    ${winners.map((id,i)=>row(id,`${i+1}・${divName(teamOf(id))}冠軍`,'-')).join('')}
    ${rest.map((id,i)=>row(id,i<2?`${i+3}・外卡`:'',i<2?(rest[2]&&gamesBack(S[id],S[rest[2]])>0?`+${gamesBack(S[id],S[rest[2]])}`:'-'):gbTxt(gamesBack(S[rest[1]],S[id])))).join('')}</table>`;
}
function scoreLine(x){const [ra,rh]=x.r||[]; const w=x.r?(ra>rh?x.a:ra<rh?x.h:null):null;
  return `<div class="lg-g">${tName(x.a,w===x.a?'win':'')}<b>${x.r?ra:''}</b><em>${x.r?'':'@'}</em><b>${x.r?rh:''}</b>${tName(x.h,w===x.h?'win':'')}</div>`;}
function bracket(){
  const s=LEAGUE.season, T=id=>teamOf(id);
  if(!s.post){const S=seasonStandings(LEAGUE);
    return `<p class="lead">季賽打完才開始季後賽。目前如果季賽結束，晉級的球隊是：</p><div class="lg-cols">${LEAGUES.map(l=>`<section><h3>${l.name}</h3><ol class="lg-seeds">${playoffSeeds(LEAGUE,l.id,S).map(id=>`<li>${tName(id)}</li>`).join('')}</ol></section>`).join('')}</div>`;}
  const card=x=>`<div class="lg-ser${x.winner?' done':''}"><div class="${x.winner===x.hi?'win':''}"><small>${x.hs}</small>${tName(x.hi)}<b>${x.w[0]}</b></div>
    <div class="${x.winner===x.lo?'win':''}"><small>${x.ls}</small>${tName(x.lo)}<b>${x.w[1]}</b></div>
    <p>${x.games.map(g=>`${T(g.a).short} ${g.r[0]}:${g.r[1]} ${T(g.h).short}`).join('・')||`${x.best} 戰 ${Math.ceil(x.best/2)} 勝`}</p></div>`;
  return `<div class="lg-bracket">${POST_ROUNDS.map((r,i)=>`<section><h3>${r.name}<small>${r.best} 戰 ${Math.ceil(r.best/2)} 勝</small></h3>
    ${s.post.series.filter(x=>x.round===i).map(x=>`${x.lg!=='final'?`<h4>${lgName(x.lg)}</h4>`:''}${card(x)}`).join('')||'<p class="tr-tip">還沒開打</p>'}</section>`).join('')}</div>
    ${s.champ?`<p class="lg-champ">🏆 第 ${s.year} 季總冠軍：${tName(s.champ)}</p>`:''}`;
}
function mySchedule(){
  const s=LEAGUE.season, id=myTeamId(), rows=[];
  s.days.forEach((day,d)=>day.forEach(x=>{ if(x.a!==id&&x.h!==id) return;
    const home=x.h===id, opp=home?x.a:x.h, r=x.r, me_=r?(home?r[1]:r[0]):0, op=r?(home?r[0]:r[1]):0;
    rows.push(`<tr class="${r?'':'todo'}"><td>第 ${d+1} 天</td><td>${home?'主':'客'}</td><td>${tName(opp)}</td><td>${r?`<b class="${me_>op?'up':me_<op?'dn':''}">${me_>op?'勝':me_<op?'敗':'和'}</b> ${me_}:${op}`:'—'}</td></tr>`);}));
  const post=s.post?s.post.series.filter(x=>x.hi===id||x.lo===id).flatMap(x=>x.games.map((g,i)=>{const home=g.h===id, m=home?g.r[1]:g.r[0], o=home?g.r[0]:g.r[1];
    return `<tr><td>${POST_ROUNDS[x.round].name}第 ${i+1} 戰</td><td>${home?'主':'客'}</td><td>${tName(home?g.a:g.h)}</td><td><b class="${m>o?'up':'dn'}">${m>o?'勝':'敗'}</b> ${m}:${o}</td></tr>`;})):[];
  return `<div class="tr-list"><table class="box lg-t lg-sch"><tr><th>日期</th><th>主客</th><th>對手</th><th>結果</th></tr>${rows.join('')}${post.join('')}</table></div>`;
}
function recentDays(){
  const s=LEAGUE.season, last=s.days.map((d,i)=>[d,i]).filter(([d])=>d.every(x=>x.r)).pop(), next=s.days.findIndex(d=>d.some(x=>!x.r));
  return `<div class="lg-cols">${last?`<section><h3>第 ${last[1]+1} 天比分</h3>${last[0].map(scoreLine).join('')}</section>`:''}
    ${next>=0?`<section><h3>第 ${next+1} 天賽程</h3>${s.days[next].map(scoreLine).join('')}</section>`:''}</div>`;
}
function champHistory(){
  const h=LEAGUE.season.history;
  return h.length?`<table class="box lg-t"><tr><th>球季</th><th>總冠軍</th><th>系列賽</th><th>亞軍</th></tr>${h.slice().reverse().map(x=>`<tr><td>第 ${x.year} 季</td><td>${teamOf(x.champ)?tName(x.champ):esc(x.name)}</td><td>${Math.max(...x.w)}-${Math.min(...x.w)}</td><td>${teamOf(x.runner)?tName(x.runner):''}</td></tr>`).join('')}</table>`
    :'<p class="lead">還沒有總冠軍。打完第一季就會記在這裡。</p>';
}
function renderLeague(){
  const s=LEAGUE.season, id=myTeamId(), t=teamOf(id), S=seasonStandings(LEAGUE), m=S[id], nx=teamNext(LEAGUE,id);
  const doneDays=s.days.filter(d=>d.every(x=>x.r)).length;
  const status=s.phase==='regular'?`季賽 第 ${Math.min(doneDays+1,s.days.length)}／${s.days.length} 天`:s.phase==='post'?`季後賽・${POST_ROUNDS[s.post.round].name}`:'球季結束';
  const rank=LEAGUE.teams.filter(x=>x.lg===t.lg&&x.div===t.div).map(x=>x.id).sort(standCmp(S)).indexOf(id)+1;
  let next='';
  if(nx&&!nx.wait){
    const oppId=nx.a===id?nx.h:nx.a, opp=teamOf(oppId), o=S[oppId], sp=t.rotation.includes(LG.sp)?LG.sp:nextStarter(t), osp=LEAGUE.players[nextStarter(opp)];
    next=`<div class="lg-next"><div class="lg-vs"><span class="lg-when">${gameLabel(nx)}・${nx.h===id?'主場':'客場'}</span>
        <b>${tName(id)}<em>VS</em>${tName(oppId)}</b><span>對手 ${o.w} 勝 ${o.l} 敗・Lv ${teamLevel(LEAGUE,opp)}・預定先發 ${esc(osp.name)}（總評 ${osp.ovr}）</span></div>
      <div class="lg-sp"><span>我的先發</span>${t.rotation.map(pid=>{const p=LEAGUE.players[pid]; return `<button class="${pid===sp?'sel':''}" data-lgsp="${pid}">${esc(p.name)}<small>${p.ovr}</small></button>`;}).join('')}</div>
      <div class="lg-btns"><button class="hot-btn" data-lg="play">開打</button><button class="ghost" data-lg="mine">模擬這場</button></div>
      <p class="tr-tip">${nx.kind==='reg'?`季賽：電腦對手會比你低 2 級。贏球 +${REWARD.win} 金幣、積分 +${SEASON_PTS.win}；輸球 +${REWARD.loss} 金幣。`
        :`季後賽：對手和你同級。贏球 +${POST_COINS.win} 金幣、積分 +${POST_PTS.win}；輸球 +${POST_COINS.loss} 金幣。和局不算，要重打。`}模擬的比賽只拿 ${SIM_COINS.win} 金幣、沒有積分。</p></div>`;
  } else if(nx&&nx.wait) next=`<div class="lg-next"><p class="lead">你的球隊晉級了！等其他系列賽打完，再進行${POST_ROUNDS[s.post.round+1]?POST_ROUNDS[s.post.round+1].name:'下一輪'}。</p></div>`;
  else if(s.phase==='post') next=`<div class="lg-next"><p class="lead">${s.post.series.some(x=>x.hi===id||x.lo===id)?'你的球隊被淘汰了。':'你的球隊沒有打進季後賽。'}可以直接模擬季後賽，看誰拿下總冠軍。</p></div>`;
  else if(s.phase==='done') next=`<div class="lg-next"><p class="lead">第 ${s.year} 季結束，總冠軍是 ${tName(s.champ)}。</p><div class="lg-btns"><button class="hot-btn" data-lg="new">開始第 ${s.year+1} 季</button></div></div>`;
  const sims=s.phase==='regular'?[['day','模擬一天'],['week','模擬一週'],['phase','模擬到季賽結束']]:s.phase==='post'?[['day','模擬一天'],['phase','模擬到季後賽結束']]:[];
  const tabs=[['stand','分區戰績'],['wild','外卡排名'],['sched','我的賽程'],['days','每日比分'],['post','季後賽'],['hist','歷屆冠軍']];
  const body={stand:()=>`<div class="lg-cols">${LEAGUES.map(l=>`<section><h3 style="color:${l.color}">${l.name}</h3>${l.divs.map(d=>divTable(S,l.id,d)).join('')}</section>`).join('')}</div>`,
    wild:()=>`<p class="tr-tip">每個聯盟 4 隊晉級：2 個分區冠軍＋分區冠軍以外勝率最高的 2 隊（外卡）。分區系列賽 1 種子對 4 種子、2 種子對 3 種子。</p><div class="lg-cols">${LEAGUES.map(l=>`<section><h3 style="color:${l.color}">${l.name}</h3>${wildTable(S,l.id)}</section>`).join('')}</div>`,
    sched:mySchedule, days:recentDays, post:bracket, hist:champHistory}[LG.tab]||(()=>'');
  $('#leagueBody').innerHTML=`${closeBtn('league')}<h1>聯賽<small>第 ${s.year} 季・${status}</small></h1>
    <div class="lg-me"><span>${tName(id)}</span><b>${m.w} 勝 ${m.l} 敗${m.t?` ${m.t} 和`:''}</b><span>${lgName(t.lg)}${divName(t)}${m.g?`第 ${rank} 名`:"・開季前"}</span><button class="ghost sm" data-lg="leaders">本季排行榜</button></div>
    ${LG.note?`<p class="tr-note ${LG.note.ok?'ok':'bad'}">${esc(LG.note.msg)}</p>`:''}
    ${next}
    ${sims.length?`<div class="lg-sims">${sims.map(([k,l])=>`<button class="ghost" data-lgsim="${k}">${l}</button>`).join('')}</div>`:''}
    <div class="tr-tabs">${tabs.map(([k,l])=>`<button class="${LG.tab===k?'sel':''}" data-lgtab="${k}">${l}</button>`).join('')}</div>
    <div class="lg-body">${body()}</div>`;
}
$('#leagueBody').addEventListener('click',async e=>{
  const el=sel=>e.target.closest(sel);
  if(el('[data-lgtab]')){LG.tab=el('[data-lgtab]').dataset.lgtab; return renderLeague();}
  if(el('[data-lgsp]')){LG.sp=el('[data-lgsp]').dataset.lgsp; return renderLeague();}
  if(el('[data-lgsim]')) return simSeason(el('[data-lgsim]').dataset.lgsim);
  const b=el('[data-lg]'); if(!b) return;
  const k=b.dataset.lg;
  if(k==='play') return playSeasonGame();
  if(k==='mine') return simSeason('mine');
  if(k==='new') return nextSeason();
  if(k==='leaders'){TM.lb.scope='all'; return openManage('leaders');}
});

/* ---------- 球員管理：資料庫、名單、訓練、強化 ---------- */
const TM={view:'hub', sel:null, kind:'all', log:[]};
$('#manageBody').addEventListener('change',e=>{
  if(e.target.name==='syMain'){TM.syMain=e.target.value; TM.syPicked=true; return renderManage();}
  const k=e.target.dataset.sa; if(k){ TM.sa[k]=e.target.type==='checkbox'?e.target.checked:e.target.type==='number'?Math.max(13,+e.target.value||13):e.target.value;
    if(TM.sa.plan&&k!=='arrange') previewAutoSynth(); renderManage(); }
});
function openManage(view='hub'){ TM.view=view; TM.log=[]; renderManage(); $('#manage').hidden=false; }
function renderManage(){
  const t=teamOf(me().team), box=$('#manageBody');
  box.classList.toggle('wide', TM.view!=='hub');
  if(TM.view==='hub'){
    box.innerHTML=`${closeBtn('manage')}<h1>球員管理<small>${t.name}</small></h1>
      <div class="hub-grid">
        <button class="hub-b" data-hub="db"><b>球員資料庫</b><span>瀏覽全聯盟 ${Object.keys(LEAGUE.players).length.toLocaleString()} 名球員的球員卡</span></button>
        <button class="hub-b" data-hub="roster"><b>球隊名單</b><span>一軍打序、輪值、牛棚與二軍</span></button>
        <button class="hub-b hot" data-hub="train"><b>球員訓練</b><span>指定一項能力加強，總評上限是潛力</span></button>
        <button class="hub-b hot" data-hub="enhance"><b>球員強化</b><span>+1～+${ENH_MAX}，全部能力與潛力一起提升</span></button>
        <button class="hub-b auto" data-hub="optimize"><b>一鍵配置陣容</b><span>最強 26 人上一軍，自動排打序、守備、輪值與牛棚</span></button>
        <button class="hub-b hot" data-hub="synth"><b>球員合成</b><span>同稀有度 ${SYNTH_N} 張合成 1 張，稀有度升一級</span></button>
        <button class="hub-b lb" data-hub="leaders"><b>排行榜</b><span>打擊、投手各項成績排名（打擊率、全壘打、防禦率、勝場…）</span></button>
      </div>`;
    return;
  }
  if(TM.view==='leaders') return renderLeaders();
  if(TM.view==='synth') return renderSynth();
  if(TM.view==='optimize') return renderOptimize();
  const ids=[...t.roster,...t.farm].filter(id=>TM.kind==='all'||LEAGUE.players[id].kind===TM.kind).sort((a,b)=>P_(b).ovr-P_(a).ovr);
  if(!TM.sel||!ids.includes(TM.sel)) TM.sel=ids[0];
  const p=P_(TM.sel), kinds=[['all','全部'],['H','野手'],['P','投手']];
  const list=`<div class="tm-kind">${kinds.map(([k,l])=>`<button class="${TM.kind===k?'sel':''}" data-kind="${k}">${l}</button>`).join('')}</div>
    <div class="tr-list tall"><table class="box tr-t tm-t">${pHead(false,'<th>強化</th>')}${ids.map(id=>{const q=P_(id);
      return pRow(q,{sel:id===TM.sel, extra:`<td>${q.enh?'+'+q.enh:''}</td>`}).replace('<tr ','<tr data-pick="1" ');}).join('')}</table></div>`;
  const title=TM.view==='train'?'球員訓練':'球員強化';
  const keep=$('#manageBody .tr-list')?$('#manageBody .tr-list').scrollTop:0;
  box.innerHTML=`<button class="ghost dlg-x" data-tm="hub">← 球員管理</button><h1>${title}<small>${t.name}</small></h1>
    <div class="shop-bar"><span class="coin"><em>●</em>${me().coins.toLocaleString()} 金幣</span>${TM.view==='train'?`<span>今日免費訓練 ${freeLeft()}／${TRAIN_FREE}（用完後每次 ${TRAIN_COST} 金幣）</span>`:''}</div>
    <div class="tm-grid"><section>${list}</section><section class="tm-side">${TM.view==='train'?trainPanel(p):enhancePanel(p)}</section></div>`;
  if(keep) $('#manageBody .tr-list').scrollTop=keep;
}
const freeLeft=()=>{const p=me(); return p.train&&p.train.date===today()?Math.max(0,TRAIN_FREE-p.train.used):TRAIN_FREE;};
const roomBar=p=>{const cap=Math.min(p.pot,rarCap(p)), r=rarOf(p);
  return `<div class="tm-room"><span><i class="rdot r-${r.id}"></i>${r.name}卡・總評 <b>${p.ovr}</b> ／ 上限 <b>${cap}</b>（潛力 ${p.pot}、${r.name}上限 ${rarCap(p)}）</span>
  <div class="tm-bar"><i style="width:${abilPct(p.ovr)}%"></i><i class="pot" style="width:${abilPct(Math.max(0,cap-p.ovr))}%"></i></div></div>`;};
const tmHead=p=>`<div class="tm-head"><img src="${avatar(p,teamById(p.team))}" alt=""><div><b>${p.name}${p.enh?` <em class="enh">+${p.enh}</em>`:''}</b>
  <span>${posTxt(p)}・${p.age} 歲・${levelTxt(p)}</span><button class="lnk" data-card="${p.id}">看球員卡</button></div></div>`;
const tmLog=()=>TM.log.length?`<ul class="tm-log">${TM.log.slice(-6).reverse().map(x=>`<li class="${x.cls}">${x.msg}</li>`).join('')}</ul>`:'';
function trainPanel(p){
  const free=freeLeft()>0, cant=!free&&me().coins<TRAIN_COST, capped=p.ovr>=Math.min(p.pot,rarCap(p));
  const items=[...TRAIN_MENU[p.kind].map(([k,l])=>[k,l,p[k],abilCap(p,k)]), ...(p.kind==='P'?p.pitches.map((x,i)=>['pitch'+i,x.n,x.r,abilCap(p,'pitch')]):[])];
  return `<button class="ghost auto-btn" data-autotrain="1" ${freeLeft()>0?'':'disabled'}>一鍵訓練（用掉今天剩下的 ${freeLeft()} 次免費訓練）</button>
    ${tmHead(p)}${roomBar(p)}
    ${capped?`<p class="tr-note bad">${p.ovr>=p.pot?'已達潛力上限，先到「球員強化」提升潛力才能繼續訓練。':`已達${rarOf(p).name}卡的總評上限，到「球員合成」升級稀有度，或強化提高上限。`}</p>`:''}
    <div class="tm-items">${items.map(([k,l,v,top])=>{const g=grade(v);
      return `<div class="tm-item"><span class="pc-l">${l}</span><span class="gr g-${g}">${g}</span><span class="pc-v">${v}<small>／${top}${k==='velo'?`（${topMph(v)} mph）`:''}</small></span>
        <button class="hot-btn sm" data-train="${k}" ${capped||cant||v>=top?'disabled':''}>${free?'訓練（免費）':`訓練 ● ${TRAIN_COST}`}</button></div>`;}).join('')}</div>
    <p class="tr-tip">每次 +1～3（23 歲以下成長加倍、28 歲以下 1.5 倍、34 歲以上減半），15% 機率大成功再加倍。</p>${tmLog()}`;
}
function enhancePanel(p){
  const lv=p.enh||0, max=lv>=ENH_MAX, cost=ENH_COST[lv], rate=ENH_RATE[lv];
  const stars=Array.from({length:ENH_MAX},(_,i)=>`<i class="${i<lv?'on':''}">★</i>`).join('');
  return `${tmHead(p)}${roomBar(p)}
    <div class="tm-enh"><div class="tm-stars">${stars}</div>
      ${max?`<p class="tr-note ok">已經強化到 +${ENH_MAX}（最高等級）</p>`:`
      <div class="tm-next"><span>下一級 <b>+${lv+1}</b></span><span>成功率 <b>${Math.round(rate*100)}%</b></span><span>費用 <b>● ${cost.toLocaleString()}</b></span></div>
      <p class="tr-tip">成功：全部能力 +2${p.kind==='P'?'（含每個球種）':''}、潛力 +4、總評上限 +2。失敗只扣金幣，等級不會下降。稀有度不會因為強化改變，要升級請用合成。</p>
      <button class="hot-btn" data-enh="1" ${me().coins<cost?'disabled':''}>強化 +${lv+1}</button>`}
    </div>${tmLog()}`;
}
/* ---------- 排行榜：打擊、投手兩大項，各自再分細項 ----------
   成績是本季季賽的累積（L.stats，engine.js 的 recordGame）：全聯盟每一場季賽都算，季後賽、友誼賽不算，新球季歸零。
   比率項目（打擊率、防禦率…）要達到規定：打席 ≥ 球隊出賽場數×3.1、投球局數 ≥ 球隊出賽場數×1。 */
const rate3=v=>v.toFixed(3).replace(/^0/,''), dec2=v=>v.toFixed(2);
// [鍵, 名稱, 顯示格式, 比率項目要達規定, 越低越好]
const LB_CATS={
  H:[['avg','打擊率',rate3,1],['hr','全壘打'],['rbi','打點'],['h','安打'],['obp','上壘率',rate3,1],['slg','長打率',rate3,1],
     ['ops','OPS',rate3,1],['d2','二壘安打'],['d3','三壘安打'],['bb','保送'],['so','三振']],
  P:[['era','防禦率',dec2,1,1],['w','勝場'],['pso','三振'],['sv','救援'],['whip','WHIP',dec2,1,1],
     ['k9','每九局三振',dec2,1],['outs','投球局數',ipTxt],['pg','出賽']],
};
TM.lb={grp:'H', cat:'avg', scope:'all'};
// 某一項的排名：回傳 [{p, s, r(比率), v(排名值), rank}]，同分同名次
function leaderRows(grp, cat, scope, limit=30){
  const [k,,,isRate,asc]=LB_CATS[grp].find(c=>c[0]===cat), maxGp=Math.max(0,...LEAGUE.teams.map(t=>t.gp||0));
  const out=[];
  Object.entries(LEAGUE.stats||{}).forEach(([id,s])=>{
    const p=LEAGUE.players[id]; if(!p||p.kind!==grp) return;
    if(scope==='mine'&&p.team!==me().team) return;
    if(grp==='H'?!s.pa:!s.pg) return;
    const r=statRates(s), v=isRate?r[k]:s[k];
    if(v===null||(!isRate&&!v)) return;
    if(isRate){const gp=(teamOf(p.team)||{}).gp??maxGp; if(grp==='H'?s.pa<gp*3.1:s.outs<gp*3) return;}
    out.push({p, s, r, v});
  });
  out.sort((a,b)=>asc?a.v-b.v:b.v-a.v);
  out.forEach((x,i)=>x.rank=i&&x.v===out[i-1].v?out[i-1].rank:i+1);
  return out.slice(0,limit);
}
function renderLeaders(){
  const t=myT(), L=TM.lb, cats=LB_CATS[L.grp], cat=cats.find(c=>c[0]===L.cat)||cats[0]; L.cat=cat[0];
  const fmt=cat[2]||(v=>v), list=leaderRows(L.grp,L.cat,L.scope), any=Object.keys(LEAGUE.stats||{}).length>0;
  const tm=p=>{const x=teamOf(p.team); return x?`<i class="dot" style="background:${x.color}"></i>${x.short}`:'自由球員';};
  const H=L.grp==='H';
  const cols=H?[['g','出賽'],['pa','打席'],['ab','打數'],['h','安打'],['hr','全壘打'],['rbi','打點'],['avg','打擊率'],['ops','OPS']]
    :[['pg','出賽'],['wl','勝-敗'],['sv','救援'],['outs','局數'],['pso','三振'],['era','防禦率'],['whip','WHIP']];
  const cell=(x,c)=>c==='wl'?`${x.s.w}-${x.s.l}`:c==='outs'?ipTxt(x.s.outs):['avg','ops'].includes(c)?(x.r[c]===null?'-':rate3(x.r[c]))
    :['era','whip'].includes(c)?(x.r[c]===null?'-':dec2(x.r[c])):x.s[c];
  const top=list.slice(0,3).map(x=>`<button class="lb-card r${x.rank}" data-card="${x.p.id}"><em>${x.rank}</em><img src="${avatar(x.p,teamById(x.p.team))}" alt="">
    <span><b>${esc(x.p.name)}</b><small>${tm(x.p)}・${posAbbr(x.p)}</small></span><strong>${fmt(x.v)}</strong></button>`).join('');
  const rateNote=cat[3]?`需達規定${H?'打席（球隊出賽場數 × 3.1）':'投球局數（球隊出賽場數 × 1）'}。`:'';
  $('#manageBody').innerHTML=`<button class="ghost dlg-x" data-tm="hub">← 球員管理</button><h1>排行榜<small>第 ${LEAGUE.season.year} 季・${t.name}</small></h1>
    <div class="tr-tabs">${[['H','打擊'],['P','投手']].map(([g,l])=>`<button class="${L.grp===g?'sel':''}" data-lbg="${g}">${l}</button>`).join('')}</div>
    <div class="lb-bar"><div class="sy-tabs lb-cats">${cats.map(c=>`<button class="${c[0]===L.cat?'sel':''}" data-lbc="${c[0]}">${c[1]}</button>`).join('')}</div>
      <div class="tm-kind">${[['all','全聯盟'],['mine','我的球隊']].map(([s,l])=>`<button class="${L.scope===s?'sel':''}" data-lbs="${s}">${l}</button>`).join('')}</div></div>
    ${!any?'<p class="lead">本季還沒有比賽成績。到「聯賽」打一場或模擬一天，全聯盟的成績就會累積到這裡。</p>'
    :!list.length?`<p class="lead">目前沒有球員列入「${cat[1]}」排行。${rateNote}</p>`
    :`<div class="lb-top">${top}</div>
      <div class="tr-list"><table class="box tr-t lb-t"><tr><th>名次</th><th>球員</th><th>球隊</th><th class="lb-main">${cat[1]}</th>${cols.filter(c=>c[0]!==L.cat).map(c=>`<th>${c[1]}</th>`).join('')}</tr>
        ${list.map(x=>`<tr data-card="${x.p.id}" class="${x.p.team===t.id?'sel':''}"><td>${x.rank}</td><td><i class="rdot r-${rarOf(x.p).id}"></i>${esc(x.p.name)} <small>${posAbbr(x.p)}</small></td><td>${tm(x.p)}</td>
          <td class="lb-main"><b>${fmt(x.v)}</b></td>${cols.filter(c=>c[0]!==L.cat).map(c=>`<td>${cell(x,c[0])}</td>`).join('')}</tr>`).join('')}</table></div>`}
    <p class="tr-tip">${rateNote}成績來自本季季賽（全聯盟 20 隊每一場都算，季後賽和友誼賽不算）；失分都算自責分。點球員可以看球員卡，你的球隊會標示底色。</p>`;
}

/* ---------- 一鍵處理：配置陣容、合成、訓練 ---------- */
TM.sa={keepCore:true, keepEnh:true, maxTier:'mythic', reserveH:15, reserveP:15, arrange:true, plan:null, done:null};
const myT=()=>teamOf(me().team);
// 一鍵配置陣容
async function runOptimize(){
  const t=myT(), res=optimizeRoster(LEAGUE,t); TM.opt=res; await saveLeague(); renderSetup();
  return res;
}
function renderOptimize(){
  const t=myT(), r=TM.opt||{up:[],down:[]}, nm=id=>{const p=P_(id); return `<i class="rdot ${rarity(p)[0]}"></i>${esc(p.name)}`;};
  $('#manageBody').innerHTML=`<button class="ghost dlg-x" data-tm="hub">← 球員管理</button><h1>一鍵配置陣容<small>${t.name}</small></h1>
    <p class="tr-note ok">已重新配置：一軍 13 名野手（每個守位至少一人、兩名捕手）＋13 名投手（5 名先發、1 名終結），其餘放二軍；打序、守備、輪值、牛棚都重排好了。</p>
    <div class="opt-grid">
      <section><h2>打序與守備</h2><table class="box tr-t"><tr><th>棒次</th><th>守位</th><th>姓名</th><th>總評</th></tr>
        ${t.lineup.map((x,i)=>`<tr><td>${i+1}</td><td>${POS_NAME[x.pos]}</td><td>${nm(x.id)}</td><td><b>${P_(x.id).ovr}</b></td></tr>`).join('')}</table>
        <h2>替補野手</h2><p class="opt-names">${t.bench.map(nm).join('、')||'無'}</p></section>
      <section><h2>先發輪值</h2><table class="box tr-t"><tr><th>順序</th><th>姓名</th><th>總評</th></tr>
        ${t.rotation.map((id,i)=>`<tr><td>${i+1}</td><td>${nm(id)}</td><td><b>${P_(id).ovr}</b></td></tr>`).join('')}</table>
        <h2>終結者</h2><p class="opt-names">${t.closer?nm(t.closer):'無'}</p>
        <h2>牛棚</h2><p class="opt-names">${t.bullpen.map(nm).join('、')||'無'}</p></section>
      <section><h2>升上一軍（${r.up.length}）</h2><p class="opt-names">${r.up.map(nm).join('、')||'沒有變動'}</p>
        <h2>降到二軍（${r.down.length}）</h2><p class="opt-names">${r.down.map(nm).join('、')||'沒有變動'}</p></section>
    </div>`;
}
// 一鍵合成：先在複製的聯盟上試算給玩家看，確認後才真的執行（結果會一樣）
const saOpt=()=>({keepCore:TM.sa.keepCore, keepEnh:TM.sa.keepEnh, maxTier:TM.sa.maxTier, reserveH:TM.sa.reserveH, reserveP:TM.sa.reserveP});
function previewAutoSynth(){ const C=cloneLeague(LEAGUE); TM.sa.plan=autoSynthesize(C,C.teams.find(x=>x.id===me().team),{...saOpt(), assumeSuccess:true}); TM.sa.done=null; }
function saPanel(){
  const s=TM.sa, opt=(v,l)=>`<option value="${v}"${v===s.maxTier?' selected':''}>${l}</option>`;
  const step=x=>`<li class="${x.success===false?'fail':''}"><i class="rdot r-${x.to.id}"></i>${s.done?(x.success?'✓ ':'✗ '):''}<b>${esc(x.main)}</b> ${x.from.name}→${x.to.name}${x.success===false?'（失敗）':`（${x.ovrBefore}→${x.ovrAfter}）`}<small>${s.done?'':`成功率 ${Math.round(x.rate*100)}%・`}消耗：${x.consumed.map(esc).join('、')}</small></li>`;
  return `<div class="sa-box"><h3>一鍵合成</h3>
    <p class="tr-tip">從最低稀有度開始：每次用該稀有度總評最高的卡當主卡、總評最低的 4 張當材料，能合就合，再往上一級。</p>
    <div class="sa-opt">
      <label><input type="checkbox" data-sa="keepCore" ${s.keepCore?'checked':''}> 一軍主力不當材料</label>
      <label><input type="checkbox" data-sa="keepEnh" ${s.keepEnh?'checked':''}> 強化過的卡不當材料</label>
      <label><input type="checkbox" data-sa="arrange" ${s.arrange?'checked':''}> 合成完自動一鍵配置陣容</label>
      <label>最多合到<select data-sa="maxTier">${RARITY.slice(0,-1).reverse().map(r=>opt(r.id,r.name)).join('')}</select></label>
      <label>至少保留野手<input type="number" data-sa="reserveH" min="13" max="60" value="${s.reserveH}"></label>
      <label>至少保留投手<input type="number" data-sa="reserveP" min="13" max="60" value="${s.reserveP}"></label>
    </div>
    <div class="ad-actions"><button class="ghost" data-saprev="1">預覽</button>
      ${s.plan?`<button class="hot-btn sm" data-sago="1" ${s.plan.length?'':'disabled'}>執行 ${s.plan.length} 次合成</button>`:''}</div>
    ${s.plan?(s.plan.length?`<p class="tr-tip">預計：${s.plan.length} 次合成，消耗 ${s.plan.reduce((a,x)=>a+x.consumed.length,0)} 張卡（以全部成功試算；實際每次都要擲成功率，失敗時主卡不升級、材料照樣消耗，後面的步驟會跟著變少）</p><ol class="sa-plan">${s.plan.map(step).join('')}</ol>`
      :'<p class="tr-note bad">目前沒有可以合成的組合（每個稀有度要有主卡＋4 張可當材料的卡，且不能低於保留人數）。</p>'):''}
    ${s.done?`<p class="tr-note ok">一鍵合成完成：${s.done.length} 次，成功 ${s.done.filter(x=>x.success).length} 次、失敗 ${s.done.filter(x=>!x.success).length} 次</p><ol class="sa-plan">${s.done.map(step).join('')}</ol>`:''}
  </div>`;
}
async function runAutoSynth(){
  const mats=TM.sa.plan.reduce((a,x)=>a+x.consumed.length,0);
  if(!confirm(`執行一鍵合成？最多 ${TM.sa.plan.length} 次、永久消耗約 ${mats} 張卡。每次合成都有成功率，失敗時主卡不升級、材料照樣消耗。`)) return;
  const steps=autoSynthesize(LEAGUE,myT(),{...saOpt(), bonus:synthBonus()}); saveProfiles();
  if(TM.sa.arrange) optimizeRoster(LEAGUE,myT());
  TM.sa.done=steps; TM.sa.plan=null; TM.sySel=[]; TM.syMain=null; TM.syDone=null;
  await saveLeague(); renderSetup(); renderManage();
}
// 一鍵訓練：把今天剩下的免費次數用在一軍主力上（離上限最遠的先練；野手練力量／技巧、投手練球速／控球裡較低的那項）
async function runAutoTrain(){
  const t=myT(), pf=me(), skip=new Set(), out=[];
  while(freeLeft()>0){
    const core=[...new Set([...t.lineup.map(x=>x.id),...t.rotation,t.closer].filter(Boolean))].map(P_)
      .filter(p=>!skip.has(p.id)&&p.ovr<Math.min(p.pot,rarCap(p)));
    if(!core.length) break;
    const room=p=>Math.min(p.pot,rarCap(p))-p.ovr; core.sort((a,b)=>room(b)-room(a));
    const p=core[0], key=(p.kind==='H'?['pow','con']:['velo','ctrl']).filter(k=>p[k]<abilCap(p,k)).sort((a,b)=>p[a]-p[b])[0];
    if(!key){skip.add(p.id); continue;}
    const r=trainPlayer(p,key);
    if(!r.ok){skip.add(p.id); continue;}
    pf.train=pf.train&&pf.train.date===today()?pf.train:{date:today(),used:0}; pf.train.used++;
    out.push({msg:r.msg, cls:r.great?'great':'ok'});
  }
  saveProfiles(); if(out.length) await saveLeague();
  TM.log.push(...(out.length?out:[{msg:'一軍主力都已到上限，或今天的免費次數用完了', cls:'bad'}]));
  renderManage();
}

/* ---------- 球員合成：同稀有度 5 張 → 主卡升一級，另外 4 張消耗 ---------- */
TM.syR=null; TM.sySel=[]; TM.syMain=null; TM.syDone=null;
const synthBonus=()=>{const p=me(); if(!p.synthBonus)p.synthBonus={}; return p.synthBonus;};
const isCore=(t,id)=>t.lineup.some(x=>x.id===id)||t.rotation.includes(id)||t.closer===id;
function renderSynth(){
  const t=teamOf(me().team), mine=[...t.roster,...t.farm].map(P_);
  const counts=Object.fromEntries(RARITY.map(r=>[r.id,mine.filter(p=>rarOf(p).id===r.id).length]));
  const tiers=RARITY.slice(1).reverse();                                   // 普通～傳說（神話不能再升）
  if(!TM.syR) TM.syR=(tiers.find(r=>counts[r.id]>=SYNTH_N)||tiers[0]).id;
  TM.sySel=TM.sySel.filter(id=>LEAGUE.players[id]&&rarOf(P_(id)).id===TM.syR);
  // 主卡預設是選到的卡裡總評最高的；玩家自己點過就照玩家的
  if(!TM.syPicked||!TM.sySel.includes(TM.syMain)){TM.syPicked=false; TM.syMain=TM.sySel.slice().sort((a,b)=>P_(b).ovr-P_(a).ovr)[0]||null;}
  const list=mine.filter(p=>rarOf(p).id===TM.syR).sort((a,b)=>a.ovr-b.ovr);   // 低總評的在前面，方便當材料
  const to=RARITY[RARITY.findIndex(r=>r.id===TM.syR)-1];
  const chk=TM.sySel.length===SYNTH_N?synthCheck(LEAGUE,TM.sySel,TM.syMain,synthBonus()[to.id]||0):null;
  const rateTxt=r=>{const b=synthBonus()[r.id]||0; return `${Math.round(Math.min(1,SYNTH_RATE[r.id]+b)*100)}%${b?`<small>（失敗加成 +${Math.round(b*100)}%）</small>`:''}`;};
  const done=TM.syDone&&LEAGUE.players[TM.syDone]?P_(TM.syDone):null;
  $('#manageBody').innerHTML=`<button class="ghost dlg-x" data-tm="hub">← 球員管理</button><h1>球員合成<small>${t.name}</small></h1>
    <p class="tr-tip">選 ${SYNTH_N} 張同稀有度的卡，指定一張當主卡：主卡升一級稀有度、總評提高到新等級的範圍，潛力至少到新等級的上限；另外 ${SYNTH_N-1} 張會被消耗掉（永久移除）。</p>
    <div class="sy-tabs">${tiers.map(r=>`<button class="r-${r.id} ${TM.syR===r.id?'sel':''}" data-syr="${r.id}"><i class="rdot r-${r.id}"></i>${r.name}<small>${counts[r.id]} 張</small></button>`).join('')}</div>
    <div class="tm-grid sy-grid"><section>
        <div class="sy-cards">${list.length?list.map(p=>{const i=TM.sySel.indexOf(p.id);
          return `<div class="sy-c ${i>=0?'on':''}" data-sy="${p.id}">${miniCard(p)}${i>=0?`<b class="sy-n">${p.id===TM.syMain?'主':i+1}</b>`:''}${isCore(t,p.id)?'<span class="sy-core">一軍主力</span>':''}</div>`;}).join('')
          :`<p class="lead">你的球隊沒有${RARITY.find(r=>r.id===TM.syR).name}卡。</p>`}</div>
      </section><section class="tm-side">
        ${saPanel()}
        <h2>手動合成：${RARITY.find(r=>r.id===TM.syR).name} ×${SYNTH_N} → <span class="sy-to" style="color:${to.color}">${to.name}</span></h2>
        <p class="sy-rate">成功率 <b>${rateTxt(to)}</b>　失敗時 ${SYNTH_N-1} 張材料照樣消耗、主卡不變；每失敗一次，下次合到${to.name} +${Math.round(SYNTH_FAIL_BONUS*100)}%。</p>
        <ol class="sy-slots">${Array.from({length:SYNTH_N},(_,i)=>{const id=TM.sySel[i], p=id&&P_(id);
          return p?`<li><label><input type="radio" name="syMain" value="${id}" ${id===TM.syMain?'checked':''}> 主卡</label><b>${esc(p.name)}</b><span>${posAbbr(p)}・總評 ${p.ovr}${isCore(t,id)?'・<em>一軍主力</em>':''}</span><button class="ghost sm" data-syrm="${id}">移除</button></li>`
            :`<li class="empty">空位 ${i+1}</li>`;}).join('')}</ol>
        <p class="tr-tip">${chk?esc(chk.msg):`已選 ${TM.sySel.length}／${SYNTH_N} 張（點左邊的卡加入或移除）`}</p>
        <button class="hot-btn" data-sygo="1" ${chk&&chk.ok?'':'disabled'}>合成</button>
        ${done?`<div class="sy-done ${TM.syFail?'fail':''}"><p class="tr-note ${TM.syFail?'bad':'ok'}">${esc(TM.log.length?TM.log[TM.log.length-1].msg:'')}</p>${cardHTML(done)}</div>`:''}
        <table class="rates sy-rates"><tr><th colspan="2">各級合成成功率</th></tr>${RARITY.slice(0,-1).reverse().map(r=>`<tr><td><i class="rdot r-${r.id}"></i>合成到${r.name}</td><td>${rateTxt(r)}</td></tr>`).join('')}</table>
      </section></div>`;
}

$('#manageBody').addEventListener('click',async e=>{
  const el=sel=>e.target.closest(sel);
  if(el('[data-card]')) return openCard(el('[data-card]').dataset.card);
  if(el('[data-tm]')){TM.view=el('[data-tm]').dataset.tm; return renderManage();}
  if(el('[data-kind]')){TM.kind=el('[data-kind]').dataset.kind; TM.sel=null; return renderManage();}
  // 排行榜
  if(el('[data-lbg]')){TM.lb.grp=el('[data-lbg]').dataset.lbg; TM.lb.cat=LB_CATS[TM.lb.grp][0][0]; return renderManage();}
  if(el('[data-lbc]')){TM.lb.cat=el('[data-lbc]').dataset.lbc; return renderManage();}
  if(el('[data-lbs]')){TM.lb.scope=el('[data-lbs]').dataset.lbs; return renderManage();}
  const row=el('tr[data-pick]'); if(row){TM.sel=row.dataset.id; TM.log=[]; return renderManage();}
  // 一鍵處理
  if(el('[data-saprev]')){previewAutoSynth(); return renderManage();}
  if(el('[data-sago]')) return runAutoSynth();
  if(el('[data-autotrain]')) return runAutoTrain();
  // 合成
  if(el('[data-syr]')){TM.syR=el('[data-syr]').dataset.syr; TM.sySel=[]; TM.syDone=null; return renderManage();}
  if(el('[data-syrm]')){TM.sySel=TM.sySel.filter(x=>x!==el('[data-syrm]').dataset.syrm); return renderManage();}
  const sc=el('[data-sy]'); if(sc){const id=sc.dataset.sy; TM.syDone=null;
    if(TM.sySel.includes(id)) TM.sySel=TM.sySel.filter(x=>x!==id); else if(TM.sySel.length<SYNTH_N) TM.sySel.push(id);
    return renderManage();}
  if(el('[data-sygo]')){const mats=TM.sySel.filter(x=>x!==TM.syMain).map(id=>P_(id).name), core=TM.sySel.filter(x=>x!==TM.syMain&&isCore(teamOf(me().team),x));
    if(!confirm(`消耗 ${mats.join('、')} 這 ${mats.length} 張卡，讓 ${P_(TM.syMain).name} 升級？${core.length?'\n其中有一軍主力，消耗後打序與投手群會自動重排。':''}被消耗的球員會永久移除。`))return;
    const sb=synthBonus(), toId=rarOf(P_(TM.syMain)).id, toR=RARITY[RARITY.findIndex(x=>x.id===toId)-1].id;
    const r=synthesize(LEAGUE,TM.sySel,TM.syMain,{bonus:sb[toR]||0}); if(!r.ok){TM.log.push({msg:r.msg,cls:'bad'}); return renderManage();}
    sb[toR]=r.success?0:(sb[toR]||0)+SYNTH_FAIL_BONUS; saveProfiles();
    TM.log.push({msg:r.msg,cls:r.success?'great':'bad'}); TM.syDone=r.main.id; TM.syFail=!r.success; TM.sySel=[]; TM.syMain=null;
    await saveLeague(); renderSetup(); return renderManage();}
  const hub=el('[data-hub]');
  if(hub){ pick.me=me().team; const h=hub.dataset.hub;
    if(h==='db') return openDBV({team:me().team});
    if(h==='roster'){renderRoster(teamOf(me().team)); $('#roster').hidden=false; return;}
    if(h==='optimize'){ await runOptimize(); TM.view='optimize'; return renderManage(); }
    TM.view=h; TM.log=[]; return renderManage(); }
  const tb=el('[data-train]');
  if(tb){ const pf=me(), free=freeLeft()>0; if(!free&&pf.coins<TRAIN_COST)return;
    const r=trainPlayer(P_(TM.sel),tb.dataset.train);
    if(r.ok){ if(free){pf.train=pf.train&&pf.train.date===today()?pf.train:{date:today(),used:0}; pf.train.used++;} else pf.coins-=TRAIN_COST;
      saveProfiles(); await saveLeague(); }
    TM.log.push({msg:r.msg, cls:r.ok?(r.great?'great':'ok'):'bad'}); return renderManage(); }
  if(el('[data-enh]')){ const pf=me(), p=P_(TM.sel), cost=ENH_COST[p.enh||0]; if(pf.coins<cost)return;
    const r=enhancePlayer(p); if(!r.ok){TM.log.push({msg:r.msg,cls:'bad'}); return renderManage();}
    pf.coins-=cost; saveProfiles(); if(r.success) await saveLeague();
    TM.log.push({msg:r.msg, cls:r.success?'great':'bad'}); renderManage();
    const box=$('.tm-enh'); if(box) box.classList.add(r.success?'win':'lose'); return; }
});

/* ---------- 商城：球員卡池（7 級稀有度＋保底） ---------- */
// 抽卡會產生新球員（engine.js 的 createPlayer），簽進主隊二軍；保底進度存在玩家檔案的 gacha
const gachaState=()=>{const p=me(); if(!p.gacha)p.gacha={sinceEpic:0, sinceLegend:0, pulls:0}; return p.gacha;};
function openShop(note){
  const p=me(), t=teamOf(p.team), g=gachaState(), room=ROSTER_MAX-teamSize(t);
  const can=n=>p.coins>=(n===1?GACHA.single:GACHA.ten)&&room>=n;
  const pity=(left,total,label,cls)=>`<div class="pity"><span>${label}保底：再 <b>${left}</b> 抽必出</span><div class="pity-bar ${cls}"><i style="width:${(total-left)/total*100}%"></i></div></div>`;
  $('#shopBody').innerHTML=`${closeBtn('shop')}<h1>商城系統<small>${t.name}</small></h1>
    <div class="shop-bar"><span class="coin"><em>●</em>${p.coins.toLocaleString()} 金幣</span>
      <span>名單 ${teamSize(t)}／${ROSTER_MAX}</span><span>累計抽卡 ${g.pulls} 次</span></div>
    <p class="tr-tip">聯賽季賽贏一場 +${REWARD.win}、輸 +${REWARD.loss}、和局 +${REWARD.tie}，季後賽贏一場 +${POST_COINS.win}，奪冠另有獎金；每天第一次登入 +${DAILY_BONUS}。抽到的是全新球員，直接簽進二軍（新人合約，不受薪資上限限制）。</p>
    ${note?`<p class="tr-note ${note.ok?'ok':'bad'}">${esc(note.msg)}</p>`:''}
    <div class="banner-pool">
      <div class="bp-art"><span>標準球員卡池</span><div class="bp-strip">${RARITY.slice().reverse().map(r=>`<i class="r-${r.id}"></i>`).join('')}</div></div>
      <div class="bp-info">
        <table class="rates">${RARITY.map(r=>`<tr><td><i class="rdot r-${r.id}"></i>${r.name}</td><td>總評 ${r.id==='common'?'45～59':`${r.min}～${r.max}`}</td><td><b>${(GACHA.rates[r.id]*100).toFixed(1)}%</b></td></tr>`).join('')}</table>
        ${pity(GACHA.epicPity-g.sinceEpic,GACHA.epicPity,'史詩以上','r-epic')}
        ${pity(GACHA.legendPity-g.sinceLegend,GACHA.legendPity,'傳說以上','r-legend')}
        <p class="tr-tip">十連抽保證至少 1 張稀有以上。</p>
        <div class="bp-btns"><button class="hot-btn" data-pull="1" ${can(1)?'':'disabled'}>單抽 ● ${GACHA.single}</button>
          <button class="hot-btn" data-pull="10" ${can(10)?'':'disabled'}>十連抽 ● ${GACHA.ten.toLocaleString()}</button></div>
        ${room<10?`<p class="tr-tip">名單剩 ${room} 個空位（上限 ${ROSTER_MAX}），可以到交易市場釋出球員。</p>`:''}
      </div>
    </div>
    <div id="reveal"></div>
    ${p.purchases.length?`<h2>最近抽到</h2><ul class="tr-log">${p.purchases.slice(-10).reverse().map(x=>{const q=LEAGUE.players[x.id], r=RARITY.find(z=>z.id===x.rar)||rarityOf(x.ovr);
      return `<li><time>${new Date(x.at).toLocaleString('zh-TW',{hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'})}</time><i class="rdot r-${r.id}"></i>${r.name}：<button class="lnk" data-card="${x.id}">${esc(q?q.name:x.id)}</button>（總評 ${x.ovr}）</li>`;}).join('')}</ul>`:''}`;
  $('#shop').hidden=false;
}
$('#shopBody').addEventListener('click',async e=>{
  const c=e.target.closest('[data-card]'); if(c)return openCard(c.dataset.card);
  const b=e.target.closest('[data-pull]'); if(!b)return;
  const n=+b.dataset.pull, cost=n===1?GACHA.single:GACHA.ten, p=me(), t=teamOf(p.team);
  if(p.coins<cost||ROSTER_MAX-teamSize(t)<n) return;
  const g=gachaState(), rars=gachaRarities(g,n), got=rars.map(r=>createPlayer(LEAGUE,{rarity:r, teamId:p.team}));
  p.coins-=cost; g.pulls+=n;
  got.forEach((q,i)=>p.purchases.push({at:new Date().toISOString(), pack:n===1?'單抽':'十連抽', id:q.id, ovr:q.ovr, rar:rars[i]}));
  if(p.purchases.length>200) p.purchases=p.purchases.slice(-200);
  saveProfiles(); await saveLeague(); renderSetup();
  const best=got.reduce((a,q)=>{const d=rarityRank(rarOf(q).id)-rarityRank(rarOf(a).id); return d>0||(d===0&&q.ovr>a.ovr)?q:a;});
  openShop({ok:true, msg:n===1?`抽到 ${rarOf(best).name}・${best.name}！已簽進二軍`:`十連抽完成！最高是 ${rarOf(best).name}・${best.name}`});
  // 翻卡：卡背先顯示稀有度顏色，再依序翻開；最高稀有度的卡會發光
  $('#reveal').innerHTML=n===1
    ?`<div class="flip one"><div class="flip-in"><div class="flip-back ${rarity(best)[0]}"><span>?</span></div><div class="flip-front">${cardHTML(best)}</div></div></div>`
    :`<div class="flip-grid">${got.map((q,i)=>`<div class="flip ${q===best?'best':''}" style="--d:${i*0.12}s"><div class="flip-in"><div class="flip-back ${rarity(q)[0]}"><span>?</span></div><div class="flip-front">${miniCard(q)}</div></div></div>`).join('')}</div>`;
  setTimeout(()=>document.querySelectorAll('#reveal .flip').forEach(f=>f.classList.add('open')),60);
  $('#reveal').scrollIntoView({block:'nearest'});
});
document.addEventListener('click',e=>{const m=e.target.closest('#reveal .mc'); if(m)openCard(m.dataset.id);});

/* ---------- 設定 ---------- */
function openSettings(){
  const s=SETTINGS(), p=me(), t=teamOf(p.team), opt=(v,l,cur)=>`<option value="${v}"${v===cur?' selected':''}>${l}</option>`;
  $('#settingsBody').innerHTML=`${closeBtn('settings')}<h1>設定</h1>
    <div class="set">
      <label>暱稱<span><input id="setName" maxlength="12" value="${esc(p.name)}"><button class="ghost sm" id="setRename">改名</button></span></label>
      <label>隊名<span><b class="set-pre">${t.pre||''}</b><input id="setNick" maxlength="4" value="${esc(t.short)}"><button class="ghost sm" id="setTeamName">改隊名</button></span></label>
      <label>我的球隊<span>${t.city||''}・${lgName(t.lg)}${divName(t)}<button class="ghost sm" id="setTeam">更換球隊</button></span></label>
      <label>預設視角<select data-set="cam">${opt('auto','自動（投球時用投手視角）',s.cam)}${opt('catcher','捕手視角',s.cam)}${opt('pitcher','投手視角',s.cam)}</select></label>
      <label>背景音樂<select data-audio="on">${opt('on','開',AUD.on?'on':'off')}${opt('off','關',AUD.on?'on':'off')}</select></label>
      <label>音量<span class="vol"><input type="range" data-audio="vol" min="0" max="100" value="${AUD.vol}"><b id="volTxt">${AUD.vol}</b></span></label>
      <label>開場過場<select data-set="intro">${opt('on','播放',s.intro?'on':'off')}${opt('off','跳過',s.intro?'on':'off')}</select></label>
      <label>外觀<select data-set="theme">${opt('hot','熱血（預設）',s.theme)}${opt('auto','經典・跟隨系統',s.theme)}${opt('light','經典・淺色',s.theme)}${opt('dark','經典・深色',s.theme)}</select></label>
    </div>
    <h2>資料</h2>
    <div class="roster-btns"><button class="ghost" id="setExport" ${DB?'':'disabled'}>匯出球員資料庫</button><button class="ghost warn" id="setReset">還原球員資料庫</button><button class="ghost warn" id="setDel">刪除這個玩家</button></div>
    <p class="tr-tip" id="setMsg"></p>`;
  $('#settings').hidden=false;
}
$('#settingsBody').addEventListener('input',e=>{ if(e.target.dataset.audio==='vol'){setMusicVolume(+e.target.value); $('#volTxt').textContent=AUD.vol;} });
$('#settingsBody').addEventListener('change',e=>{
  if(e.target.dataset.audio==='on'){ setMusicOn(e.target.value==='on'); $('#setMsg').textContent='已儲存'; return; }
  const k=e.target.dataset.set; if(!k)return; const v=e.target.value;
  if(k==='team'){me().team=v; saveProfiles(); applySettings();}
  else setSetting(k, k==='intro'?v==='on':v);
  renderSetup();
  $('#setMsg').textContent='已儲存';
});
$('#settingsBody').addEventListener('click',async e=>{
  if(e.target.id==='setTeam'){ $('#settings').hidden=true; openTeamPick(true); return; }
  if(e.target.id==='setTeamName'){const t=teamOf(me().team), n=$('#setNick').value.trim();
    if(!n||n.length>4) return $('#setMsg').textContent='隊名要 1～4 個字';
    if(LEAGUE.teams.some(x=>x!==t&&(x.short===n||x.name===(t.pre||'')+n))) return $('#setMsg').textContent='和其他球隊撞名了';
    t.short=n; t.name=(t.pre||'')+n; await saveLeague(); renderSetup(); $('#setMsg').textContent=`已改成「${t.name}」`; return;}
  if(e.target.id==='setRename'){const n=$('#setName').value.trim(), old=PROFILES.current;
    if(!n||n.length>12) return $('#setMsg').textContent='暱稱要 1～12 個字';
    // 雲端玩家的 key 是帳號（cloud:…），改暱稱只改顯示的名字
    if(typeof isCloudKey==='function'&&isCloudKey(old)){ me().name=n; saveProfiles(); $('#setMsg').textContent='已改名'; renderMenu(); return; }
    if(n!==old&&PROFILES.list[n]) return $('#setMsg').textContent='這個暱稱已經有人用了';
    if(n===old) return;
    const p=PROFILES.list[old]; delete PROFILES.list[old]; p.name=n; PROFILES.list[n]=p; PROFILES.current=n; saveProfiles();
    await renameLeagueSave(old,n); $('#setMsg').textContent='已改名';}
  if(e.target.id==='setExport') exportLeague();
  if(e.target.id==='setReset'&&confirm('把你的聯盟還原成初始狀態？球隊、交易、抽到的球員、聯賽戰績都會清除（金幣不會退還）。之後要重新選隊。')){
    if(typeof cloudOn==='function'&&cloudOn()) setCloudMeta(CLOUD.user.id,{dirty:true});   // 重新整理後把全新的聯盟傳上雲端
    resetLeague();}
  if(e.target.id==='setDel'&&confirm(`刪除玩家「${me().name}」？金幣、戰績和這位玩家的聯盟存檔都會清除${typeof cloudOn==='function'&&cloudOn()?'（包含雲端上的存檔）':''}，其他玩家不受影響。`)){
    if(typeof cloudOn==='function'&&cloudOn()) await cloudDeleteRemote();
    await deleteLeagueSave(PROFILES.current); delete PROFILES.list[PROFILES.current]; PROFILES.current=null; saveProfiles(); location.reload();}
});

/* ---------- 連線對戰（準備中） ---------- */
function openOnline(){
  $('#onlineBody').innerHTML=`${closeBtn('online')}<h1>連線對戰</h1>
    <p class="soon">準備中</p>
    <p class="lead">連線對戰需要架設對戰伺服器，由伺服器判定每一球的結果，避免兩邊算出不同的比賽。目前還沒有開放。</p>
    <ul class="how"><li>好友房間：建立房間、分享代碼，邀請朋友對戰</li><li>隨機配對：和實力相近的玩家對戰</li><li>排名賽：累積積分與賽季排名</li></ul>`;
  $('#online').hidden=false;
}

/* ---------- 熱血風格動態背景 ---------- */
const HB={raf:0, embers:[], lines:[]};
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
function startBg(){ if(!HB.raf){fitBg(); HB.raf=requestAnimationFrame(bgFrame);} }
function stopBg(){ cancelAnimationFrame(HB.raf); HB.raf=0; }
function fitBg(){const c=$('#homeBg'), d=Math.min(devicePixelRatio||1,2); c.width=innerWidth*d; c.height=innerHeight*d; HB.d=d;}
addEventListener('resize',()=>{if(HB.raf)fitBg();});
function bgFrame(t){
  const c=$('#homeBg'), x=c.getContext('2d'), d=HB.d, w=c.width/d, h=c.height/d, T=reduceMotion?0:t/1000;
  x.setTransform(d,0,0,d,0,0);
  // 底色：中央爆發的橘紅到外圍暗紅
  const cx=w*0.5, cy=h*0.42, R=Math.hypot(w,h)*0.7;
  const g=x.createRadialGradient(cx,cy,0,cx,cy,R); g.addColorStop(0,'#ffb02e'); g.addColorStop(.18,'#ff5a1a'); g.addColorStop(.5,'#b3121c'); g.addColorStop(1,'#1a0306');
  x.fillStyle=g; x.fillRect(0,0,w,h);
  // 放射光芒（慢慢旋轉）
  x.save(); x.translate(cx,cy); x.rotate(T*0.06);
  for(let i=0;i<28;i++){const a=i/28*Math.PI*2; x.fillStyle=i%2?'rgba(255,236,170,.10)':'rgba(120,0,0,.12)';
    x.beginPath(); x.moveTo(0,0); x.arc(0,0,R,a,a+Math.PI*2/28); x.closePath(); x.fill();}
  x.restore();
  // 速度線（往左下飛）
  if(!HB.lines.length) for(let i=0;i<70;i++) HB.lines.push({y:Math.random(), s:0.5+Math.random()*1.6, l:60+Math.random()*220, o:Math.random()});
  x.lineCap='round';
  HB.lines.forEach(L=>{const p=((L.o+T*L.s*0.35)%1), X=w*(1.15-p*1.4), Y=h*L.y+p*h*0.25;
    x.strokeStyle=`rgba(255,250,230,${0.08+0.22*(1-Math.abs(L.y-0.45))})`; x.lineWidth=L.s*1.4;
    x.beginPath(); x.moveTo(X,Y); x.lineTo(X+L.l,Y-L.l*0.18); x.stroke();});
  // 燃燒的棒球：右上往左下衝，後面拖著火焰
  const bx=w*0.80+Math.sin(T*1.7)*8, by=h*0.30+Math.cos(T*2.1)*6, br=Math.min(w,h)*0.075;
  x.save(); x.globalCompositeOperation='lighter';   // 火焰尾巴：疊加發光
  for(let i=26;i>=0;i--){const k=i/26, fx=bx+k*br*7.5, fy=by-k*br*2.2+Math.sin(T*9+i)*br*0.12*k, fr=br*(1-k*0.75)*(1+0.08*Math.sin(T*13+i*1.7));
    const fg=x.createRadialGradient(fx,fy,0,fx,fy,fr*1.5); fg.addColorStop(0,`rgba(255,${Math.round(230-k*150)},${Math.round(120-k*120)},${0.85*(1-k*0.8)})`); fg.addColorStop(1,'rgba(255,60,0,0)');
    x.fillStyle=fg; x.beginPath(); x.arc(fx,fy,fr*1.5,0,7); x.fill();}
  x.restore();
  const bg=x.createRadialGradient(bx-br*.35,by-br*.35,br*.1,bx,by,br); bg.addColorStop(0,'#ffffff'); bg.addColorStop(1,'#e6dccb');
  x.fillStyle=bg; x.beginPath(); x.arc(bx,by,br,0,7); x.fill();
  x.save(); x.translate(bx,by); x.rotate(-T*6); x.strokeStyle='#d2232a'; x.lineWidth=br*0.07;
  x.beginPath(); x.arc(-br*1.25,0,br*0.85,-0.85,0.85); x.stroke();          // 兩條縫線
  x.beginPath(); x.arc(br*1.25,0,br*0.85,Math.PI-0.85,Math.PI+0.85); x.stroke();
  x.restore();
  // 火花往上飄
  if(HB.embers.length<90&&!reduceMotion) HB.embers.push({x:Math.random()*w, y:h+10, v:30+Math.random()*90, r:1+Math.random()*2.5, ph:Math.random()*6, born:T});
  HB.embers=HB.embers.filter(E=>{const age=T-E.born, y=E.y-age*E.v; if(y<-20)return false;
    x.fillStyle=`rgba(255,${180+Math.round(60*Math.sin(T*8+E.ph))},80,${0.35+0.4*Math.sin(T*6+E.ph)**2})`;
    x.beginPath(); x.arc(E.x+Math.sin(age*2+E.ph)*12,y,E.r,0,7); x.fill(); return true;});
  // 底部：球場燈架與看台剪影
  x.fillStyle='rgba(20,0,4,.88)';
  x.beginPath(); x.moveTo(0,h); for(let i=0;i<=40;i++){const X=i/40*w; x.lineTo(X,h*0.86-Math.sin(i*0.9)*6-(i%7===0?18:0));} x.lineTo(w,h); x.closePath(); x.fill();
  [0.1,0.3,0.7,0.9].forEach(px=>{const X=w*px, top=h*0.66; x.fillRect(X-2,top,4,h*0.22); x.fillRect(X-22,top-14,44,14);
    x.fillStyle='rgba(255,246,210,.9)'; for(let j=0;j<4;j++)x.fillRect(X-19+j*10,top-11,7,8); x.fillStyle='rgba(20,0,4,.88)';});
  if(!$('#home').hidden&&!reduceMotion) HB.raf=requestAnimationFrame(bgFrame); else HB.raf=0;
}

/* ---------- 啟動 ---------- */
if(me()) applySettings();
showHome();
// 換玩家登入時頁面重新整理過，把登入訊息補顯示出來
try{const m=sessionStorage.getItem('baseball-toast'); sessionStorage.removeItem('baseball-toast'); if(m) toast(m);}catch(e){}
