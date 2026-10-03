// cloud.js — 雲端同步（Supabase）：一個雲端帳號＝一位玩家，金幣、積分、設定和整個聯盟都跟著帳號走
// 本機的玩家檔案 key 是 'cloud:帳號id'（PROFILES.list），聯盟存檔是 IndexedDB 的 'league:cloud:帳號id'（db.js）。
// 存檔後 3 秒上傳；開遊戲、切回視窗時檢查雲端有沒有別台電腦的新版本。rev 每次上傳 +1，兩邊都改過就跳出來讓玩家選。
// 依賴：cloud-config.js、supabase-js（CDN）、db.js、home.js；沒設定或沒網路時整個功能關閉，遊戲照舊只存在這台電腦
'use strict';
const CLOUD={sb:null, user:null, status:'off', seq:0, timer:null, busy:false, applying:false,
  admin:false,                                                    // 由資料庫的 is_admin() 判斷（supabase/admin.sql）
  view:(()=>{try{return JSON.parse(sessionStorage.getItem('baseball-admin-view'));}catch(e){return null;}})()};  // 管理員正在編輯的玩家
const ADMIN_VIEW='baseball-admin-view';
const CLOUD_META='baseball-cloud-meta';            // {帳號id:{rev, at, dirty}}：這台電腦最後一次和雲端一致的版本
const cloudKey=uid=>'cloud:'+uid;
const isCloudKey=k=>typeof k==='string'&&k.startsWith('cloud:');
const cloudMeta=uid=>{try{return (JSON.parse(localStorage.getItem(CLOUD_META))||{})[uid]||{};}catch(e){return {};}};
function setCloudMeta(uid,patch){
  let m={}; try{m=JSON.parse(localStorage.getItem(CLOUD_META))||{};}catch(e){}
  m[uid]={...(m[uid]||{}),...patch}; try{localStorage.setItem(CLOUD_META,JSON.stringify(m));}catch(e){}
}
const STATUS_TXT={off:'', out:'', sync:'☁ 同步中…', ok:'☁ 已同步', wait:'☁ 等待上傳', offline:'☁ 離線，稍後重試', conflict:'☁ 有衝突'};
function setCloudStatus(s){ CLOUD.status=s; const el=$('#pbCloud'); if(el){el.textContent=STATUS_TXT[s]||''; el.className='pb-cloud '+s;} }
const cloudOn=()=>!!(CLOUD.user&&PROFILES.current===cloudKey(CLOUD.user.id));

/* ---------- 壓縮：SQLite 存檔 → gzip → base64（瀏覽器不支援壓縮就直接 base64） ---------- */
function toB64(u){let s=''; for(let i=0;i<u.length;i+=0x8000) s+=String.fromCharCode.apply(null,u.subarray(i,i+0x8000)); return btoa(s);}
async function packBytes(bytes){
  if(!window.CompressionStream) return 'raw:'+toB64(bytes);
  const st=new Blob([bytes]).stream().pipeThrough(new CompressionStream('gzip'));
  return 'gz:'+toB64(new Uint8Array(await new Response(st).arrayBuffer()));
}
async function unpackBytes(str){
  const i=str.indexOf(':'), kind=str.slice(0,i), u=b64bytes(str.slice(i+1));
  if(kind!=='gz') return u;
  const st=new Blob([u]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(st).arrayBuffer());
}

/* ---------- 上傳、下載 ---------- */
// home.js 的 saveProfiles 與 db.js 的 persistDB 存檔後呼叫：標記有變動，3 秒後上傳（連續存檔只傳一次）
function cloudDirty(){
  if(CLOUD.view&&DB_OWNER==='adminview:'+CLOUD.view.uid){ CLOUD.viewPending=true; clearTimeout(CLOUD.viewTimer); CLOUD.viewTimer=setTimeout(()=>pushView(),1500); return; }
  if(CLOUD.applying||CLOUD.reloading||!cloudOn()) return;
  CLOUD.seq++; setCloudMeta(CLOUD.user.id,{dirty:true}); setCloudStatus('wait');
  clearTimeout(CLOUD.timer); CLOUD.timer=setTimeout(()=>cloudPush(),3000);
}
// force＝衝突時選「用這台電腦的進度」：直接蓋過雲端的 baseRev 版本
async function cloudPush(force=false, baseRev=0){
  // 頁面正要重新整理、或目前載入的不是這位玩家的聯盟（剛換帳號）時不上傳，免得用別人的聯盟或空的聯盟蓋掉雲端
  if(!cloudOn()||CLOUD.reloading||DB_OWNER!==cloudKey(CLOUD.user.id)) return;
  if(CLOUD.busy){ clearTimeout(CLOUD.timer); CLOUD.timer=setTimeout(()=>cloudPush(force,baseRev),1500); return; }
  const uid=CLOUD.user.id, key=cloudKey(uid), m=cloudMeta(uid), seq=CLOUD.seq, profile=PROFILES.list[key];
  if(!profile) return;
  if(!force&&!m.dirty&&m.rev) return setCloudStatus('ok');
  CLOUD.busy=true; setCloudStatus('sync');
  try{
    const league=DB&&DB_OWNER===key?await packBytes(DB.export()):null, at=new Date().toISOString();
    const rev=force?baseRev:m.rev, body={profile, updated_at:at, ...(league?{league}:{})};
    let res;
    if(rev) res=await CLOUD.sb.from('saves').update({...body, rev:rev+1}).eq('user_id',uid).eq('rev',rev).select('rev');
    else res=await CLOUD.sb.from('saves').insert({user_id:uid, rev:1, ...body}).select('rev');
    if(res.error&&res.error.code!=='23505') throw res.error;
    if(res.error||!res.data.length){ CLOUD.busy=false; return cloudCheck(); }   // 雲端已經被別台電腦改過
    setCloudMeta(uid,{rev:res.data[0].rev, at, dirty:CLOUD.seq!==seq});
    setCloudStatus(CLOUD.seq!==seq?'wait':'ok');
    if(CLOUD.seq!==seq){ clearTimeout(CLOUD.timer); CLOUD.timer=setTimeout(()=>cloudPush(),3000); }
  }catch(e){
    console.warn('雲端上傳失敗',e); setCloudStatus('offline');
    clearTimeout(CLOUD.timer); CLOUD.timer=setTimeout(()=>cloudPush(),30000);
  }
  CLOUD.busy=false;
}
async function cloudFetch(){
  const {data,error}=await CLOUD.sb.from('saves').select('rev,profile,league,updated_at').eq('user_id',CLOUD.user.id).maybeSingle();
  if(error) throw error; return data;
}
// 把雲端的版本寫進這台電腦（玩家檔案＋聯盟存檔），之後重新整理頁面載入
async function applyRemote(row){
  const uid=CLOUD.user.id, key=cloudKey(uid);
  CLOUD.applying=true;
  try{
    PROFILES.list[key]={...row.profile};
    if(row.league) await idbPut(await unpackBytes(row.league),leagueKey(key));
    else await idbDel(leagueKey(key));                       // 管理員重置了聯盟：這台電腦也從全新的聯盟開始
    saveProfiles();
  }finally{ CLOUD.applying=false; }
  setCloudMeta(uid,{rev:row.rev, at:row.updated_at, dirty:false});
}
// 切換成雲端玩家並重新整理頁面（db.js 改載入這位玩家的聯盟）；login 會發每日登入獎勵，變動在重新整理後上傳
function reloadAs(key,msg){
  const bonus=login(key);   // 會把 dirty 記下來（cloudDirty），重新整理後再上傳
  CLOUD.reloading=true; clearTimeout(CLOUD.timer);
  try{sessionStorage.setItem('baseball-toast',(msg||'')+(bonus?`（每日登入獎勵 +${bonus} 金幣）`:''));}catch(e){}
  location.reload();
}
// 進入雲端帳號：比對雲端和這台電腦的版本，決定下載、上傳、或請玩家選
async function cloudEnter(){
  const uid=CLOUD.user.id, key=cloudKey(uid), m=cloudMeta(uid), local=PROFILES.list[key];
  setCloudStatus('sync');
  let row;
  try{ row=await cloudFetch(); }
  catch(e){
    console.warn('雲端讀取失敗',e); setCloudStatus('offline');
    if(local){ if(PROFILES.current!==key) return reloadAs(key,'目前連不上雲端，先用這台電腦上次的進度'); return; }
    return cloudLoginErr('連不上雲端，第一次登入需要網路');
  }
  if(!row){
    if(local){ setCloudMeta(uid,{rev:0, dirty:true}); if(PROFILES.current!==key) return reloadAs(key,'已登入雲端帳號'); return cloudPush(); }
    return showCloudFirst();                                   // 這個帳號第一次使用
  }
  if(!local||(row.rev>(m.rev||0)&&!m.dirty)){                   // 雲端比較新（或這台電腦還沒有）：下載
    await applyRemote(row); return reloadAs(key,local?'已載入雲端上的最新進度':`歡迎回來，${row.profile.name||''}！已從雲端載入進度`);
  }
  if(row.rev>(m.rev||0)&&m.dirty) return showCloudConflict(row);   // 兩邊都改過
  if(PROFILES.current!==key) return reloadAs(key,'已登入雲端帳號');
  if(m.dirty) cloudPush(); else setCloudStatus('ok');
}
// 遊戲進行中不打斷；回到主選單時再檢查一次
async function cloudCheck(){
  if(!cloudOn()) return;
  if(typeof G!=='undefined'&&G&&!G.over){ CLOUD.recheck=true; return; }
  return cloudEnter();
}

/* ---------- 對話框：第一次使用、衝突 ---------- */
function cloudDlg(html){ $('#cloudDlgBody').innerHTML=html; $('#cloudDlg').hidden=false; }
const fmtTime=s=>{try{return new Date(s).toLocaleString('zh-TW',{hour12:false});}catch(e){return s||'';}};
function showCloudFirst(err){
  const locals=Object.keys(PROFILES.list).filter(k=>!isCloudKey(k)).map(k=>PROFILES.list[k]);   // 只在這台電腦的玩家
  cloudDlg(`<h1>第一次使用雲端帳號<small>${esc(CLOUD.user.email||'')}</small></h1>
    <p class="lead">要把這台電腦上的哪位玩家放上雲端？放上去之後，換電腦登入同一個帳號就能接著玩。</p>
    ${locals.length?`<div class="cl-list">${locals.map(p=>{const t=teamOf(p.team);
      return `<button class="cl-p" data-up="${esc(p.name)}"><b>${esc(p.name)}</b><span>${(p.coins||0).toLocaleString()} 金幣・積分 ${(p.pts||0).toLocaleString()}${t?`・${esc(t.city||'')}`:''}</span></button>`;}).join('')}</div>`:''}
    <h2>${locals.length?'或建立新玩家':'建立新玩家'}</h2>
    <div class="cl-new"><input id="clNick" maxlength="12" placeholder="暱稱（最多 12 字）"><button class="hot-btn" id="clNew">建立</button></div>
    <p class="login-err">${err?esc(err):''}</p>
    <button class="ghost" id="clOut">先不要，登出雲端</button>`);
}
function showCloudConflict(row){
  const key=cloudKey(CLOUD.user.id), lp=PROFILES.list[key]||{}, rp=row.profile||{}, m=cloudMeta(CLOUD.user.id);
  const yr=DB_OWNER===key&&LEAGUE.season?`第 ${LEAGUE.season.year} 季`:'';
  setCloudStatus('conflict');
  cloudDlg(`<h1>雲端和這台電腦的進度不一樣</h1>
    <p class="lead">另一台電腦在雲端存了新的進度，而這台電腦也有還沒上傳的變動。請選要保留哪一份，另一份會被蓋掉。</p>
    <div class="cl-cmp">
      <button class="cl-p" data-pick="remote"><b>用雲端的進度</b><span>${fmtTime(row.updated_at)} 存的</span><span>${(rp.coins||0).toLocaleString()} 金幣・積分 ${(rp.pts||0).toLocaleString()}</span></button>
      <button class="cl-p" data-pick="local"><b>用這台電腦的進度</b><span>上次同步 ${m.at?fmtTime(m.at):'—'} 之後有變動</span><span>${(lp.coins||0).toLocaleString()} 金幣・積分 ${(lp.pts||0).toLocaleString()}${yr?`・${yr}`:''}</span></button>
    </div>`);
  CLOUD.conflictRow=row;
}
$('#cloudDlgBody').addEventListener('click',async e=>{
  const b=e.target.closest('button'); if(!b) return;
  const uid=CLOUD.user&&CLOUD.user.id, key=uid&&cloudKey(uid);
  if(b.id==='clOut'){ $('#cloudDlg').hidden=true; return cloudLogout(); }
  if(b.dataset.up){                                             // 把本機玩家搬成雲端玩家
    const from=b.dataset.up; if(!PROFILES.list[from]) return;
    PROFILES.list[key]={...PROFILES.list[from], name:from}; delete PROFILES.list[from];
    await renameLeagueSave(from,key);
    setCloudMeta(uid,{rev:0, dirty:true});
    return reloadAs(key,`「${from}」已放上雲端`);
  }
  if(b.id==='clNew'){
    const n=$('#clNick').value.trim(); if(!n||n.length>12) return showCloudFirst('暱稱要 1～12 個字');
    PROFILES.list[key]={name:n, team:null, coins:START_COINS, pts:0, tier:0, w:0, l:0, t:0, settings:{...DEFAULT_SETTINGS, v2:true}, purchases:[], created:new Date().toISOString()};
    setCloudMeta(uid,{rev:0, dirty:true});
    if(DB_OWNER===null){ PROFILES.current=key; DB_OWNER=key; saveProfiles(); $('#cloudDlg').hidden=true; await saveLeague(); showHome(); toast(`歡迎加入，${n}！送你 ${START_COINS} 金幣，先選一支球隊吧`); return; }
    return reloadAs(key,`歡迎加入，${n}！送你 ${START_COINS} 金幣，先選一支球隊吧`);
  }
  if(b.dataset.pick==='remote'){ await applyRemote(CLOUD.conflictRow); return reloadAs(key,'已改用雲端上的進度'); }
  if(b.dataset.pick==='local'){ $('#cloudDlg').hidden=true; setCloudMeta(uid,{dirty:true}); return cloudPush(true,CLOUD.conflictRow.rev); }
});

/* ---------- 登入、登出 ---------- */
const cloudLoginErr=msg=>{const el=$('#cErr'); if(el) el.textContent=msg;};
async function cloudAuth(signup){
  const email=$('#cEmail').value.trim(), password=$('#cPass').value;
  if(!email||!password) return cloudLoginErr('請輸入 Email 和密碼');
  if(password.length<6) return cloudLoginErr('密碼至少 6 個字');
  cloudLoginErr(signup?'註冊中…':'登入中…');
  const {data,error}=signup?await CLOUD.sb.auth.signUp({email,password}):await CLOUD.sb.auth.signInWithPassword({email,password});
  if(error) return cloudLoginErr(error.message==='Invalid login credentials'?'Email 或密碼不對':error.message);
  if(!data.session) return cloudLoginErr('註冊成功！請到信箱點確認連結，再回來登入');
  CLOUD.user=data.session.user; $('#cPass').value=''; cloudLoginErr('');
  return cloudEnter();
}
async function cloudLogout(){
  if(cloudOn()&&cloudMeta(CLOUD.user.id).dirty){ clearTimeout(CLOUD.timer); await cloudPush(); }
  try{ await CLOUD.sb.auth.signOut(); }catch(e){}
  CLOUD.user=null; setCloudStatus('out');
  if(isCloudKey(PROFILES.current)){ PROFILES.current=null; saveProfiles(); }
  showHome();
}
// 刪除玩家（設定）時，雲端帳號的存檔也一起刪
async function cloudDeleteRemote(){
  if(!CLOUD.user) return;
  try{ await CLOUD.sb.from('saves').delete().eq('user_id',CLOUD.user.id); }catch(e){}
  try{ await CLOUD.sb.auth.signOut(); }catch(e){}
  setCloudMeta(CLOUD.user.id,{rev:0, dirty:false}); CLOUD.user=null;
}

/* ---------- 管理員（權限由資料庫判斷，見 supabase/admin.sql） ----------
   is_admin() 回答「我是不是管理員」；管理員可以列出所有玩家、改任何人的存檔。
   就算有人在網頁上把 CLOUD.admin 改成 true，資料庫的權限規則還是不會讓他讀寫別人的存檔。 */
async function cloudCheckAdmin(){
  CLOUD.admin=false;
  if(!CLOUD.user) return false;
  try{ const {data,error}=await CLOUD.sb.rpc('is_admin'); CLOUD.admin=!error&&data===true; }catch(e){}
  if(typeof renderMenu==='function'&&!$('#menu').hidden) renderMenu();
  return CLOUD.admin;
}
async function adminPlayers(){
  const {data,error}=await CLOUD.sb.rpc('admin_players'); if(error) throw error; return data||[];
}
// 改某位玩家的玩家資料（金幣、積分…）：rev 對得上才寫入，避免蓋掉玩家剛存的進度
async function adminSaveProfile(uid, rev, profile){
  if(uid===CLOUD.user.id){ Object.assign(me(),profile); saveProfiles(); renderMenu(); return {ok:true, msg:'已更新（你自己的帳號，會自動同步）'}; }
  const {data,error}=await CLOUD.sb.from('saves').update({profile, rev:rev+1, updated_at:new Date().toISOString()}).eq('user_id',uid).eq('rev',rev).select('rev');
  if(error) return {ok:false, msg:'寫入失敗：'+error.message};
  if(!data.length) return {ok:false, msg:'這位玩家剛剛存過檔，請重新整理清單再改'};
  return {ok:true, msg:`已更新 ${profile.name||''}，玩家下次開遊戲或切回視窗時就會看到`};
}
// 重置聯盟：雲端的聯盟清空，玩家的電腦會改成全新的聯盟（金幣、積分不變）
async function adminResetLeague(uid, rev){
  const {data,error}=await CLOUD.sb.from('saves').update({league:null, rev:rev+1, updated_at:new Date().toISOString()}).eq('user_id',uid).eq('rev',rev).select('rev');
  if(error) return {ok:false, msg:'寫入失敗：'+error.message};
  if(!data.length) return {ok:false, msg:'這位玩家剛剛存過檔，請重新整理清單再試'};
  return {ok:true, msg:'已重置這位玩家的聯盟'};
}
// 打開某位玩家的聯盟：下載到這台電腦，重新整理頁面後用管理員畫面編輯，改動直接存回他的雲端存檔
async function adminOpenLeague(uid, email, name){
  const {data,error}=await CLOUD.sb.from('saves').select('rev,league').eq('user_id',uid).maybeSingle();
  if(error) return {ok:false, msg:'讀取失敗：'+error.message};
  if(!data||!data.league) return {ok:false, msg:'這位玩家還沒有聯盟存檔'};
  await idbPut(await unpackBytes(data.league),leagueKey('adminview:'+uid));
  sessionStorage.setItem(ADMIN_VIEW,JSON.stringify({uid, email, name, rev:data.rev}));
  location.reload(); return {ok:true};
}
async function pushView(){
  const v=CLOUD.view; if(!v||!DB) return;
  if(CLOUD.busy){ clearTimeout(CLOUD.viewTimer); CLOUD.viewTimer=setTimeout(()=>pushView(),1000); return; }
  CLOUD.busy=true; CLOUD.viewPending=false; CLOUD.viewStatus='儲存到玩家的雲端存檔中…'; if(typeof adminViewStatus==='function') adminViewStatus();
  try{
    const league=await packBytes(DB.export());
    const {data,error}=await CLOUD.sb.from('saves').update({league, rev:v.rev+1, updated_at:new Date().toISOString()}).eq('user_id',v.uid).eq('rev',v.rev).select('rev');
    if(error) throw error;
    if(!data.length) CLOUD.viewStatus='⚠ 玩家剛剛也存了檔，這次修改沒有存上去。請按「結束編輯」後重新打開他的聯盟再改。';
    else { v.rev=data[0].rev; sessionStorage.setItem(ADMIN_VIEW,JSON.stringify(v)); CLOUD.viewStatus='✓ 已存回玩家的雲端存檔'; }
  }catch(e){ CLOUD.viewStatus='⚠ 存檔失敗（'+(e.message||e)+'），稍後再試'; }
  CLOUD.busy=false; if(typeof adminViewStatus==='function') adminViewStatus();
}
async function adminExitView(){
  clearTimeout(CLOUD.viewTimer); if(CLOUD.view&&DB&&CLOUD.viewPending) await pushView();
  const v=CLOUD.view; sessionStorage.removeItem(ADMIN_VIEW);
  if(v) await idbDel(leagueKey('adminview:'+v.uid)).catch(()=>{});
  location.reload();
}

/* ---------- 主選單與設定：同步狀態、登出 ---------- */
const _renderMenuCloud=renderMenu;
renderMenu=function(){
  _renderMenuCloud();
  if(!$('#pbar .pb-name')) return;
  if(cloudOn()){
    $('#pbar .pb-name').insertAdjacentHTML('beforeend',`<span class="pb-cloud" id="pbCloud"></span>`); setCloudStatus(CLOUD.status);
    $('#logout').onclick=()=>cloudLogout();
    if(CLOUD.recheck){ CLOUD.recheck=false; cloudCheck(); }
  }
};
const _openSettingsCloud=openSettings;
openSettings=function(){
  _openSettingsCloud();
  if(!CLOUD.sb) return;
  $('#settingsBody .set').insertAdjacentHTML('afterend',cloudOn()
    ?`<h2>雲端同步</h2><p class="tr-tip">已登入 <b>${esc(CLOUD.user.email||'')}</b>，進度會自動上傳；換電腦登入同一個帳號就能接著玩。</p>
      <div class="roster-btns"><button class="ghost" id="clSync">立即同步</button><button class="ghost" id="clLogout">登出雲端</button></div>`
    :`<h2>雲端同步</h2><p class="tr-tip">這位玩家只存在這台電腦。登出後在登入頁用雲端帳號登入，第一次會問要不要把這位玩家放上雲端。</p>`);
};
document.addEventListener('click',e=>{
  if(e.target.id==='clSync'){ setCloudMeta(CLOUD.user.id,{dirty:true}); cloudPush().then(()=>{const m=$('#setMsg'); if(m) m.textContent=STATUS_TXT[CLOUD.status];}); }
  if(e.target.id==='clLogout'){ $('#settings').hidden=true; cloudLogout(); }
});

/* ---------- 啟動 ---------- */
(async()=>{
  const cfg=window.CLOUD_CONFIG||{};
  if(!cfg.url||!cfg.anonKey||!window.supabase||!window.supabase.createClient) return;   // 沒設定：只用這台電腦
  CLOUD.sb=window.supabase.createClient(cfg.url,cfg.anonKey);
  $('#cloudBox').hidden=false;
  $('#cLogin').onclick=()=>cloudAuth(false);
  $('#cSignup').onclick=()=>cloudAuth(true);
  $('#cPass').addEventListener('keydown',e=>{if(e.key==='Enter')cloudAuth(false);});
  setCloudStatus('out');
  let session=null; try{session=(await CLOUD.sb.auth.getSession()).data.session;}catch(e){}
  if(CLOUD.view){                                              // 管理員編輯其他玩家的聯盟中
    if(session){ CLOUD.user=session.user; await cloudCheckAdmin(); }
    if(!CLOUD.admin){ sessionStorage.removeItem(ADMIN_VIEW); await idbDel(leagueKey('adminview:'+CLOUD.view.uid)).catch(()=>{}); location.reload(); return; }
    $('#menu').hidden=true; openAdmin('players'); return;
  }
  if(session){ CLOUD.user=session.user; renderMenu(); await cloudEnter(); cloudCheckAdmin();
    if(typeof marketSync==='function') setTimeout(()=>marketSync(),1500); }   // 玩家市場：收款、收卡（market.js）
  else if(isCloudKey(PROFILES.current)){ PROFILES.current=null; saveProfiles(); showHome(); }   // 雲端登入過期：回登入頁
  // 切回這個視窗、恢復網路、每分鐘：檢查別台電腦的新進度、補傳沒傳成功的變動
  document.addEventListener('visibilitychange',()=>{ if(!cloudOn()) return;
    if(document.hidden){ if(cloudMeta(CLOUD.user.id).dirty){clearTimeout(CLOUD.timer); cloudPush();} } else cloudCheck(); });
  addEventListener('online',()=>{ if(cloudOn()) cloudPush(); });
  setInterval(()=>{ if(cloudOn()&&cloudMeta(CLOUD.user.id).dirty&&!CLOUD.busy) cloudPush(); },60000);
})();
