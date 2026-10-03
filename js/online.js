// online.js — 連線對戰：用 Supabase Realtime（即時頻道）讓兩位玩家對打，不需要另外架伺服器
//   好友房間：建房間拿 6 碼代碼，朋友輸入代碼加入；隨機配對：在大廳頻道找另一位也在等的玩家。
//   各自帶自己聯盟裡的球隊（不調整等級）。房主的遊戲負責判定每一球（ui.js 的 netResolve），把比賽狀態傳給對手；
//   雙方只送出自己的操作：投手送出投出的球，打者送出揮棒時機（在自己畫面上判定，網路延遲不影響公平）。
//   訊息：ready 準備（含球隊）／start 開賽／pitch 投球／swing 揮棒／result 結果＋狀態／change 要求換投／state 換投後的狀態／
//         quit 認輸離開／resync 太久沒收到，請對方重送上一則
// 依賴：cloud.js 的 CLOUD.sb（Supabase）、engine.js、ui.js（startIntro、nextPitch、netTry…）、home.js（me、saveProfiles…）
'use strict';
const NET={active:false, role:null, side:null, ch:null, lobby:null, code:null, mode:'idle', inbox:{},
  id:null, opp:null, myTeam:null, oppTeam:null, last:null, timers:{}, err:'', searchN:0, sp:null};
const ONLINE_REWARD={win:{c:400,p:25}, tie:{c:200,p:10}, loss:{c:150,p:0}};
const ROOM_PREFIX='bb-room-', LOBBY='bb-lobby';
const GONE_GRACE=20000;                       // 對手斷線超過 20 秒判你獲勝
// 每個分頁一個連線身分（同一個帳號開兩個視窗也分得開）
NET.id=(()=>{let t=null; try{t=sessionStorage.getItem('baseball-net-id');}catch(e){}
  if(!t){t=Math.random().toString(36).slice(2,10); try{sessionStorage.setItem('baseball-net-id',t);}catch(e){}} return t;})();
const netReady=()=>typeof CLOUD!=='undefined'&&!!CLOUD.sb;
const myInfo=()=>{const p=me(), t=teamOf(p.team); return {id:NET.id, name:p.name, team:t?t.name:'', lv:t?teamLevel(LEAGUE,t):1, color:t?t.color:'#888'};};

/* ---------- 頻道 ---------- */
function joinChannel(name, onMsg, onPresence, meta){
  const ch=CLOUD.sb.channel(name,{config:{broadcast:{self:false}, presence:{key:NET.id}}});
  ch.on('broadcast',{event:'m'},({payload})=>{ if(payload&&payload.from!==NET.id) onMsg(payload); });
  ch.on('presence',{event:'sync'},()=>onPresence(Object.values(ch.presenceState()).map(a=>a[0]).filter(Boolean)));
  return new Promise((res,rej)=>{
    const to=setTimeout(()=>rej(new Error('連線逾時')),10000);
    ch.subscribe(async st=>{
      if(st==='SUBSCRIBED'){ clearTimeout(to); try{await ch.track(meta);}catch(e){} res(ch); }
      else if(st==='CHANNEL_ERROR'||st==='TIMED_OUT'){ clearTimeout(to); rej(new Error(st==='TIMED_OUT'?'連線逾時':'連不上即時頻道')); }
    });
  });
}
async function dropChannel(ch){ if(!ch) return; try{await ch.untrack();}catch(e){} try{await CLOUD.sb.removeChannel(ch);}catch(e){} }
NET.send=(type,data={})=>{
  const msg={type, from:NET.id, ...data};
  if(['pitch','swing','result','state'].includes(type)) NET.last=msg;    // 對方要求重送時用
  if(NET.ch) NET.ch.send({type:'broadcast', event:'m', payload:msg}).catch(()=>{});
};
function clearTimers(){ Object.values(NET.timers).forEach(t=>{clearTimeout(t); clearInterval(t);}); NET.timers={}; }
async function netLeave(){
  clearTimers();
  const ch=NET.ch, lb=NET.lobby;
  Object.assign(NET,{active:false, role:null, side:null, ch:null, lobby:null, code:null, mode:'idle', inbox:{}, opp:null, myTeam:null, oppTeam:null, last:null, err:''});
  await Promise.all([dropChannel(ch),dropChannel(lb)]);
}

/* ---------- 大廳畫面 ---------- */
function openOnlineLobby(){ renderOnline(); $('#online').hidden=false; }
function renderOnline(){
  const p=me(), t=teamOf(p.team), rec=p.online||{w:0,l:0,t:0};
  const head=`<button class="ghost dlg-x" data-net="close">${NET.mode==='room'||NET.mode==='search'?'離開':'關閉'}</button><h1>連線對戰<small>${esc(p.name)}・${t?esc(t.name):''}・Lv ${t?teamLevel(LEAGUE,t):'-'}</small></h1>`;
  let body='';
  if(!netReady()) body='<p class="lead">連線對戰要用雲端服務（Supabase）。請先在 js/cloud-config.js 填好設定。</p>';
  else if(NET.mode==='room') body=roomHTML();
  else if(NET.mode==='search') body=`<div class="net-wait"><div class="net-spin"></div><p class="lead">正在找對手…${NET.searchN>1?`（大廳裡有 ${NET.searchN} 人）`:''}</p>
      <p class="tr-tip">找到人就會自動進房間。也可以先取消，改用好友房間。</p><button class="ghost" data-net="cancel">取消配對</button></div>`;
  else body=`<p class="lead">和其他玩家即時對打：你投球時對手打擊，換你打擊時對手投球。各自用自己的球隊，不調整等級。</p>
    <div class="net-grid">
      <section class="net-card"><h2>好友房間</h2><p class="tr-tip">建一個房間，把 6 碼代碼傳給朋友。</p><button class="hot-btn" data-net="create">建立房間</button></section>
      <section class="net-card"><h2>加入房間</h2><p class="tr-tip">輸入朋友給你的代碼。</p>
        <div class="net-join"><input id="netCode" maxlength="6" placeholder="代碼" autocomplete="off"><button class="hot-btn" data-net="join">加入</button></div></section>
      <section class="net-card"><h2>隨機配對</h2><p class="tr-tip">和大廳裡也在等的玩家對打。</p><button class="hot-btn" data-net="search">開始配對</button></section>
    </div>
    <p class="tr-tip">連線戰績 ${rec.w} 勝 ${rec.l} 敗 ${rec.t} 和。贏 +${ONLINE_REWARD.win.c} 金幣、積分 +${ONLINE_REWARD.win.p}；和 +${ONLINE_REWARD.tie.c}、+${ONLINE_REWARD.tie.p}；輸 +${ONLINE_REWARD.loss.c}。
      中途離開判輸，對手斷線超過 20 秒判你贏。連線對戰的成績不算進聯賽排行榜。</p>`;
  $('#onlineBody').innerHTML=head+(NET.err?`<p class="tr-note bad">${esc(NET.err)}</p>`:'')+body;
}
function roomHTML(){
  const t=teamOf(me().team), o=NET.opp, sp=t.rotation.includes(NET.sp)?NET.sp:nextStarter(t);
  const meCard=`<div class="net-p ${NET.myTeam?'ready':''}"><b>${esc(me().name)}</b><span><i class="dot" style="background:${t.color}"></i>${esc(t.name)}・Lv ${teamLevel(LEAGUE,t)}</span><em>${NET.myTeam?'✓ 準備好了':'選先發投手後按準備'}</em></div>`;
  const oppCard=o?`<div class="net-p ${NET.oppTeam?'ready':''}"><b>${esc(o.name||'')}</b><span><i class="dot" style="background:${o.color||'#888'}"></i>${esc(o.team||'')}・Lv ${o.lv||'-'}</span><em>${NET.oppTeam?'✓ 準備好了':'準備中…'}</em></div>`
    :`<div class="net-p empty"><b>等待對手加入…</b><span>${NET.role==='host'?'把上面的代碼傳給朋友':'正在連到房間…'}</span></div>`;
  return `${NET.role==='host'&&!NET.matched?`<div class="net-code"><span>房間代碼</span><b>${NET.code}</b><button class="ghost sm" data-net="copy">複製</button></div>`:''}
    <div class="net-ps">${meCard}<em class="net-vs">VS</em>${oppCard}</div>
    <div class="lg-sp"><span>我的先發</span>${t.rotation.map(pid=>{const p=LEAGUE.players[pid]; return `<button class="${pid===sp?'sel':''}" data-netsp="${pid}" ${NET.myTeam?'disabled':''}>${esc(p.name)}<small>${p.ovr}</small></button>`;}).join('')}</div>
    <div class="lg-btns">${NET.myTeam?'<button class="ghost" data-net="unready">取消準備</button>':`<button class="hot-btn" data-net="ready" ${o?'':'disabled'}>準備好了</button>`}</div>
    <p class="tr-tip">雙方都準備好就開賽，誰先攻由系統隨機決定。比賽中可以換投；暫時不能代打、代跑，也不能自動模擬。</p>`;
}
$('#onlineBody').addEventListener('click',async e=>{
  const b=e.target.closest('[data-net],[data-netsp]'); if(!b) return;
  if(b.dataset.netsp){NET.sp=b.dataset.netsp; return renderOnline();}
  const k=b.dataset.net; NET.err='';
  if(k==='close'){ if(NET.mode!=='idle') await netLeave(); $('#online').hidden=true; renderMenu(); return; }
  if(k==='create') return enterRoom(newCode(),'host');
  if(k==='join'){ const c=($('#netCode').value||'').trim().toUpperCase(); if(!/^[A-Z0-9]{6}$/.test(c)){NET.err='代碼是 6 個英文或數字'; return renderOnline();} return enterRoom(c,'guest'); }
  if(k==='search') return startSearch();
  if(k==='cancel'){ await netLeave(); return renderOnline(); }
  if(k==='copy'){ try{await navigator.clipboard.writeText(NET.code); toast('已複製房間代碼');}catch(err){} return; }
  if(k==='ready') return setReady(true);
  if(k==='unready') return setReady(false);
});
$('#onlineBody').addEventListener('keydown',e=>{ if(e.target.id==='netCode'&&e.key==='Enter') $('[data-net="join"]').click(); });
// 點視窗外面關閉：在房間或配對中就一起離開
$('#online').addEventListener('click',e=>{ if(e.target.id==='online'&&NET.mode!=='idle'&&!NET.active) netLeave(); },true);
const CODE_CHARS='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newCode=()=>Array.from({length:6},()=>CODE_CHARS[Math.floor(Math.random()*CODE_CHARS.length)]).join('');

/* ---------- 房間 ---------- */
async function enterRoom(code, role, matched=false){
  if(!netReady()) return;
  await netLeave();
  Object.assign(NET,{mode:'room', role, code, matched, opp:null, myTeam:null, oppTeam:null});
  renderOnline();
  try{ NET.ch=await joinChannel(ROOM_PREFIX+code, onRoomMsg, onRoomPresence, {...myInfo(), role, at:Date.now()}); }
  catch(err){ await netLeave(); NET.err='連線失敗：'+err.message; return renderOnline(); }
  // 加入的人等不到房主：房間不存在（或配對時對方已經走了）
  if(role==='guest') NET.timers.noHost=setTimeout(async()=>{ if(NET.mode==='room'&&!NET.opp){ const m=NET.matched; await netLeave(); if(m) return startSearch(); NET.err='找不到這個房間，或房主已經離開'; renderOnline(); } },9000);
  if(role==='host'&&matched) NET.timers.noGuest=setTimeout(async()=>{ if(NET.mode==='room'&&!NET.opp){ await netLeave(); startSearch(); } },12000);
}
function onRoomPresence(list){
  const others=list.filter(x=>x.id!==NET.id).sort((a,b)=>a.at-b.at);
  // 房間最多兩人：我是後來的第三人就離開
  if(NET.role==='guest'&&!NET.active&&others.filter(x=>x.role==='guest').some(x=>x.at<(list.find(y=>y.id===NET.id)||{}).at)){
    netLeave().then(()=>{NET.err='這個房間已經有人了'; renderOnline();}); return; }
  const opp=others.find(x=>x.role!==NET.role)||null;
  if(NET.active){                                            // 比賽中：對手不見了就開始倒數
    if(!opp&&!NET.timers.gone&&G&&!G.over){ banner('對手連線中斷，等待 20 秒…','',3000);
      NET.timers.gone=setTimeout(()=>netWinByForfeit('對手斷線超過 20 秒'),GONE_GRACE); }
    if(opp&&NET.timers.gone){ clearTimeout(NET.timers.gone); delete NET.timers.gone; banner('對手回來了','',1500); NET.send('resync'); }
    return;
  }
  if(!opp&&NET.opp) NET.oppTeam=null;                         // 對手離開房間
  NET.opp=opp; if(opp){clearTimeout(NET.timers.noHost); clearTimeout(NET.timers.noGuest);}
  if(opp&&NET.myTeam) sendReady();                            // 對手剛進來（或重連），再告訴他一次我準備好了
  if(!$('#online').hidden) renderOnline();
}
function sendReady(){ NET.send('ready',{team:NET.myTeam, name:me().name}); }
function setReady(on){
  if(on){ const t=teamOf(me().team), sp=t.rotation.includes(NET.sp)?NET.sp:nextStarter(t);
    const gt=gameTeam(LEAGUE,t.id,sp); gt.lv=gameTeamLevel(gt); NET.myTeam=gt; NET.sp=sp; sendReady(); }
  else { NET.myTeam=null; NET.send('unready'); }
  renderOnline(); tryStart();
}
// 房主：雙方都準備好就開賽
function tryStart(){
  if(NET.role!=='host'||NET.active||!NET.myTeam||!NET.oppTeam||!NET.opp) return;
  const host=JSON.parse(JSON.stringify(NET.myTeam)), guest=JSON.parse(JSON.stringify(NET.oppTeam));
  if(guest.id===host.id){ guest.id+='_2'; guest.color=(TEAM_DEFS.find(d=>d.color!==host.color&&d.id!==host.id)||{color:'#5b5b5b'}).color; }   // 選了同一個縣市：換個顏色分得出來
  const hostSide=Math.random()<0.5?0:1, teams=hostSide===0?[host,guest]:[guest,host];
  newGame(teams[0],teams[1],hostSide); G.online=true; G.pn=0;
  NET.side=hostSide; NET.send('start',{G, side:1-hostSide});
  beginOnlineGame();
}
function onRoomMsg(m){
  switch(m.type){
    case 'ready': NET.oppTeam=m.team; if(NET.opp) NET.opp.name=m.name||NET.opp.name; if(!$('#online').hidden) renderOnline(); return tryStart();
    case 'unready': NET.oppTeam=null; if(!$('#online').hidden) renderOnline(); return;
    case 'start': if(NET.role!=='guest'||NET.active) return; NET.side=m.side; G=m.G; G.human=m.side; return beginOnlineGame();
    case 'pitch': NET.inbox.pitch={P:m.P, pn:m.pn}; return netOn()&&netTryLaunch();
    case 'swing': NET.inbox.swing={sw:m.sw, pn:m.pn}; return netOn()&&netTryResolve();
    case 'result': NET.inbox.result={o:m.o, G:m.G, pn:m.pn}; return netOn()&&netTryResult();
    case 'change': if(NET.role!=='host') return; NET.inbox.change=m.i; if(netOn()&&UI.phase==='remote') netBetweenPitches(); return;
    case 'state': if(NET.role!=='guest') return; NET.inbox.state={G:m.G, msg:m.msg, card:m.card}; if(netOn()&&['remote','wait'].includes(UI.phase)) netBetweenPitches(); return;
    case 'resync': if(NET.last&&NET.ch) NET.ch.send({type:'broadcast', event:'m', payload:NET.last}).catch(()=>{}); return;
    case 'quit': if(NET.active&&G&&!G.over) netWinByForfeit('對手離開了比賽'); return;
  }
}

/* ---------- 比賽 ---------- */
function beginOnlineGame(){
  NET.active=true; NET.inbox={}; NET.mode='room';
  clearTimeout(NET.timers.noHost); clearTimeout(NET.timers.noGuest);
  // 自己球隊的輪值往下一位（和單人比賽一樣）
  const my=teamOf(me().team); if(my&&my.rotation.includes(NET.sp)){ my.rotIdx=(my.rotation.indexOf(NET.sp)+1)%my.rotation.length; saveLeague(); }
  ['online','manage','shop','settings','league','admin'].forEach(id=>$('#'+id).hidden=true);
  hideHome();
  UI.logs=[]; UI.marks=[]; UI.bb=null; UI.defense=null; UI.last=null; UI.lastMark=null; UI.wantSim=false; UI.wantSub=false; UI.newPA=true; UI.swing=null; UI.pitch=null;
  $('#setup').hidden=true; $('#over').hidden=true; $('#bull').hidden=true; if(document.activeElement)document.activeElement.blur();
  const [a,h]=G.teams, mine=G.teams[G.human];
  log(`連線對戰：${a.name} 對 ${h.name}（${h.park}）`);
  log(`<em>Lv</em>你的球隊 Lv ${mine.lv||'-'}・對手 ${G.teams[1-G.human].short} Lv ${G.teams[1-G.human].lv||'-'}；你是${G.human?'後攻（主隊）':'先攻（客隊）'}`);
  if(typeof playMusic==='function') playMusic('game');
  if(typeof SETTINGS!=='undefined'&&SETTINGS().intro===false){G.teams[1].pitchers[0].introduced=true; UI.phase='wait'; nextPitch();}
  else startIntro();
  // 等太久（訊息可能掉了）就請對方重送上一則
  NET.timers.watch=setInterval(()=>{
    if(!netOn()||G.over) return;
    const waiting=['remote','await','wait'].includes(UI.phase);
    if(!waiting){NET.waitSince=0; return;}
    if(!NET.waitSince) NET.waitSince=performance.now();
    else if(performance.now()-NET.waitSince>6000){ NET.waitSince=performance.now(); NET.send('resync'); }
  },1000);
}
function onlineAward(result){
  const p=me(), r=ONLINE_REWARD[result];
  p.coins+=r.c; p.pts=(p.pts||0)+r.p; p.online=p.online||{w:0,l:0,t:0}; p.online[{win:'w',loss:'l',tie:'t'}[result]]++;
  saveProfiles();
  return `獲得 ${r.c} 金幣${r.p?`、積分 +${r.p}`:''}（目前 ${p.coins.toLocaleString()} 金幣）・連線戰績 ${p.online.w} 勝 ${p.online.l} 敗 ${p.online.t} 和`;
}
// ui.js 的 showOver 呼叫（只算一次）
function onlineGameOver(result){ clearTimers(); return onlineAward(result); }
function endOnlineScreen(title,txt){
  G=null; UI.phase='setup'; UI.intro=null; $('#intro').hidden=true; $('#skip').hidden=true; $('#field').classList.remove('in-intro');
  $('#overBody').innerHTML=`<h1>${title}</h1><p class="reward">${txt}</p>
    <div class="over-btns"><button class="go" id="again">回到連線大廳</button><button class="ghost" id="overHome">回主選單</button></div>`;
  $('#over').hidden=false;
  $('#again').onclick=()=>{$('#over').hidden=true; showHome(); openOnline();};
  $('#overHome').onclick=()=>{$('#over').hidden=true; showHome();};
}
async function netWinByForfeit(why){
  if(!NET.active||!G||G.over) return;
  G.over=true; const txt=onlineAward('win');
  await netLeave(); endOnlineScreen('對手棄權，你獲勝！',`${esc(why)}。<br>${txt}`);
  if(typeof playJingle==='function'){ stopMusic(); playJingle('win',()=>playMusic('title')); }
}
async function netForfeit(){
  if(!NET.active) return;
  NET.send('quit'); G.over=true; const txt=onlineAward('loss');
  await netLeave(); if(typeof playMusic==='function') playMusic('title');
  endOnlineScreen('你離開了比賽（判負）',txt);
}
addEventListener('beforeunload',()=>{ if(NET.active&&G&&!G.over) NET.send('quit'); });

/* ---------- 隨機配對：大廳頻道裡依進來的時間兩兩配對，先進來的當房主 ---------- */
async function startSearch(){
  if(!netReady()) return;
  await netLeave(); NET.mode='search'; NET.searchN=0; renderOnline();
  try{ NET.lobby=await joinChannel(LOBBY,()=>{},onLobbyPresence,{...myInfo(), at:Date.now(), searching:true}); }
  catch(err){ await netLeave(); NET.err='連線失敗：'+err.message; return renderOnline(); }
}
function onLobbyPresence(list){
  if(NET.mode!=='search') return;
  const q=list.filter(x=>x.searching).sort((a,b)=>a.at-b.at||(a.id<b.id?-1:1));
  NET.searchN=q.length; if(!$('#online').hidden) renderOnline();
  const i=q.findIndex(x=>x.id===NET.id); if(i<0) return;
  const j=i%2===0?i+1:i-1, partner=q[j]; if(!partner) return;
  const host=i<j, a=host?NET.id:partner.id, b=host?partner.id:NET.id;
  let h=0; for(const c of a+'|'+b) h=(h*31+c.charCodeAt(0))>>>0;   // 兩邊算出同一個房間代碼
  const code=Array.from({length:6},(_,k)=>CODE_CHARS[(h>>>(k*5))%CODE_CHARS.length]).join('');
  enterRoom(code,host?'host':'guest',true);
}

/* ---------- 主選單「連線對戰」 ---------- */
openOnline=function(){ if(!NET.active) openOnlineLobby(); };
