// db.js — 球員資料庫：用 sql.js 在瀏覽器裡開 SQLite，組出遊戲用的 LEAGUE。
// 資料有變動（輪值、交易、升降二軍）時用 saveLeague() 寫回 SQLite，並把整個資料庫存進瀏覽器的 IndexedDB。
// 來源優先順序：瀏覽器存檔 → data/players_db.js 內建資料庫 → 沒有 sql.js 時改用 engine.js 的產生器（同一個亂數種子，球員相同）
// 依賴：engine.js；index.html 會等 window.DB_READY 完成才載入 ui.js
'use strict';
const SQLJS_CDN='https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.3/';
let DB=null, LEAGUE=null, DB_SOURCE='';
const TX_TABLE=`CREATE TABLE IF NOT EXISTS transactions(
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, type TEXT, team_a TEXT, team_b TEXT, a_out TEXT, b_out TEXT)`;
// 累積成績（排行榜）：一位球員一列，欄位就是 engine.js 的 STAT_KEYS
const STATS_TABLE=`CREATE TABLE IF NOT EXISTS player_stats(player_id TEXT PRIMARY KEY, ${STAT_KEYS.map(k=>`${k} INTEGER NOT NULL DEFAULT 0`).join(', ')})`;
// 每位玩家各自一份聯盟存檔（球隊、隊名、賽程、抽到的卡都分開），存在 IndexedDB 的 'league:暱稱'。
// DB_OWNER＝目前載入的是哪位玩家的聯盟；換玩家登入時 home.js 會重新整理頁面，改載入那位玩家的存檔。
// 舊版所有玩家共用 'players.sqlite'：改版當下已經存在的玩家，第一次載入時各自繼承一份（LEGACY_HEIRS）。
const IDB_NAME='baseball-league', LEGACY_KEY='players.sqlite', LEGACY_HEIRS='baseball-legacy-heirs';
const leagueKey=name=>'league:'+name;
// 管理員正在編輯其他玩家的聯盟（cloud.js 的 adminOpenLeague）時，改載入 'league:adminview:玩家帳號id'
let DB_OWNER=(()=>{
  try{const v=JSON.parse(sessionStorage.getItem('baseball-admin-view')); if(v&&v.uid) return 'adminview:'+v.uid;}catch(e){}
  try{return JSON.parse(localStorage.getItem('baseball-profiles')).current||null;}catch(e){return null;}
})();

function idb(mode, fn){
  return new Promise((res,rej)=>{
    const rq=indexedDB.open(IDB_NAME,1);
    rq.onupgradeneeded=()=>rq.result.createObjectStore('files');
    rq.onerror=()=>rej(rq.error);
    rq.onsuccess=()=>{const tx=rq.result.transaction('files',mode), r=fn(tx.objectStore('files'));
      tx.oncomplete=()=>{rq.result.close(); res(r&&r.result);}; tx.onerror=()=>rej(tx.error);};
  });
}
const idbGet=key=>idb('readonly',s=>s.get(key));
const idbPut=(bytes,key)=>idb('readwrite',s=>s.put(bytes,key));
const idbDel=key=>idb('readwrite',s=>s.delete(key));
// 舊的共用存檔要給誰繼承：第一次執行新版時，把當時所有玩家記下來；每人繼承一次，全部繼承完就刪掉舊檔
async function legacySave(owner){
  let heirs=null; try{heirs=JSON.parse(localStorage.getItem(LEGACY_HEIRS));}catch(e){}
  if(!Array.isArray(heirs)){ try{heirs=Object.keys(JSON.parse(localStorage.getItem('baseball-profiles')).list);}catch(e){heirs=[];} }
  const b=heirs.includes(owner)?await idbGet(LEGACY_KEY).catch(()=>null):null;
  heirs=heirs.filter(n=>n!==owner);
  try{localStorage.setItem(LEGACY_HEIRS,JSON.stringify(heirs));}catch(e){}
  if(!heirs.length) idbDel(LEGACY_KEY).catch(()=>{});
  return b;
}
function b64bytes(b64){const s=atob(b64), u=new Uint8Array(s.length); for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i); return u;}
function rows(sql,params=[]){const st=DB.prepare(sql); st.bind(params); const out=[]; while(st.step())out.push(st.getAsObject()); st.free(); return out;}
const metaOf=db=>{try{const r=db.exec("SELECT value FROM meta WHERE key='created'"); return r[0].values[0][0];}catch(e){return null;}};

// SQLite → 和 buildLeague() 相同形狀的 LEAGUE
function leagueFromDB(){
  const players={};
  for(const r of rows('SELECT * FROM players')){
    const p={id:r.id, name:r.name, kind:r.kind, team:r.team_id, level:r.level, num:r.num, age:r.age, tier:r.tier,
      ovr:r.ovr, pot:r.pot, salary:r.salary, years:r.years, height:r.height, weight:r.weight, hometown:r.hometown,
      pos:r.pos, bats:r.bats, throws:r.throws, enh:r.enh||0, rar:r.rar||null};
    if(r.kind==='H') Object.assign(p,{alt:r.alt?r.alt.split(','):[], pow:r.pow, con:r.con, eye:r.eye, spd:r.spd, fld:r.fld, thr:r.thr, arm:r.arm, hz:JSON.parse(r.hot_zone)});
    else Object.assign(p,{prole:r.prole, velo:r.velo, ctrl:r.ctrl, stam:r.stam, pitches:[]});
    players[p.id]=p;
  }
  for(const r of rows('SELECT * FROM pitches ORDER BY player_id, ord')) players[r.player_id].pitches.push({n:r.name, r:r.rating});
  // 舊資料補上「每位投手都要有四縫線、二縫線或伸卡」的規則，並寫回資料庫
  Object.values(players).forEach(p=>{ if(p.kind==='P'&&ensureBaseFastball(p))
    p.pitches.forEach((x,i)=>DB.run('UPDATE pitches SET name=? WHERE player_id=? AND ord=?',[x.n,p.id,i])); });
  const teams=rows('SELECT * FROM teams ORDER BY sort').map(r=>({...(TEAM_DEFS.find(d=>d.id===r.id)||{}),
    id:r.id, name:r.name, short:r.short, color:r.color, park:r.park, note:r.note, rotIdx:r.rot_idx, gp:r.gp||0, roster:[], farm:[]}));
  const freeAgents=[];
  Object.values(players).forEach(p=>{const t=teams.find(x=>x.id===p.team); if(!t)freeAgents.push(p.id); else (p.level===2?t.farm:t.roster).push(p.id);});
  const log=rows('SELECT * FROM transactions ORDER BY id').map(r=>({at:r.at, type:r.type, a:r.team_a, b:r.team_b, aOut:JSON.parse(r.a_out), bOut:JSON.parse(r.b_out)}));
  const stats={};
  for(const r of rows('SELECT * FROM player_stats')) if(players[r.player_id]) stats[r.player_id]=Object.fromEntries(STAT_KEYS.map(k=>[k,r[k]||0]));
  const L={players, teams, freeAgents, log, logSaved:log.length, stats};
  try{const r=rows("SELECT value FROM meta WHERE key='season'")[0]; if(r) L.season=JSON.parse(r.value);}catch(e){}
  teams.forEach(t=>{autoLineup(L,t); autoStaff(L,t);});
  return L;
}

window.DB_READY=(async()=>{
  try{
    if(typeof initSqlJs!=='function') throw new Error('sql.js 沒有載入（可能沒有網路）');
    if(!window.PLAYERS_DB_B64) throw new Error('找不到 data/players_db.js');
    const SQL=await initSqlJs({locateFile:f=>SQLJS_CDN+f});
    const bundled=new SQL.Database(b64bytes(window.PLAYERS_DB_B64));
    // 還沒登入（DB_OWNER 是 null）就先用內建資料，不讀也不寫任何玩家的存檔
    let saved=null, inherited=false;
    if(DB_OWNER) try{let b=await idbGet(leagueKey(DB_OWNER)); if(!b){b=await legacySave(DB_OWNER); inherited=!!b;} if(b)saved=new SQL.Database(new Uint8Array(b));}catch(e){}
    // 重新產生過資料庫（created 不同）時，舊存檔作廢
    if(saved&&metaOf(saved)===metaOf(bundled)){DB=saved; bundled.close(); DB_SOURCE='saved';}
    else {if(saved){saved.close(); idbDel(leagueKey(DB_OWNER)).catch(()=>{});} DB=bundled; DB_SOURCE='bundled';}
    DB.run(TX_TABLE); // 舊版資料庫沒有交易紀錄表
    DB.run(STATS_TABLE);
    const scols=rows("PRAGMA table_info(player_stats)").map(r=>r.name);
    STAT_KEYS.filter(k=>!scols.includes(k)).forEach(k=>DB.run(`ALTER TABLE player_stats ADD COLUMN ${k} INTEGER NOT NULL DEFAULT 0`));
    if(!rows("PRAGMA table_info(teams)").some(r=>r.name==='gp')) DB.run('ALTER TABLE teams ADD COLUMN gp INTEGER NOT NULL DEFAULT 0');   // 球隊出賽場數
    const cols=rows("PRAGMA table_info(players)").map(r=>r.name);
    if(!cols.includes('enh')) DB.run('ALTER TABLE players ADD COLUMN enh INTEGER NOT NULL DEFAULT 0'); // 強化等級
    const needRar=!cols.includes('rar');
    if(needRar) DB.run('ALTER TABLE players ADD COLUMN rar TEXT');                                    // 卡片稀有度
    LEAGUE=leagueFromDB();
    // 舊存檔第一次載入：聯盟原有球員（編號 1000 以內）壓到稀有以下；之後抽到或新增的球員保留原本的稀有度
    if(needRar||Object.values(LEAGUE.players).some(p=>!p.rar)){
      Object.values(LEAGUE.players).forEach(p=>{ if(p.rar)return; if(+p.id.slice(1)<=LEAGUE_SIZE) capLeaguePlayer(p); else p.rar=rarityOf(p.ovr).id; });
      LEAGUE.teams.forEach(t=>{autoLineup(LEAGUE,t); autoStaff(LEAGUE,t);});
      await saveLeague();
    }
    // 能力上限 150 的改版（只做一次，記在 meta 的 scale150）：
    // 舊的完美～神話卡換算到新的總評範圍；球速壓到稀有度上限（白 81、綠 88、藍 94 mph…），控球與球種補回總評
    let scaled=null; try{scaled=DB.exec("SELECT value FROM meta WHERE key='scale150'")[0];}catch(e){}
    if(!scaled){
      Object.values(LEAGUE.players).forEach(p=>{upliftOldCard(p); fitRarityCaps(p);});
      LEAGUE.teams.forEach(t=>{autoLineup(LEAGUE,t); autoStaff(LEAGUE,t);});
      DB.run("INSERT OR REPLACE INTO meta(key,value) VALUES('scale150','1')");
      await saveLeague();
    }
    if(!LEAGUE.season){LEAGUE.season=newSeason(LEAGUE,1); await saveLeague();}   // 第一季的賽程
    if(inherited&&DB_SOURCE!=='bundled') await persistDB();                      // 繼承來的舊共用存檔，馬上存成自己的一份
  }catch(e){
    console.warn('球員資料庫無法開啟，改用內建產生器：',e);
    DB=null; DB_SOURCE='generated'; LEAGUE=buildLeague();
    Object.values(LEAGUE.players).forEach(capLeaguePlayer);   // 和資料庫一樣壓到稀有以下、球速照稀有度上限
    LEAGUE.teams.forEach(t=>{autoLineup(LEAGUE,t); autoStaff(LEAGUE,t);});
    LEAGUE.season=newSeason(LEAGUE,1);
  }
})();

// 把記憶體中的變動寫回 SQLite（輪值進度、所屬球隊、一二軍、背號、合約、能力、強化等級、交易紀錄）並存進瀏覽器
async function saveLeague(){
  if(!DB) return false;
  const n=v=>v===undefined||(typeof v==='number'&&!Number.isFinite(v))?null:v;   // 沒填的欄位存成 NULL
  DB.run('BEGIN');
  try{
    // 球隊：名稱、配色、主場、輪值進度
    const ts=DB.prepare('UPDATE teams SET name=?, short=?, color=?, park=?, note=?, rot_idx=?, gp=? WHERE id=?');
    LEAGUE.teams.forEach(t=>ts.run([n(t.name), n(t.short), n(t.color), n(t.park), n(t.note), n(t.rotIdx), t.gp||0, t.id])); ts.free();
    // 累積成績：整批重寫（被合成消耗、刪除的球員一起清掉）
    DB.run('DELETE FROM player_stats');
    const ss=DB.prepare(`INSERT INTO player_stats(player_id,${STAT_KEYS.join(',')}) VALUES (?,${STAT_KEYS.map(()=>'?').join(',')})`);
    Object.entries(LEAGUE.stats||{}).forEach(([id,s])=>{ if(LEAGUE.players[id]) ss.run([id,...STAT_KEYS.map(k=>s[k]||0)]); }); ss.free();
    // 聯賽（賽程、比分、季後賽、歷屆冠軍）整份存成 JSON
    if(LEAGUE.season) DB.run("INSERT OR REPLACE INTO meta(key,value) VALUES('season',?)",[JSON.stringify(LEAGUE.season)]);
    // 球員與球種整批重寫：新增、刪除、任何欄位的修改（管理員編輯、交易、訓練、強化、抽卡）都會存進去
    DB.run('DELETE FROM pitches'); DB.run('DELETE FROM players');
    const st=DB.prepare(`INSERT INTO players(id,name,kind,team_id,level,num,age,tier,ovr,pot,salary,years,height,weight,hometown,
      pos,alt,bats,throws,pow,con,eye,spd,fld,thr,arm,hot_zone,prole,velo,ctrl,stam,enh,rar) VALUES (${Array(33).fill('?').join(',')})`);
    const ps=DB.prepare('INSERT INTO pitches(player_id,ord,name,rating) VALUES (?,?,?,?)');
    Object.values(LEAGUE.players).forEach(p=>{
      st.run([p.id, n(p.name), n(p.kind), n(p.team), n(p.level), n(p.num), n(p.age), n(p.tier), n(p.ovr), n(p.pot), n(p.salary), n(p.years),
        n(p.height), n(p.weight), n(p.hometown), n(p.pos), p.alt?p.alt.join(','):null, n(p.bats), n(p.throws),
        n(p.pow), n(p.con), n(p.eye), n(p.spd), n(p.fld), n(p.thr), n(p.arm), p.hz?JSON.stringify(p.hz):null,
        n(p.prole), n(p.velo), n(p.ctrl), n(p.stam), p.enh||0, n(p.rar)]);
      (p.pitches||[]).forEach((x,i)=>ps.run([p.id, i, n(x.n), n(x.r)]));
    });
    st.free(); ps.free();
    const tx=DB.prepare('INSERT INTO transactions(at,type,team_a,team_b,a_out,b_out) VALUES (?,?,?,?,?,?)');
    LEAGUE.log.slice(LEAGUE.logSaved||0).forEach(e=>tx.run([n(e.at), n(e.type), n(e.a), n(e.b), JSON.stringify(e.aOut), JSON.stringify(e.bOut)]));
    tx.free(); LEAGUE.logSaved=LEAGUE.log.length;
    DB.run('COMMIT');
  }catch(e){
    try{DB.run('ROLLBACK');}catch(_){}    // 存檔失敗就整筆退回，資料庫維持上一次的狀態
    console.error('存檔失敗',e); return false;
  }
  return persistDB();
}
// 把目前的資料庫存進瀏覽器（存到目前玩家自己的存檔；還沒登入就不存）
async function persistDB(){
  if(!DB||!DB_OWNER) return false;
  try{await idbPut(DB.export(),leagueKey(DB_OWNER)); DB_SOURCE='saved';}catch(e){console.warn('存檔失敗',e); return false;}
  if(typeof cloudDirty==='function') cloudDirty();   // 雲端玩家：排程上傳（cloud.js）
  return true;
}
// 直接改過 SQLite 之後（管理員的 SQL 主控台），重新從資料庫組出 LEAGUE
function reloadLeague(){ LEAGUE=leagueFromDB(); return LEAGUE; }
async function resetLeague(){ if(DB_OWNER) try{await idbDel(leagueKey(DB_OWNER));}catch(e){} location.reload(); }
// 玩家改暱稱：存檔跟著搬到新名字；刪除玩家：存檔一起刪
async function renameLeagueSave(from,to){ const was=DB_OWNER===from; if(was) DB_OWNER=to;
  try{const b=await idbGet(leagueKey(from)); if(b) await idbPut(b,leagueKey(to)); await idbDel(leagueKey(from));}catch(e){}
  if(was) await persistDB(); }
async function deleteLeagueSave(name){ try{await idbDel(leagueKey(name));}catch(e){} }
function exportLeague(){
  if(!DB) return;
  const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob([DB.export()],{type:'application/x-sqlite3'}));
  a.download='players.sqlite'; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href),1000);
}

// 球員查詢（資料庫畫面用）。f={team:'all'|'fa'|球隊id, level:'all'|'1'|'2', type:'all'|'H'|'P'|守備位置|'SP'|'RP'|'CL', q:姓名, sort}
const SORTS={ovr:'ovr DESC, pot DESC', pot:'pot DESC, ovr DESC', young:'age ASC, pot DESC', salary:'salary DESC, ovr DESC', num:'num ASC'};
function queryPlayers(f, limit, offset){
  if(DB){
    const w=[], a=[];
    if(f.team==='fa') w.push('team_id IS NULL'); else if(f.team!=='all'){w.push('team_id=?'); a.push(f.team);}
    if(f.level!=='all'){w.push('level=?'); a.push(+f.level);}
    if(f.type==='H'||f.type==='P'){w.push('kind=?'); a.push(f.type);}
    else if(['SP','RP','CL'].includes(f.type)){w.push('prole=?'); a.push(f.type);}
    else if(f.type!=='all'){w.push("kind='H' AND pos=?"); a.push(f.type);}
    if(f.q){w.push('(name LIKE ? OR id LIKE ?)'); a.push('%'+f.q+'%','%'+f.q+'%');}
    if(f.rar&&f.rar!=='all'){w.push('rar=?'); a.push(f.rar);}
    const where=w.length?' WHERE '+w.join(' AND '):'';
    const total=rows('SELECT COUNT(*) AS c FROM players'+where,a)[0].c;
    const ids=rows(`SELECT id FROM players${where} ORDER BY ${SORTS[f.sort]||SORTS.ovr} LIMIT ? OFFSET ?`,[...a,limit,offset]).map(r=>r.id);
    return {total, ids};
  }
  // 沒有 sql.js 時的同等查詢
  const ok=p=>(f.team==='all'||(f.team==='fa'?!p.team:p.team===f.team))&&(f.level==='all'||p.level===+f.level)
    &&(f.type==='all'||(f.type==='H'||f.type==='P'?p.kind===f.type:['SP','RP','CL'].includes(f.type)?p.prole===f.type:p.kind==='H'&&p.pos===f.type))
    &&(!f.q||p.name.includes(f.q)||p.id.includes(f.q))&&(!f.rar||f.rar==='all'||rarOf(p).id===f.rar);
  const key={ovr:p=>-p.ovr*100-p.pot, pot:p=>-p.pot*100-p.ovr, young:p=>p.age*100-p.pot, salary:p=>-p.salary, num:p=>p.num}[f.sort]||(p=>-p.ovr);
  const list=Object.values(LEAGUE.players).filter(ok).sort((a,b)=>key(a)-key(b));
  return {total:list.length, ids:list.slice(offset,offset+limit).map(p=>p.id)};
}
