// practice.js — 打擊練習：選一位一軍打者，面對電腦投手打 10 球，依擊球結果計分換金幣
//   投手難度和電腦難度同一套等級（engine.js 的 AI_TIERS：普通～神話），積分突破到那一級才能用那一級的練習。
//   每一球都是新的打席（球數歸零、壘上清空），用一般比賽的畫面與揮棒判定（ui.js 的 nextPitch／finishPitch／showResult）。
//   每天前 PRACTICE_DAILY 次有金幣，之後還能練、但不給金幣。成績不會寫進聯賽或球員資料。
// 依賴：engine.js、ui.js（startIntro 以外的比賽流程）、home.js（me、TM、renderManage、tierOpen…）
'use strict';
const PRACTICE_PITCHES=10, PRACTICE_DAILY=5;
// 每一分換幾枚金幣（等級越高越多）
const PRACTICE_COIN={common:3, fine:4, rare:6, perfect:8, epic:11, legend:15, mythic:20};
// 每一球的分數：全壘打 10、三壘安打 6、二壘安打 5、一壘安打 3、強勁的出局（擊球初速 95 mph 以上）1、壞球沒揮 1，其他 0
const practicePts=o=>{
  if(o.kind==='inplay'){ const b=o.bb; if(b.hit) return {HR:10,'3B':6,'2B':5,'1B':3}[b.hit]||0; if(b.error) return 1; return Math.round(b.ev)>=95?1:0; }   // 和畫面顯示的球速一樣四捨五入
  return o.kind==='ball'||o.kind==='bb'?1:0;
};
const PRACTICE_GRADE=[[60,'S'],[40,'A'],[25,'B'],[12,'C'],[0,'D']];
const practiceGrade=s=>PRACTICE_GRADE.find(([n])=>s>=n)[1];
const practiceLeft=()=>{const p=me(); return p.practice&&p.practice.date===today()?Math.max(0,PRACTICE_DAILY-p.practice.used):PRACTICE_DAILY;};
TM.pr={tier:0, batter:null};

/* ---------- 球員管理裡的打擊練習頁 ---------- */
function renderPractice(){
  const t=teamOf(me().team), pf=me(), s=TM.pr;
  if(!tierOpen(s.tier)) s.tier=0;
  const hitters=t.lineup.map(x=>LEAGUE.players[x.id]).filter(Boolean);
  if(!hitters.some(p=>p.id===s.batter)) s.batter=hitters.slice().sort((a,b)=>b.ovr-a.ovr)[0].id;
  const best=pf.practiceBest||{}, left=practiceLeft();
  $('#manageBody').innerHTML=`<button class="ghost dlg-x" data-tm="hub">← 球員管理</button><h1>打擊練習<small>${t.name}</small></h1>
    <p class="tr-tip">面對電腦投手打 ${PRACTICE_PITCHES} 球，每一球都是新的打席。全壘打 10 分、三壘安打 6、二壘安打 5、一壘安打 3、強勁的出局 1、壞球沒揮 1。
      等級越高投手越強、每分換到的金幣越多；積分突破到那一級才能練那一級。</p>
    <div class="shop-bar"><span class="coin"><em>●</em>${pf.coins.toLocaleString()} 金幣</span><span>今天還有 <b>${left}</b>／${PRACTICE_DAILY} 次有金幣${left?'':'（之後練習不給金幣）'}</span><span>積分 ${(pf.pts||0).toLocaleString()}</span></div>
    <h2>投手難度</h2>
    <div class="tiers pr-tiers">${AI_TIERS.map((T,i)=>{const open=tierOpen(i), b=best[T.id];
      return `<button class="tierbtn${i===s.tier?' sel':''}" data-prt="${i}" style="--c:${T.color}" ${open?'':'disabled'}>
        <b>${open?'':'🔒 '}${T.name}</b><span>投手 Lv ${T.lv}</span><em>${open?`每分 ${PRACTICE_COIN[T.id]} 金幣`:`積分 ${T.unlock} 開啟`}</em>${open&&b?`<small>最佳 ${b} 分</small>`:''}</button>`;}).join('')}</div>
    <h2>打者</h2>
    <div class="pr-bat">${hitters.map(p=>`<button class="${p.id===s.batter?'sel':''}" data-prb="${p.id}"><b>${esc(p.name)}</b><span>${posAbbr(p)}・總評 ${p.ovr}・力量 ${p.pow}・技巧 ${p.con}</span></button>`).join('')}</div>
    <table class="rates pr-rates"><tr><th>評價</th><th>總分</th></tr>${PRACTICE_GRADE.map(([n,g])=>`<tr><td>${g}</td><td>${n} 分以上</td></tr>`).join('')}</table>
    <button class="hot-btn" data-prgo="1">開始練習（${AI_TIERS[s.tier].name}・${PRACTICE_PITCHES} 球）</button>`;
}
$('#manageBody').addEventListener('click',e=>{
  const t=e.target.closest('[data-prt]'); if(t&&!t.disabled){TM.pr.tier=+t.dataset.prt; return renderManage();}
  const b=e.target.closest('[data-prb]'); if(b){TM.pr.batter=b.dataset.prb; return renderManage();}
  if(e.target.closest('[data-prgo]')) startPractice();
});

/* ---------- 練習本身 ---------- */
function startPractice(){
  const myId=me().team, s=TM.pr, T=AI_TIERS[s.tier];
  if(!tierOpen(s.tier)) return;
  // 對手：聯盟裡隨便一隊、隨便一位先發投手，調到這個難度的等級（能力上限也照這個稀有度）
  const others=LEAGUE.teams.filter(t=>t.id!==myId), opp=others[Math.floor(Math.random()*others.length)];
  const sp=opp.rotation[Math.floor(Math.random()*opp.rotation.length)];
  const mine=gameTeam(LEAGUE,myId), field=gameTeam(LEAGUE,opp.id,sp);
  scaleGameTeam(field,T.lv,T.id);
  newGame(mine,field,0);                                   // 我是客隊：一局上一直打擊
  const slot=Math.max(0,mine.lineup.findIndex(b=>b.id===s.batter)); mine.bIdx=slot;
  G.practice={tier:s.tier, total:PRACTICE_PITCHES, n:0, score:0, slot, rows:[]};
  mine.lv=gameTeamLevel(mine); field.lv=T.lv;
  UI.logs=[]; UI.marks=[]; UI.bb=null; UI.defense=null; UI.last=null; UI.lastMark=null; UI.wantSim=false; UI.wantSub=false; UI.newPA=true;
  ['manage','setup','over'].forEach(id=>$('#'+id).hidden=true); hideHome(); if(document.activeElement)document.activeElement.blur();
  log(`打擊練習：${T.name}難度・投手 ${field.pitchers[0].name}（Lv ${T.lv}）`);
  if(typeof playMusic==='function') playMusic('game');
  practiceCount(); field.pitchers[0].introduced=true; UI.phase='wait'; nextPitch();
}
// ui.js 的 showResult 呼叫：記下這一球
function practiceRecord(P,o){
  const pr=G.practice, pts=practicePts(o);
  pr.score+=pts; pr.n++;
  const what=o.kind==='inplay'?(o.bb.hit?{HR:'全壘打','3B':'三壘安打','2B':'二壘安打','1B':'一壘安打'}[o.bb.hit]:o.bb.error?'失誤上壘':`出局（${Math.round(o.bb.ev)} mph）`)
    :{ball:'壞球',strike:o.text.includes('揮棒')?'揮空':'好球沒揮',foul:'界外',hbp:'觸身'}[o.kind]||o.text;
  pr.rows.push({name:P.name, mph:Math.round(P.mph), what, pts});
  if(pts) setTimeout(()=>banner(`+${pts} 分`,'hit',900),900);
}
// 每一球隨機一個球數（最多 2 壞 1 好，不會變成三振或保送），電腦投手才會依球數換配球，不會一直丟同一種
function practiceCount(){ G.balls=Math.floor(Math.random()*3); G.strikes=Math.floor(Math.random()*2); }
// ui.js 的 UI.after 呼叫：重設成新的打席，打滿就結算
function practiceAfter(){
  const pr=G.practice;
  if(pr.n>=pr.total) return practiceFinish();
  const bt=batTeam(), p=curPitcher();
  practiceCount(); G.outs=0; G.bases=[null,null,null]; bt.bIdx=pr.slot;
  p.energy=100; p.ra=0;                                     // 投手不會累、也不會被換下
  UI.marks=[]; UI.newPA=false; UI.bb=null;
  nextPitch();
}
function practiceFinish(){
  const pr=G.practice, pf=me(), T=AI_TIERS[pr.tier], grade=practiceGrade(pr.score), paid=practiceLeft()>0;
  const coins=paid?Math.round(pr.score*PRACTICE_COIN[T.id]):0;
  pf.coins+=coins;
  pf.practice=pf.practice&&pf.practice.date===today()?pf.practice:{date:today(), used:0}; pf.practice.used++;
  pf.practiceBest=pf.practiceBest||{}; const nb=pr.score>(pf.practiceBest[T.id]||0); if(nb) pf.practiceBest[T.id]=pr.score;
  saveProfiles();
  const batter=batTeam().lineup[pr.slot];
  const hits=pr.rows.filter(r=>r.pts>=3).length, hr=pr.rows.filter(r=>r.what==='全壘打').length;
  G=null; UI.phase='setup';
  $('#overBody').innerHTML=`<h1>打擊練習結束<small>${T.name}難度・${esc(batter.name)}</small></h1>
    <div class="pr-grade g-${grade}"><b>${grade}</b><span>${pr.score} 分${nb?'・新紀錄！':''}</span></div>
    <p class="reward">${paid?`獲得 ${coins} 金幣（${pr.score} 分 × ${PRACTICE_COIN[T.id]}）`:'今天有金幣的練習次數用完了，這次沒有金幣'}・目前 ${pf.coins.toLocaleString()} 金幣<br>
      <small>${pr.total} 球：安打 ${hits}、全壘打 ${hr}・今天還有 ${practiceLeft()} 次有金幣</small></p>
    <table class="box pr-log"><tr><th>#</th><th>球種</th><th>球速</th><th>結果</th><th>得分</th></tr>
      ${pr.rows.map((r,i)=>`<tr><td>${i+1}</td><td>${esc(r.name)}</td><td>${r.mph}</td><td>${esc(r.what)}</td><td><b>${r.pts||''}</b></td></tr>`).join('')}</table>
    <div class="over-btns"><button class="go" id="prAgain">再練一次</button><button class="ghost" id="prBack">回到打擊練習</button></div>`;
  $('#over').hidden=false;
  if(typeof playJingle==='function'){ stopMusic(); playJingle(['S','A'].includes(grade)?'win':'lose',()=>playMusic('title')); }
  $('#prAgain').onclick=()=>{$('#over').hidden=true; startPractice();};
  $('#prBack').onclick=()=>{$('#over').hidden=true; showHome(); openManage('practice');};
}
function practiceQuit(){
  G=null; UI.phase='setup'; if(typeof playMusic==='function') playMusic('title');
  showHome(); openManage('practice');
}
