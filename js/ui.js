// ui.js — 遊戲流程、輸入處理、HTML 疊加介面（記分條、名牌、球種菱形）、主迴圈
// 依賴：engine.js、render.js
'use strict';
// LEAGUE 由 db.js 從 SQLite 球員資料庫建立
const teamOf=id=>LEAGUE.teams.find(t=>t.id===id);
const UI={phase:'setup', pci:{x:0,y:2.55}, aim:{x:0,y:2.55}, aimSet:false, marks:[], logs:[], chosen:0, m:{pos:0,power:0}, bb:null};
const humanBat=()=>G&&G.half===G.human;
const humanPit=()=>G&&(1-G.half)===G.human;
const SLOT=[1,2,3,4]; // 第 i 個球種放在菱形的第幾格：1左 2下 3右 4上
const hand=p=>p.throws==='R'?'右投':'左投';

/* ---------- 選隊畫面 ---------- */
let pick={me:LEAGUE.teams[0].id, op:LEAGUE.teams[1].id, side:1, sp:null};
function renderSetup(){
  const tb=(t,sel,dis)=>`<button class="tbtn${sel?' sel':''}" data-id="${t.id}" ${dis?'disabled':''}><b><i style="background:${t.color}"></i>${t.name}<em class="lv">Lv${teamLevel(LEAGUE,t)}</em></b><span>${t.note}</span></button>`;
  $('#myTeams').innerHTML=LEAGUE.teams.map(t=>tb(t,t.id===pick.me)).join('');
  $('#opTeams').innerHTML=LEAGUE.teams.map(t=>tb(t,t.id===pick.op,t.id===pick.me)).join('');
  renderTiers();
  $('#side').querySelectorAll('button').forEach(b=>b.classList.toggle('sel',+b.dataset.v===pick.side));
  const my=teamOf(pick.me); if(!my.rotation.includes(pick.sp)) pick.sp=nextStarter(my);
  $('#mySP').innerHTML=my.rotation.map((id,i)=>{const p=LEAGUE.players[id];
    return `<button class="spbtn${id===pick.sp?' sel':''}" data-id="${id}"><b>${p.name}</b><span>輪值 ${i+1} · ${hand(p)} · 總評 ${p.ovr}</span></button>`;}).join('');
}
// 電腦難度：普通～神話，積分不夠的鎖住（home.js 的 tierOpen、curTier；還沒登入時只顯示普通）
function renderTiers(){
  const logged=typeof me==='function'&&me(), pf=logged?me():{pts:0}, cur=logged?curTier():0;
  const open=i=>logged?tierOpen(i):i===0, myLv=teamLevel(LEAGUE,teamOf(pick.me));
  $('#aiTier').innerHTML=AI_TIERS.map((t,i)=>`<button class="tierbtn${i===cur?' sel':''}" data-i="${i}" style="--c:${t.color}" ${open(i)?'':'disabled'}>
    <b>${open(i)?'':'🔒 '}${t.name}</b><span>對手 Lv ${t.lv}</span><em>${open(i)?`勝 +${tierPoints(i,'win',myLv,t.lv)}`:`積分 ${t.unlock}`}</em></button>`).join('');
  const T=AI_TIERS[cur], k=tierMult(myLv,T.lv), next=AI_TIERS.find((_,i)=>!open(i));
  $('#aiInfo').innerHTML=`你的球隊 <b>Lv ${myLv}</b>（戰力 ${teamPower(LEAGUE,teamOf(pick.me)).toFixed(1)}）・電腦對手調整成 <b>Lv ${T.lv}</b>（${T.name}難度）<br>
    贏球積分 ${T.win} × 等級差 ${k.toFixed(1)} ＝ <b>${tierPoints(cur,'win',myLv,T.lv)}</b>，和局一半，輸球 0。目前積分 <b>${(pf.pts||0).toLocaleString()}</b>`+
    (next?`，再 ${next.unlock-(pf.pts||0)} 分開啟${next.name}。`:'，全部難度已開啟。')+`<br><small>對手比你強，每高 1 級積分多 10%（最多 2 倍）；比你弱，每低 1 級少 10%（最少一半）。</small>`;
}
$('#aiTier').onclick=e=>{const b=e.target.closest('.tierbtn'); if(!b||b.disabled||typeof setTier!=='function')return; setTier(+b.dataset.i); renderTiers();};
$('#myTeams').onclick=e=>{const b=e.target.closest('.tbtn');if(!b)return;pick.me=b.dataset.id;if(pick.op===pick.me)pick.op=LEAGUE.teams.find(t=>t.id!==pick.me).id;renderSetup();};
$('#opTeams').onclick=e=>{const b=e.target.closest('.tbtn');if(!b||b.disabled)return;pick.op=b.dataset.id;renderSetup();};
$('#side').onclick=e=>{const b=e.target.closest('button');if(!b)return;pick.side=+b.dataset.v;renderSetup();};
$('#mySP').onclick=e=>{const b=e.target.closest('.spbtn');if(!b)return;pick.sp=b.dataset.id;renderSetup();};
$('#start').onclick=startGame;
$('#quit').onclick=()=>{
  if(netOn()&&!G.over){ if(confirm('離開連線對戰會判你輸，確定離開？')) netForfeit(); return; }   // online.js
  const season=G&&G.season; $('#subs').hidden=true; UI.wantSub=false; if(typeof playMusic==='function')playMusic('title'); G=null;UI.phase='setup';UI.defense=null;UI.intro=null;$('#field').classList.remove('in-intro');$('#intro').hidden=true;$('#skip').hidden=true;
  // 聯賽中途離開：這場不算，之後可以重打
  if(season&&typeof openLeague==='function'){showHome(); openLeague();} else $('#setup').hidden=false;};
$('#rosterBtn').onclick=()=>{renderRoster(teamOf(pick.me)); $('#roster').hidden=false;};
$('#dbBtn').onclick=()=>openDBV();
$('#roster').onclick=e=>{
  if(e.target.id==='roster'||e.target.closest('#rosterClose'))return $('#roster').hidden=true;
  const row=e.target.closest('tr[data-id]'); if(row)return openCard(row.dataset.id);
  const farm=e.target.closest('#rosterFarm'); if(farm)openDBV({team:farm.dataset.team, level:'2'});
};
renderSetup();

// 球隊名單：野手（先發打序 + 替補）與投手（輪值、牛棚、終結）
function renderRoster(t){
  const P=id=>LEAGUE.players[id], n=v=>`<td>${v}</td>`;
  const posTxt=p=>POS_NAME[p.pos]+(p.alt.length?`<small>（${p.alt.map(x=>POS_NAME[x]).join('、')}）</small>`:'');
  const hrow=(p,tag)=>`<tr data-id="${p.id}"><td>${tag}</td>${n(p.num)}<td>${p.name}</td><td>${posTxt(p)}</td>${n(p.bats==='R'?'右':'左')}${n(p.age)}<td><b>${p.ovr}</b></td>${n(p.pow)}${n(p.con)}${n(p.eye)}${n(p.spd)}${n(p.fld)}${n(p.arm)}</tr>`;
  const prow=(p,tag)=>`<tr data-id="${p.id}"><td>${tag}</td>${n(p.num)}<td>${p.name}</td>${n(p.throws==='R'?'右':'左')}${n(p.age)}<td><b>${p.ovr}</b></td>${n(p.velo)}${n(p.ctrl)}${n(p.stam)}<td class="pl">${p.pitches.map(x=>`${SHORT[x.n]} ${x.r}`).join('、')}</td></tr>`;
  $('#rosterBody').innerHTML=`<h1><i class="dot" style="background:${t.color}"></i>${t.name}<small>Lv ${teamLevel(LEAGUE,t)}・戰力 ${teamPower(LEAGUE,t).toFixed(1)} · ${t.roster.length} 人 · 主場 ${t.park}</small></h1>
    <h2>野手</h2><div class="tw"><table class="box rt"><tr><th>打序</th><th>背號</th><th>姓名</th><th>本職（可兼守）</th><th>打</th><th>年齡</th><th>總評</th><th>力量</th><th>技巧</th><th>選球</th><th>速度</th><th>接球</th><th>臂力</th></tr>
    ${t.lineup.map((x,i)=>hrow(P(x.id),`${i+1} ${x.pos}`)).join('')}${t.bench.map(id=>hrow(P(id),'替補')).join('')}</table></div>
    <h2>投手</h2><div class="tw"><table class="box rt"><tr><th>角色</th><th>背號</th><th>姓名</th><th>投</th><th>年齡</th><th>總評</th><th>球速</th><th>控球</th><th>體力</th><th>球種</th></tr>
    ${t.rotation.map((id,i)=>prow(P(id),`輪值 ${i+1}`)).join('')}${t.bullpen.map(id=>prow(P(id),'中繼')).join('')}${t.closer?prow(P(t.closer),'終結'):''}</table></div>
    <p class="lead">點任一列可以看球員卡。二軍另有 ${t.farm.length} 人，聯盟還有 ${LEAGUE.freeAgents.length} 名自由球員。</p>
    <button class="ghost" id="rosterFarm" data-team="${t.id}">查看二軍球員卡</button>
    <button class="go" id="rosterClose">關閉</button>`;
}

// 單人對戰（友誼賽）：電腦對手調到選定難度的等級，成績不列入聯賽
function startGame(){
  const awayId=pick.side===0?pick.me:pick.op, homeId=pick.side===0?pick.op:pick.me;
  const opp=teamOf(pick.op), oppSP=opp.rotation[Math.floor(rnd()*opp.rotation.length)];
  startMatch({awayId, homeId, side:pick.side, sp:{[pick.me]:pick.sp, [pick.op]:oppSP}});
}
// o={awayId, homeId, side(玩家是 0 客／1 主), sp:{球隊id:先發投手id}, season:聯賽的這一場（home.js 的 playSeasonGame）}
function startMatch(o){
  const myId=o.side===0?o.awayId:o.homeId;
  newGame(gameTeam(LEAGUE,o.awayId,o.sp[o.awayId]), gameTeam(LEAGUE,o.homeId,o.sp[o.homeId]), o.side);
  // 只調整這場比賽的複製資料：友誼賽調到難度等級；聯賽季賽比你低 2 級、季後賽和你同級（對手本來就比較弱就不動）
  const human=G.teams[o.side], ai=G.teams[1-o.side];
  human.lv=gameTeamLevel(human);
  G.tier=o.season?0:typeof curTier==='function'?curTier():0;
  G.season=o.season||null;
  const aiLv=gameTeamLevel(ai), target=o.season?Math.max(1,Math.min(aiLv,human.lv)-(o.season.kind==='reg'?2:0)):AI_TIERS[G.tier].lv;
  const sc=o.season&&target>=aiLv?{before:aiLv, after:aiLv}:scaleGameTeam(ai,target); ai.lv=sc.after; ai.baseLv=sc.before;
  const my=teamOf(myId), mySP=o.sp[myId]; if(my.rotation.includes(mySP)) my.rotIdx=(my.rotation.indexOf(mySP)+1)%my.rotation.length; // 下一場預設輪到下一位
  pick.sp=null;
  saveLeague();
  UI.logs=[]; UI.marks=[]; UI.bb=null; UI.defense=null; UI.last=null; UI.lastMark=null; UI.wantSim=false; UI.newPA=true;
  $('#setup').hidden=true; $('#over').hidden=true; if(document.activeElement)document.activeElement.blur();
  log(`比賽開始：${G.teams[0].name} 對 ${G.teams[1].name}（${G.teams[1].park}）`);
  log(o.season?`<em>聯賽</em>${o.season.label}：你的球隊 Lv ${human.lv}・${ai.short} Lv ${ai.lv}${ai.lv!==ai.baseLv?`（原本 Lv ${ai.baseLv}）`:''}`
    :`<em>Lv</em>${AI_TIERS[G.tier].name}難度：你的球隊 Lv ${human.lv}・電腦對手 ${ai.short} 調整為 Lv ${ai.lv}（原本 Lv ${ai.baseLv}）`);
  if(typeof playMusic==='function') playMusic('game');
  // 設定裡可以關掉開場過場
  if(typeof SETTINGS!=='undefined'&&SETTINGS().intro===false){G.teams[1].pitchers[0].introduced=true; UI.phase='wait'; nextPitch();}
  else startIntro();
}

/* ---------- 開場過場：空拍 → 先發投手卡 → 守備陣容 ---------- */
function startIntro(){
  const [away,home]=G.teams, hp=home.pitchers[0], ap=away.pitchers[0];
  hp.introduced=true;
  const title=`<div class="it"><small>${home.park}</small><h1><span style="--c:${away.color}">${away.name}</span><em>VS</em><span style="--c:${home.color}">${home.name}</span></h1>
    <p>本場先發　${ap.name}（${away.short}）　對　${hp.name}（${home.short}）</p></div>`;
  UI.intro={i:0, at:performance.now(), steps:[
    {view:'aerial', dur:4800, html:title},
    {view:'field',  dur:4200, html:pitcherCard(hp,home,'先發投手')},
    {view:'lineup', dur:5400, html:lineupPanel(home)},
  ]};
  UI.phase='intro'; $('#field').classList.add('in-intro'); $('#skip').hidden=false;
  showIntroStep(); renderAll();
}
function showIntroStep(){ const el=$('#intro'); el.innerHTML=UI.intro.steps[UI.intro.i].html; el.hidden=false; el.classList.remove('in'); void el.offsetWidth; el.classList.add('in'); }
function advanceIntro(){
  if(!UI.intro)return;
  UI.intro.i++; UI.intro.at=performance.now();
  if(UI.intro.i<UI.intro.steps.length) return showIntroStep();
  endIntro();
}
function endIntro(){
  UI.intro=null; $('#intro').hidden=true; $('#skip').hidden=true; $('#field').classList.remove('in-intro');
  UI.phase='wait'; nextPitch();
}
$('#skip').onclick=e=>{e.stopPropagation(); if(UI.phase==='intro')endIntro();};

function pitcherCard(p,t,label){
  return `<div class="pcx-card"><div class="pcx-hd">${label}</div>
    <div class="pcx-top"><img src="${avatar(p,t)}" alt=""><div><div class="pcx-no"><b>${p.num}</b>${hand(p)}・${p.role}</div>
      <div class="pcx-nm">${p.name}</div><div class="pcx-tm"><i style="background:${t.color}"></i>${t.name}</div></div></div>
    <div class="pcx-st"><span><i>最快</i>${topMph(p.velo)}<small>mph</small></span><span><i>控球</i>${p.ctrl}</span><span><i>體力</i>${p.stam}</span><span><i>總評</i>${p.ovr}</span></div>
    <div class="pcx-pt">${p.pitches.map(x=>`<span>${x.n}<em><i style="width:${abilPct(x.r)}%"></i></em></span>`).join('')}</div></div>`;
}
// 守備陣容：9 個人照守備位置排成菱形
const DL_POS={CF:[50,6],LF:[17,20],RF:[83,20],SS:[33,40],'2B':[67,40],P:[50,55],'3B':[17,62],'1B':[83,62],C:[50,80]};
function lineupPanel(t){
  const ps=t.lineup.filter(b=>b.pos!=='DH').map(b=>({pl:b,pos:b.pos})).concat([{pl:t.pitchers[t.pIdx],pos:'P'}]);
  return `<div class="dl"><div class="dl-hd">守備陣容<b>${t.name}</b></div><div class="dl-f">${ps.map(({pl,pos})=>{const [x,y]=DL_POS[pos];
    return `<div class="dl-c" style="left:${x}%;top:${y}%"><img src="${avatar(pl,t)}" alt=""><div><b>${pl.name}</b><span>${pos==='P'?'投手':POS_NAME[pos]}</span></div></div>`;}).join('')}</div></div>`;
}
let pcxTimer=null, ibarTimer=null;
function showPitcherCard(p,t,label){
  const el=$('#pcx'); el.innerHTML=pitcherCard(p,t,label); el.classList.add('show');
  clearTimeout(pcxTimer); pcxTimer=setTimeout(()=>el.classList.remove('show'),3400);
}
// 打者上場介紹條（仿轉播下方字幕）
function showBatterBar(){
  const b=curBatter(), t=batTeam(), st=b.st, el=$('#ibar');
  el.innerHTML=`<div class="ib-l" style="background:${t.color}">${t.short}</div>
    <div class="ib-m"><div class="ib-top"><span class="ib-no">${b.num}</span><b>${b.name}</b>${b.sub==='ph'&&!st.pa?'<span class="ib-sub">代打</span>':''}<span class="ib-pos">${POS_NAME[b.pos]}・${b.bats==='R'?'右打':'左打'}</span></div>
    <div class="ib-st"><span><i>打序</i>${t.bIdx+1}</span><span><i>今日</i>${st.h}-${st.ab}</span><span><i>全壘打</i>${st.hr}</span><span><i>打點</i>${st.rbi}</span>
      <span><i>力量</i>${b.pow}</span><span><i>技巧</i>${b.con}</span><span><i>速度</i>${b.spd}</span><span><i>總評</i>${b.ovr}</span></div></div>
    <img src="${avatar(b,t)}" alt="">`;
  el.classList.add('show'); $('#field').classList.add('ibar-on');
  clearTimeout(ibarTimer); ibarTimer=setTimeout(()=>{el.classList.remove('show'); $('#field').classList.remove('ibar-on');},2700);
}

/* ---------- 流程 ---------- */
/* 連線對戰（online.js 的 NET）：房主的遊戲負責判定每一球，算完把比賽狀態傳給對手；
   雙方只送出自己的操作（投手：投出的球；打者：揮棒時機）。對手的操作放在 NET.inbox，輪到時才處理。 */
const netOn=()=>typeof NET!=='undefined'&&NET.active&&!!G&&!!G.online;
// 房主傳來的比賽狀態（副本）：換成這一份，再把「我是哪一隊」設回來
function netApply(s){ G=s; G.human=NET.side; }
function nextPitch(){
  if(!G) return;
  UI.defense=null;
  if(netOn()) netBetweenPitches();       // 對手換投、房主傳來的新狀態，在兩球之間處理
  if(G.over) return showOver();
  if(!netOn()){
    if(UI.wantSim){const w=UI.wantSim; UI.wantSim=false; if(w.h===G.half&&w.i===G.inning){UI.phase='choose'; return simHalf();}}
    if(UI.wantSub){UI.wantSub=false; return openSubs();}
  }
  let wait=0;
  if(!humanPit()&&!netOn()){const np=aiBullpen(); if(np){log(`${fldTeam().short}更換投手：${np.name}（${np.role}）`); np.introduced=true; showPitcherCard(np,fldTeam(),'換投'); wait=1600;}}
  const cp=curPitcher();
  if(!cp.introduced){cp.introduced=true; showPitcherCard(cp,fldTeam(),cp.role==='先發'?'先發投手':'換投'); wait=1600;}
  if(UI.newPA){UI.newPA=false;
    if(!netOn()){const ms=aiSubs(); ms.forEach(m=>log(m)); if(ms.length){banner(ms[ms.length-1],'',1800); wait=Math.max(wait,1800);}}
    showBatterBar(); wait=Math.max(wait,1300);}
  UI.swing=null; UI.aiSw=null; UI.pitch=null; UI.batAt=0; UI.hint=null;
  if(humanPit()){ UI.phase='choose'; if(UI.chosen>=curPitcher().pitches.length)UI.chosen=0; }
  else if(netOn()){ UI.phase='remote'; UI.remoteWait=wait; netTryLaunch(); }   // 等對手投球
  else {
    const p=curPitcher(), b=curBatter(); const c=aiChoosePitch(p,b);
    const P=makePitch(p,c.idx,c.target,c.power,0);
    UI.hint= rnd()<0.12+b.eye/99*0.55 ? P.name : null;
    launch(P,null,1100+wait);
  }
  renderAll();
}
function launch(P,aiSw,delay){
  const now=performance.now();
  UI.pitch=P; UI.aiSw=aiSw; UI.windAt=now+delay-560; UI.release=now+delay; UI.phase='flight';
  if(aiSw&&aiSw.type!=='none'){UI.batAt=UI.release+P.travel+aiSw.te; UI.batType=aiSw.type;}
  renderOverlay();
}
function finishPitch(){
  const P=UI.pitch, b=curBatter();
  if(netOn()){
    UI.phase='await'; UI.awaitP=P;
    if(NET.role==='host'){ if(humanBat()) return netResolve(P,UI.swing||{type:'none'}); return netTryResolve(); }   // 對手打擊：等他的揮棒
    if(humanBat()) NET.send('swing',{sw:UI.swing||{type:'none'}, pn:G.pn});
    return netTryResult();                                                    // 等房主算出結果
  }
  const sw=humanBat()?(UI.swing||{type:'none'}):UI.aiSw;
  showResult(P,b,processPitch(P,sw));
}
// 房主：算出這一球的結果，連同比賽狀態傳給對手
function netResolve(P,sw){
  const b=curBatter(), o=processPitch(P,sw);
  G.pn=(G.pn||0)+1; NET.send('result',{o, G, pn:G.pn});
  showResult(P,b,o);
}
// 房主：自己的球飛完、對手的揮棒也到了，才判定
function netTryResolve(){
  const s=NET.inbox.swing;
  if(UI.phase!=='await'||!s||s.pn!==(G.pn||0)) return;
  NET.inbox.swing=null; netResolve(UI.awaitP,s.sw);
}
// 對手：自己的球飛完、房主的結果也到了，才顯示
function netTryResult(){
  const r=NET.inbox.result;
  if(UI.phase!=='await'||!r||r.pn!==(G.pn||0)+1) return;
  NET.inbox.result=null; const b=curBatter(); netApply(r.G); showResult(UI.awaitP,b,r.o);
}
// 輪到我打擊：對手投的球到了就開始飛
function netTryLaunch(){
  const m=NET.inbox.pitch;
  if(UI.phase!=='remote'||!m||m.pn!==(G.pn||0)) return;
  NET.inbox.pitch=null; const b=curBatter();
  UI.hint=Math.random()<0.12+b.eye/99*0.55?m.P.name:null;
  launch(m.P,null,Math.max(700,UI.remoteWait||0));
}
function showResult(P,b,o){
  const tag=`${G.half?'▼':'▲'}${G.inning}`;
  UI.marks.push({x:P.x,y:P.y,k:o.kind});
  UI.last=P; UI.lastMark={x:P.x,y:P.y,mph:P.mph,name:P.name,vaa:P.vaa,at:performance.now()};
  let msg=o.text; if(o.runs) msg+=`，得 ${o.runs} 分`;
  let cls='';
  if(o.kind==='inplay'){UI.bb=o.bb; cls=o.bb.hit==='HR'?'hr':(o.bb.hit||o.bb.error)?'hit':'out'; if(o.bb.hit==='HR'&&typeof playJingle==='function')playJingle('hr');}
  else if(o.kind==='k')cls='k'; else if(o.kind==='bb'||o.kind==='hbp')cls='hit';
  if(o.kind!=='inplay')banner(msg,cls,o.done?2000:900);
  if(o.done) log(`<em>${tag}</em>${b.name}：${msg}`);
  if(o.kind==='inplay'){
    // 內野滾地球要演完傳一壘，時間拉長，結果文字等球傳到後才出現
    const infield=o.bb.type==='GB'&&o.bb.pos&&!AREA[o.bb.pos];
    const start=performance.now(), duration=o.bb.hit==='HR'?4300:infield?3600:o.bb.type==='GB'?3000:3600;
    const bannerAt=infield?Math.max(infieldTimes(o.bb).catch1,infieldTimes(o.bb).runner)+.04:.72;
    UI.defense={bb:o.bb,start,duration,msg,cls,shown:false,batter:b,bannerAt};
    UI.phase='defense'; UI.nextAt=start+duration;
  } else {
    UI.phase='result'; UI.nextAt=performance.now()+(o.done?1400:950);
  }
  UI.after=()=>{
    if(o.done){
      const e=endPA(); UI.marks=[]; UI.newPA=true;
      if(G.over){renderAll(); return showOver(e);}
      if(e==='switch'){
        const t=`三出局，攻守交換：${G.inning} 局${G.half?'下':'上'}`;
        log(`<em>—</em>${t}`); banner(t,'',1500); UI.bb=null; UI.pitch=null; UI.lastMark=null;
        UI.phase='result'; UI.nextAt=performance.now()+1600; UI.after=nextPitch; renderAll(); return;
      }
    }
    nextPitch();
  };
  renderAll();
}
function doSwing(type){
  const now=performance.now();
  if(UI.phase!=='flight'||!humanBat()||UI.swing||now<UI.release) return;
  UI.swing={type,x:UI.pci.x,y:UI.pci.y,te:(now-UI.release)-UI.pitch.travel}; UI.batAt=now; UI.batType=type;
  renderOverlay();
}
function meterPress(){
  const now=performance.now();
  if(!humanPit())return;
  if(UI.phase==='ready'){UI.phase='power'; UI.m={t0:now,pos:0,power:0}; renderOverlay(); return;}
  if(UI.phase==='power'){UI.m.power=Math.max(UI.m.pos,5); UI.m.t1=now; UI.phase='acc'; renderOverlay(); return;}
  if(UI.phase==='acc'){throwPitch(); return;}
}
function accHalf(p){return (3+p.ctrl*0.07)*fatigue(p);}
// 準度偏移有方向：指針還沒回到綠色區就按（太早）→ 球偏高、偏投手臂側；超過才按（太晚）→ 球偏低、偏手套側
function throwPitch(){
  const p=curPitcher(), b=curBatter(), u=UI.m.pos, a=Math.abs(u), h=accHalf(p);
  const mag = a<=h ? a/h*0.16 : 0.16+(a-h)*0.035;
  const arm=p.throws==='R'?-1:1, early=u>0;
  const ang=(early?Math.atan2(1,arm*0.55):Math.atan2(-1,-arm*0.55))+(rnd()-0.5)*0.9;
  const P=makePitch(p,UI.chosen,UI.aim,Math.max(0.3,UI.m.power/100),{dx:Math.cos(ang)*mag, dy:Math.sin(ang)*mag});
  P.meter = a<=h*0.35?'完美出手':a<=h?'準度良好':early?'出手太早・球偏高':'出手太晚・球偏低';
  P.meterBad = a>h;
  if(netOn()){ NET.send('pitch',{P, pn:G.pn||0}); launch(P,null,420); return; }   // 連線：對手打擊
  launch(P,aiSwing(b,p,P),420);
}
function simHalf(){
  if(!G||G.over||UI.phase==='intro')return;
  if(!(UI.phase==='choose'||UI.phase==='aim'||UI.phase==='ready'||(UI.phase==='flight'&&performance.now()<UI.release))){UI.wantSim={h:G.half,i:G.inning}; banner('這個打席結束後自動模擬','',1200); return;}
  const h=G.half, inn=G.inning; UI.marks=[]; let guard=0, fresh=true;
  while(!G.over&&G.half===h&&G.inning===inn&&guard++<400){
    const np=aiBullpen(); if(np) log(`${fldTeam().short}更換投手：${np.name}（${np.role}）`);
    if(fresh){fresh=false; aiSubs().forEach(m=>log(m));}
    const p=curPitcher(), b=curBatter(); const c=aiChoosePitch(p,b);
    const P=makePitch(p,c.idx,c.target,c.power,0); const o=processPitch(P,aiSwing(b,p,P));
    if(o.kind==='inplay')UI.bb=o.bb;
    if(o.done){log(`<em>${G.half?'▼':'▲'}${G.inning}</em>${b.name}：${o.text}${o.runs?`，得 ${o.runs} 分`:''}`); const e=endPA(); fresh=true; if(e==='switch')log(`<em>—</em>三出局，攻守交換：${G.inning} 局${G.half?'下':'上'}`);}
  }
  UI.pitch=null; UI.defense=null; UI.lastMark=null; UI.newPA=true; UI.phase='result'; UI.nextAt=performance.now()+300; UI.after=nextPitch; renderAll();
}
$('#simb').onclick=simHalf;
// 視角切換：自動（自己投球時用投手視角）→ 捕手視角 → 投手視角；記在這個瀏覽器
const CAM_MODES={auto:'自動', catcher:'捕手', pitcher:'投手'};
try{UI.camMode=localStorage.getItem('camMode')||'auto';}catch(e){UI.camMode='auto';}
if(!CAM_MODES[UI.camMode])UI.camMode='auto';
function cycleCam(){const k=Object.keys(CAM_MODES); UI.camMode=k[(k.indexOf(UI.camMode)+1)%k.length];
  if(typeof onCamChange==='function')onCamChange(UI.camMode);
  try{localStorage.setItem('camMode',UI.camMode);}catch(e){} $('#camBtn').textContent=`視角：${CAM_MODES[UI.camMode]}`;}
$('#camBtn').textContent=`視角：${CAM_MODES[UI.camMode]}`;
$('#camBtn').onclick=e=>{cycleCam(); e.currentTarget.blur();};
// 下方能力卡點一下打開球員卡
// 連線對戰時對手的球員不在自己的聯盟裡（編號可能撞到別人），不開球員卡
$('#pcard').onclick=()=>{if(G&&!netOn())openCard(curPitcher().id);};
$('#bcard').onclick=()=>{if(G&&!netOn())openCard(curBatter().id);};
$('#swn').onclick=()=>doSwing('normal'); $('#swp').onclick=()=>doSwing('power');
$('#chg').onclick=()=>{ if(!G||!humanPit())return; const b=$('#bull'); b.hidden=!b.hidden; };
$('#bull').onclick=e=>{const btn=e.target.closest('button[data-p]'); if(!btn||!['choose','aim','ready'].includes(UI.phase))return; const t=fldTeam(), i=+btn.dataset.p;
  $('#bull').hidden=true;
  if(netOn()&&NET.role==='guest'){ NET.send('change',{i}); UI.phase='wait'; banner('換投中…','',1200); renderAll(); return; }   // 由房主換好再傳回來
  if(netOn()) return netHostChange(i);
  changePitcher(t,i); log(`${t.short}更換投手：${t.pitchers[i].name}（${t.pitchers[i].role}）`); UI.chosen=0;
  t.pitchers[i].introduced=true; showPitcherCard(t.pitchers[i],t,'換投'); UI.phase='choose'; renderAll();};
// 連線：房主換投（自己換、或對手要求換），換好把比賽狀態傳過去
function netHostChange(i){
  const t=fldTeam(), p=t.pitchers[i]; if(!p||p.used) return;
  changePitcher(t,i); p.introduced=true;
  const msg=`${t.short}更換投手：${p.name}（${p.role}）`; log(msg); showPitcherCard(p,t,'換投');
  if(humanPit()){UI.chosen=0; UI.phase='choose';}
  NET.send('state',{G, msg, card:i}); renderAll();
}
// 兩球之間：房主處理對手的換投要求；對手套用房主傳來的新狀態
function netBetweenPitches(){
  if(NET.role==='host'&&NET.inbox.change!=null){const i=NET.inbox.change; NET.inbox.change=null; netHostChange(i);}
  if(NET.role==='guest'&&NET.inbox.state){const s=NET.inbox.state; NET.inbox.state=null; netApply(s.G);
    if(s.msg){log(s.msg); const t=fldTeam(), p=t.pitchers[s.card]; if(p) showPitcherCard(p,t,'換投');}
    if(humanPit()&&UI.phase==='wait'){UI.chosen=0; UI.phase='choose';}
    renderAll();}
}

/* ---------- 換人：進攻時代打、代跑；守備時換守備、對調守位 ----------
   只能在兩球之間換：自己投球時是選球種到出手前；打擊時是對方投手開始投球前，來不及就排到這球結束後。 */
function subOpenNow(){
  if(humanPit()) return ['choose','aim','ready'].includes(UI.phase);
  return UI.phase==='flight'&&!UI.swing&&performance.now()<UI.windAt;
}
$('#subBtn').onclick=e=>{ e.currentTarget.blur();
  if(!G||G.over||UI.phase==='intro'||UI.phase==='subs')return;
  if(subOpenNow()){UI.pitch=null; UI.aiSw=null; openSubs();}   // 還沒投出的這一球取消，關掉視窗後重投
  else {UI.wantSub=true; banner('這球結束後換人','',1200);}
};
function openSubs(){ UI.phase='subs'; UI.sub={t:null}; $('#bull').hidden=true; renderSubs(); $('#subs').hidden=false; renderOverlay(); }
function closeSubs(){ $('#subs').hidden=true; UI.phase='wait'; nextPitch(); }
function subTargets(){
  const t=G.teams[G.human];
  if(humanBat()){
    const ts=[{kind:'ph', slot:t.bIdx, tag:'代打'}];
    G.bases.forEach((r,i)=>{if(r)ts.push({kind:'pr', slot:t.lineup.indexOf(r), tag:`代跑・${'一二三'[i]}壘`});});
    return ts;
  }
  return t.lineup.map((b,slot)=>({kind:'def', slot, tag:b.pos==='DH'?'換指定打擊':'換守備'}));
}
function renderSubs(){
  const t=G.teams[G.human], ts=subTargets(), sel=ts[UI.sub.t], p=fldTeam().pitchers[fldTeam().pIdx];
  const posOk=(b,pos)=>pos==='DH'||b.natPos===pos?'':b.alt.includes(pos)?'<em class="sb-warn">兼守</em>':'<em class="sb-bad">非本職</em>';
  const who=b=>`${b.name}<small>${POS_NAME[b.natPos]}・${b.bats==='R'?'右打':'左打'}・總評 ${b.ovr}</small>`;
  const tgt=ts.map((x,i)=>{const b=t.lineup[x.slot];
    return `<button class="spbtn${i===UI.sub.t?' sel':''}" data-t="${i}"><b>${x.tag}　${x.slot+1} 棒 ${b.name}${posOk(b,b.pos)}</b>
      <span>守${POS_NAME[b.pos]}・力量 ${b.pow}・技巧 ${b.con}・速度 ${b.spd}・接球 ${b.fld}</span></button>`;}).join('');
  let opts='<p class="lead">先在左邊選要換下的人。</p>';
  if(sel){
    const cur=t.lineup[sel.slot], pos=cur.pos;
    const line=c=>sel.kind==='ph'?`打擊值 ${batVal(c,p).toFixed(0)}（${cur.name} ${batVal(cur,p).toFixed(0)}）・力量 ${c.pow}・技巧 ${c.con}・選球 ${c.eye}`
      :sel.kind==='pr'?`速度 <b>${c.spd}</b>（${cur.name} ${cur.spd}）`
      :`守${POS_NAME[pos]}${posOk(c,pos)}・接球 ${c.fld}・傳球 ${c.thr}・臂力 ${c.arm}・力量 ${c.pow}・技巧 ${c.con}`;
    opts=t.bench.length?t.bench.map((c,i)=>`<button class="spbtn" data-b="${i}"><b>${who(c)}</b><span>${line(c)}</span></button>`).join('')
      :'<p class="lead">沒有替補野手了。</p>';
    if(sel.kind==='def') opts+=`<h3>和打線上的人對調守位</h3>`+t.lineup.map((c,i)=>i===sel.slot?'':
      `<button class="spbtn" data-s="${i}"><b>${c.name} ↔ ${cur.name}</b><span>${c.name} 改守${POS_NAME[pos]}${posOk(c,pos)}、${cur.name} 改守${POS_NAME[c.pos]}${posOk(cur,c.pos)}</span></button>`).join('');
  }
  $('#subsBody').innerHTML=`<h1>換人<small>${t.name}・替補野手 ${t.bench.length} 人</small></h1>
    <p class="lead">${humanBat()?'進攻中：可以代打、代跑。':'守備中：可以換守備或對調守位。'}被換下的球員這場不能再上場；替補接替原本的打序和守位，守非本職位置時接球、傳球會下降。</p>
    <div class="sub-cols"><div><h2>換下</h2>${tgt}</div><div><h2>換上</h2>${opts}</div></div>
    <button class="go" id="subDone">回到比賽</button>`;
}
$('#subs').onclick=e=>{
  if(e.target.closest('#subDone')) return closeSubs();
  const t=G.teams[G.human], ts=subTargets(), sel=ts[UI.sub.t], btn=e.target.closest('button'); if(!btn)return;
  if(btn.dataset.t!==undefined){UI.sub.t=+btn.dataset.t; return renderSubs();}
  let r=null;
  if(btn.dataset.b!==undefined&&sel){r=substitute(t,sel.slot,+btn.dataset.b,sel.kind); if(sel.kind==='ph')UI.newPA=true;}   // 代打要重新介紹打者
  else if(btn.dataset.s!==undefined&&sel) r=swapPos(t,sel.slot,+btn.dataset.s);
  if(!r)return;
  log(r.text); UI.sub.t=null; renderSubs(); renderAll();
};

/* ---------- 輸入 ---------- */
function toField(e){const r=cv.getBoundingClientRect(); const t=e.touches?e.touches[0]:e; return unproj((t.clientX-r.left)/r.width*W,(t.clientY-r.top)/r.height*H);}
function onMove(e){
  if(!G)return; const p=toField(e);
  if(humanBat()){UI.pci.x=clamp(p.x,-1.7,1.7); UI.pci.y=clamp(p.y,0.6,4.4);}
  if(humanPit()&&(UI.phase==='aim'||UI.phase==='choose')){UI.aim.x=clamp(p.x,-1.8,1.8); UI.aim.y=clamp(p.y,0.6,4.6);}
  if(e.touches&&e.cancelable)e.preventDefault();
}
cv.addEventListener('mousemove',onMove);
cv.addEventListener('touchmove',onMove,{passive:false});
cv.addEventListener('touchstart',e=>{if(UI.phase==='intro'){advanceIntro();e.preventDefault();return;} onMove(e); if(humanPit())fieldTap(e);},{passive:false});
cv.addEventListener('mousedown',e=>{if(UI.phase==='intro')return advanceIntro(); if(humanPit())fieldTap(e);});
$('#intro').addEventListener('click',()=>advanceIntro());
function fieldTap(e){
  if(UI.phase==='aim'||UI.phase==='choose'){const p=toField(e); UI.aim={x:clamp(p.x,-1.8,1.8),y:clamp(p.y,0.6,4.6)}; UI.aimSet=true; UI.phase='ready'; renderOverlay();}
  else if(['ready','power','acc'].includes(UI.phase)) meterPress();
}
document.addEventListener('keydown',e=>{
  if(!G||!$('#setup').hidden||!$('#over').hidden||!$('#subs').hidden)return;
  const k=e.key.toLowerCase();
  if(k===' '&&document.activeElement&&document.activeElement.tagName==='BUTTON')document.activeElement.blur();
  if(UI.phase==='intro'){ if(k===' '||k==='enter'){advanceIntro(); e.preventDefault();} if(k==='escape')endIntro(); return; }
  if(k==='v'){cycleCam(); return;}
  if(humanBat()){ if(k==='j'){doSwing('normal');e.preventDefault();} if(k==='k'){doSwing('power');e.preventDefault();} }
  if(humanPit()){
    if(k===' '){ if(['ready','power','acc'].includes(UI.phase)){meterPress();} e.preventDefault(); }
    const n=parseInt(k); if(n>=1&&n<=curPitcher().pitches.length) choosePitch(n-1);
  }
});
document.addEventListener('keyup',e=>{if(G&&e.key===' '){e.preventDefault();}});
function choosePitch(i){ if(!['choose','aim','ready'].includes(UI.phase))return; UI.chosen=i; if(UI.phase==='choose')UI.phase='aim'; renderOverlay(); }

/* ---------- 疊加介面 ---------- */
function renderBug(){
  [0,1].forEach(s=>{const t=G.teams[s]; $('#r'+s).innerHTML=`<span class="sc" style="background:${t.color}">${runs(s)}</span><span class="tn">${t.short}</span>${G.half===s?'<span class="up">●</span>':''}`;});
  $('#inn').textContent=`${G.inning} ${G.half?'▼':'▲'}`;
  $('#cnt').innerHTML=`${G.balls}-${G.strikes}<small>${G.outs} 出局</small>`;
  const P=[[102,42],[65,12],[28,42]];
  $('#dia').innerHTML=`<polygon points="65,4 126,42 65,80 4,42" fill="#1f5236" stroke="#e7ecf3" stroke-width="3"/><polygon points="65,22 98,42 65,62 32,42" fill="#b98256"/>`+
    P.map((p,i)=>`<rect x="${p[0]-9}" y="${p[1]-9}" width="18" height="18" transform="rotate(45 ${p[0]} ${p[1]})" fill="${G.bases[i]?'#f3c230':'#e7ecf3'}" stroke="#0d1a33" stroke-width="2"/>`).join('')+`<path d="M65 76 l7 -7 l-7 -7 l-7 7z" fill="#e7ecf3"/>`;
}
function renderPlate(){
  const b=curBatter(), bt=batTeam(), st=b.st;
  $('#plate').innerHTML=`<div class="nm">${bt.bIdx+1}. ${b.name}<small>${POS_NAME[b.pos]}·${b.bats==='R'?'右打':'左打'}</small></div>
    <div class="chips"><span><i>力量</i>${b.pow}</span><span><i>技巧</i>${b.con}</span><span><i>速度</i>${b.spd}</span></div>`;
  $('#today').textContent=st.pa?`今日 ${st.ab} 打數 ${st.h} 安打${st.hr?`，${st.hr} 轟`:''}${st.rbi?`，${st.rbi} 打點`:''}`:'今日第一個打席';
  const p=curPitcher();
  $('#pinfo').innerHTML=`<b>${p.name}</b> ${fldTeam().short}·${p.throws==='R'?'右投':'左投'}<span>用球數 ${p.pc}　最快 ${topMph(p.velo)} mph　控球 ${p.ctrl}</span>`;
}
function renderOverlay(){
  if(!G)return;
  $('#field').classList.toggle('defense',UI.phase==='defense');
  const pad=$('#pad'), bats=$('#bats');
  if(humanPit()){
    bats.hidden=true; pad.hidden=false;
    const p=curPitcher(), can=['choose','aim','ready'].includes(UI.phase), meterOn=['ready','power','acc'].includes(UI.phase);
    const en=Math.round(p.energy);
    pad.innerHTML=p.pitches.map((x,i)=>`<button class="pk s${SLOT[i]}${i===UI.chosen?' sel':''}" data-i="${i}" ${can?'':'disabled'} title="${x.n}（能力 ${x.r}）"><span class="no">${i+1}</span>${SHORT[x.n]}<em><i style="width:${abilPct(x.r)}%"></i></em></button>`).join('')+
      `<button class="core" id="core" ${meterOn?'':'disabled'}><span>${UI.phase==='ready'?'出手':'按下'}</span></button>
       <div class="stam${en<35?' low':''}"><i>體力</i><b>${en}%</b></div>`;
    pad.querySelectorAll('.pk').forEach(b=>b.onclick=e=>{e.stopPropagation(); choosePitch(+b.dataset.i);});
    $('#core').onclick=meterPress;
    const help={choose:`${curPitcher().pitches[UI.chosen].n}：在好球帶點一下設定目標，或按 1–${p.pitches.length} 換球種`,aim:`在好球帶點一下設定目標`,ready:'按菱形按鈕、空白鍵或點畫面開始蓄力',power:'藍色往左下填滿，再按一次決定力道（越滿越快、越耗體力）',acc:'白色指針回到綠色區時按下；太早球偏高、太晚球偏低',flight:'',result:''};
    $('#help').textContent=help[UI.phase]||'';
  } else {
    pad.hidden=true; bats.hidden=false;
    const live=UI.phase==='flight'&&!UI.swing;
    $('#swn').disabled=!live; $('#swp').disabled=!live;
    $('#help').textContent=UI.phase==='flight'&&!UI.swing?'內圈縮到中間綠點時揮棒最準；白框是一般打擊範圍、紅虛線是用力打擊範圍':'';
  }
  const t=fldTeam(), bp=t.pitchers.map((x,i)=>({x,i})).filter(o=>!o.x.used);
  $('#chg').disabled=!humanPit()||!bp.length;
  $('#subBtn').disabled=netOn()||G.over||UI.phase==='intro'||!G.teams[G.human].bench.length;   // 連線對戰先不開放換人
  $('#simb').disabled=netOn();                                                                       // 也不能自動模擬
  if(netOn()&&(UI.phase==='remote'||UI.phase==='await'||UI.phase==='wait')) $('#help').textContent=UI.phase==='remote'?'等待對手投球…':UI.phase==='await'?'等待對手…':'等待對手確認換投…';
  $('#bull').innerHTML=bp.map(o=>`<button data-p="${o.i}"><b>${o.x.name}（${o.x.role}）</b><span>最快 ${topMph(o.x.velo)} mph · 控球 ${o.x.ctrl} · ${o.x.pitches.map(z=>z.n).join('、')}</span></button>`).join('');
  if(!humanPit())$('#bull').hidden=true;
}
function bar(v){return `<div class="bar"><i class="${v>=100?'hi':v<50?'lo':''}" style="width:${abilPct(v)}%"></i></div>`;}
function renderInfo(){
  const n=Math.max(9,G.inning);
  let hd='<tr><th></th>'; for(let i=1;i<=n;i++)hd+=`<th>${i}</th>`; hd+='<th class="sep">R</th><th>H</th><th>E</th></tr>';
  const row=s=>{const t=G.teams[s]; let r=`<tr><td class="tm"><i style="background:${t.color}"></i>${t.short}${G.human===s?'（你）':''}${t.lv?`<span class="lv">Lv${t.lv}</span>`:''}</td>`;
    for(let i=0;i<n;i++){const v=G.line[s][i]; r+=`<td class="${i===G.inning-1&&G.half===s&&!G.over?'now':''}">${v===undefined?'':v}</td>`;}
    return r+`<td class="sep"><b>${runs(s)}</b></td><td>${G.hits[s]}</td><td>${G.errors[s]}</td></tr>`;};
  $('#ls').innerHTML=hd+row(0)+row(1);
  const p=curPitcher(), b=curBatter(), ft=fldTeam(), bt=batTeam();
  const S=(l,v)=>`<span>${l}</span>${bar(v)}<span class="n">${v}</span>`;
  $('#pcard').innerHTML=`<h3>${p.name}<small>${ft.short}·${p.role}·${p.pc} 球</small></h3>
    <div class="stats">${S('球速',p.velo)}${S('控球',p.ctrl)}${S('體力',p.stam)}</div>
    <div class="stats" style="grid-template-columns:78px 1fr 26px">${p.pitches.map(x=>S(x.n,x.r)).join('')}</div>`;
  const nx=bt.lineup[(bt.bIdx+1)%9];
  $('#bcard').innerHTML=`<h3>${b.name}<small>${bt.short}·${POS_NAME[b.pos]}</small></h3>
    <div class="stats">${S('力量',b.pow)}${S('技巧',b.con)}${S('選球眼',b.eye)}${S('速度',b.spd)}${S('接球',b.fld)}${S('傳球',b.thr)}${S('臂力',b.arm)}</div>
    <p style="margin:6px 0 0;font-size:13px;color:var(--muted)">下一棒：${nx.name}（${POS_NAME[nx.pos]}）</p>`;
}
function renderAll(){ if(!G)return; renderBug(); renderPlate(); renderOverlay(); renderInfo(); drawMini(); renderLog(); }
function log(s){UI.logs.unshift(s); if(UI.logs.length>80)UI.logs.pop(); renderLog();}
function renderLog(){$('#log').innerHTML=UI.logs.map(s=>`<p>${s}</p>`).join('');}
let bTimer=null;
function banner(text,cls,ms){const b=$('#banner'); b.textContent=text; b.className='banner show '+(cls||''); clearTimeout(bTimer); bTimer=setTimeout(()=>b.classList.remove('show'),ms||1200);}

function showOver(e){
  const a=runs(0), h=runs(1), me=G.teams[G.human], won=runs(G.human)>runs(1-G.human);
  const title=e==='tie'?'和局':(won?`${me.short}獲勝！`:`${me.short}落敗`);
  // 換下場的人排在同一棒次、接替他的人前面
  const order=t=>t.lineup.flatMap((b,i)=>[...t.gone.filter(g=>g.slot===i),b]);
  const box=s=>{const t=G.teams[s]; return `<h2>${t.name}</h2><table class="box"><tr><th>球員</th><th>打數</th><th>安打</th><th>全壘打</th><th>打點</th><th>保送</th><th>三振</th></tr>${order(t).map(b=>`<tr${b.sub?' class="subrow"':''}><td>${b.sub?`<small>${SUB_KIND[b.sub]}</small> `:''}${b.name} <small>${POS_NAME[b.pos]}</small></td><td>${b.st.ab}</td><td>${b.st.h}</td><td>${b.st.hr}</td><td>${b.st.rbi}</td><td>${b.st.bb}</td><td>${b.st.so}</td></tr>`).join('')}</table>`;};
  // 勝敗投、救援
  const dec=gameDecisions(G);
  const decTxt=[['勝投',dec.wp],['敗投',dec.lp],['救援',dec.sv]].filter(x=>x[1]).map(([l,p])=>`${l}：${p.name}`).join('　');
  // 比賽獎勵（home.js 的金幣系統）；聯賽的比賽另外寫入賽程、累積排行榜成績（finishSeasonGame）。只算一次
  const result=e==='tie'||a===h?'tie':won?'win':'loss', season=G.season, online=netOn();
  if(G.reward===undefined) G.reward=online?(typeof onlineGameOver==='function'?onlineGameOver(result):'')
    :season?(typeof finishSeasonGame==='function'?finishSeasonGame(G,result):'')
    :typeof awardGame==='function'?awardGame(result,G.teams[1-G.human].lv||1,G.tier||0,G.teams[G.human].lv||1):'';
  const reward=G.reward;
  const tag=online?`連線對戰・對手 ${esc(NET.opp&&NET.opp.name||'')}`:season?season.label:'';
  $('#overBody').innerHTML=`<h1>${result==='tie'?'和局':title}${e==='walkoff'?'（再見分）':''}</h1>${tag?`<p class="over-tag">${tag}</p>`:''}<div class="final">${G.teams[0].short} ${a} : ${h} ${G.teams[1].short}</div>
    ${decTxt?`<p class="dec">${decTxt}</p>`:''}${reward?`<p class="reward">${reward}</p>`:''}${box(0)}${box(1)}
    <div class="over-btns"><button class="go" id="again">${online?'回到連線大廳':season?'回到聯賽':'再來一場'}</button><button class="ghost" id="overHome">回主選單</button></div>`;
  $('#over').hidden=false;
  if(typeof playJingle==='function'){ stopMusic(); result==='tie'?playMusic('title'):playJingle(won?'win':'lose',()=>playMusic('title')); }
  $('#again').onclick=()=>{$('#over').hidden=true;G=null;UI.phase='setup';
    if(online){netLeave(); showHome(); openOnline();}
    else if(season&&typeof openLeague==='function'){showHome(); openLeague();} else {renderSetup();$('#setup').hidden=false;}};
  if(online) $('#overHome').onclick=()=>{$('#over').hidden=true;G=null;UI.phase='setup'; netLeave(); showHome();};
  else
  $('#overHome').onclick=()=>{$('#over').hidden=true;G=null;UI.phase='setup';if(typeof showHome==='function')showHome();};
}

/* ---------- 主迴圈 ---------- */
function frame(now){
  if(G){
    if(UI.phase==='intro'&&UI.intro&&now>=UI.intro.at+UI.intro.steps[UI.intro.i].dur) advanceIntro();
    if(UI.phase==='flight'&&UI.pitch&&now>=UI.release+UI.pitch.travel+170) finishPitch();
    if(UI.phase==='defense'&&UI.defense&&!UI.defense.shown&&now>=UI.defense.start+UI.defense.duration*UI.defense.bannerAt){
      UI.defense.shown=true; banner(UI.defense.msg,UI.defense.cls,1900);
    }
    if((UI.phase==='result'||UI.phase==='defense')&&now>=UI.nextAt){UI.phase='wait'; UI.after();}
  }
  draw(now);
  requestAnimationFrame(frame);
}
window.addEventListener('resize',fitCanvas);
requestAnimationFrame(frame);
fitCanvas();
