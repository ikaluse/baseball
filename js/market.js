// market.js — 玩家市場：雲端玩家之間掛賣球員卡（交易市場裡的「玩家市場」分頁）
//   掛賣：卡片從自己的聯盟移出，交給雲端託管（supabase/market.sql 的 market 表）；最多同時 5 張，7 天沒賣掉自動退回。
//   購買：資料庫一次完成成交（同一張卡不會被兩個人買到），卡片加進自己的二軍，扣金幣。
//   賣家下次打開市場或登入時收款（扣 5% 手續費）；取消或過期的卡退回。每一筆處理過的都記在玩家檔案 mktDone，不會重複拿。
//   指定買家：填朋友的玩家代碼（帳號 id 前 8 碼），只有他看得到、買得到 —— 朋友之間可以用這個互相交易。
// 依賴：cloud.js（CLOUD、cloudOn、cloudKey）、trade.js（TR、renderTrade、P_、myTeam）、engine.js、home.js
'use strict';
const MARKET_FEE=0.05, MARKET_MAX=5, MARKET_MIN_KEEP=13;   // 手續費、同時掛賣上限、賣出後球隊至少要留的野手／投手人數
TR.mk={view:'browse', rows:null, kind:'all', rar:'all', sort:'new', q:'', sel:null, price:'', target:'', mine:null, hist:null, err:'', busy:false};
const mkOn=()=>typeof cloudOn==='function'&&cloudOn()&&DB_OWNER===cloudKey(CLOUD.user.id);
const myCode=()=>CLOUD.user.id.slice(0,8);
const mkNet=e=>({'not available':'這張卡已經被買走、下架或過期了','too many listings':`同時最多掛賣 ${MARKET_MAX} 張`,'bad price':'價格要在 100～9,999,999','login required':'要先登入雲端帳號'}[(e&&e.message||'').trim()]||'連線失敗：'+(e&&e.message||e));
const timeLeft=s=>{const ms=new Date(s)-Date.now(); if(ms<=0) return '已過期'; const h=Math.floor(ms/3600000); return h>=24?`${Math.ceil(ms/864e5)} 天`:h?`${h} 小時`:`${Math.ceil(ms/60000)} 分`;};

/* ---------- 卡片進出自己的聯盟 ---------- */
// 賣出：複製一份球員資料當作卡片，再從球隊移除
function cardOf(p){ const c=JSON.parse(JSON.stringify(p)); delete c.team; delete c.level; return c; }
function removeFromTeam(id){
  const t=myTeam(); t.roster=t.roster.filter(x=>x!==id); t.farm=t.farm.filter(x=>x!==id);
  delete LEAGUE.players[id]; fitRoster(LEAGUE,t,false);
}
// 買到或退回：給一個這個聯盟裡沒用過的編號，放進二軍（背號撞號會自動換）
function importCard(card){
  const t=myTeam(), nums=Object.keys(LEAGUE.players).map(id=>+id.slice(1)).filter(Number.isFinite);
  const id=(card.kind==='H'?'b':'p')+String(Math.max(0,...nums)+1).padStart(4,'0');
  const p=JSON.parse(JSON.stringify(card)); p.id=id; p.team=null; p.level=null;
  LEAGUE.players[id]=p; LEAGUE.freeAgents.push(id); movePlayer(LEAGUE,id,t.id,2);
  return p;
}
const sellCheck=p=>{
  const t=myTeam(), all=[...t.roster,...t.farm].filter(id=>id!==p.id).map(P_);
  if(all.filter(x=>x.kind==='H').length<MARKET_MIN_KEEP||all.filter(x=>x.kind==='P').length<MARKET_MIN_KEEP)
    return `賣掉後球隊的野手或投手會少於 ${MARKET_MIN_KEEP} 人`;
  return '';
};

/* ---------- 待處理：收款、退回的卡、買到的卡（開市場、登入時處理） ---------- */
async function marketSync(silent){
  if(!mkOn()) return null;
  const {data,error}=await CLOUD.sb.rpc('market_pending'); if(error||!data||!data.length) return null;
  const pf=me(), done=new Set(pf.mktDone||[]), ids=[], out={coins:0, sold:0, back:[], got:[]};
  for(const r of data){
    const key=r.what[0]+r.id; ids.push(r.id);
    if(done.has(key)) continue;
    if(r.what==='proceeds'){ const c=Math.floor(r.price*(1-MARKET_FEE)); pf.coins+=c; out.coins+=c; out.sold++; }
    else { const p=importCard(r.card); (r.what==='return'?out.back:out.got).push(p.name); }
    done.add(key);
  }
  pf.mktDone=[...done].slice(-400);
  saveProfiles(); await saveLeague(); renderSetup();
  await CLOUD.sb.rpc('market_ack',{p_ids:ids});
  const msg=[out.sold?`賣出 ${out.sold} 張，收入 ${out.coins.toLocaleString()} 金幣（已扣 ${MARKET_FEE*100}% 手續費）`:'',
    out.back.length?`退回 ${out.back.join('、')}（取消或過期）`:'', out.got.length?`收到 ${out.got.join('、')}`:''].filter(Boolean).join('；');
  if(msg&&!silent) toast('玩家市場：'+msg);
  return msg||null;
}

/* ---------- 畫面 ---------- */
function renderMarketTab(){
  const box=$('#tradeBody'), m=TR.mk;
  if(!mkOn()){ box.innerHTML=`<p class="lead">玩家市場要登入雲端帳號才能用：卡片會交給雲端託管，買賣雙方都要有帳號。</p>
    <p class="tr-tip">登出後在登入頁用雲端帳號登入（第一次會問要不要把這位玩家放上雲端）。</p>`; return; }
  const views=[['browse','逛市場'],['sell','掛賣球員'],['mine','我的掛單'],['hist','買賣紀錄']];
  box.innerHTML=`<div class="mk-top"><span class="coin"><em>●</em>${me().coins.toLocaleString()} 金幣</span>
      <span>我的玩家代碼 <b class="mk-code">${myCode().toUpperCase()}</b><button class="ghost sm" data-mk="copy">複製</button></span>
      <span class="tr-tip">朋友掛賣時填你的代碼，就只有你買得到</span></div>
    <div class="tm-kind mk-views">${views.map(([k,l])=>`<button class="${m.view===k?'sel':''}" data-mkv="${k}">${l}</button>`).join('')}</div>
    ${m.err?`<p class="tr-note bad">${esc(m.err)}</p>`:''}<div id="mkBody"></div>`;
  ({browse:mkBrowse, sell:mkSell, mine:mkMine, hist:mkHist})[m.view]();
}
const rarCell=c=>{const r=rarOf(c); return `<i class="rdot r-${r.id}"></i>${r.name}`;};
const cardCell=(c,i)=>`<button class="lnk" data-mkcard="${i}">${esc(c.name)}</button>${c.enh?` <em class="enh">+${c.enh}</em>`:''}`;
async function mkBrowse(){
  const m=TR.mk, el=$('#mkBody');
  const opt=(v,l,cur)=>`<option value="${v}"${v===cur?' selected':''}>${l}</option>`;
  el.innerHTML=`<div class="tr-fa-ctl mk-ctl">
      <label>類型<select data-mkf="kind">${opt('all','全部',m.kind)}${opt('H','野手',m.kind)}${opt('P','投手',m.kind)}</select></label>
      <label>稀有度<select data-mkf="rar">${opt('all','全部',m.rar)}${RARITY.map(r=>opt(r.id,r.name,m.rar)).join('')}</select></label>
      <label>排序<select data-mkf="sort">${opt('new','最新上架',m.sort)}${opt('cheap','價格低到高',m.sort)}${opt('ovr','總評高到低',m.sort)}</select></label>
      <label>姓名<input data-mkf="q" value="${esc(m.q)}" placeholder="搜尋"></label>
      <button class="ghost sm" data-mk="reload">重新整理</button></div>
    <div id="mkList"><p class="lead">讀取中…</p></div>`;
  let q=CLOUD.sb.from('market').select('id,seller,seller_name,card,price,target_code,expires_at,created_at').eq('status','open').gt('expires_at',new Date().toISOString());
  if(m.kind!=='all') q=q.eq('kind',m.kind);
  if(m.rar!=='all') q=q.eq('rar',m.rar);
  if(m.q) q=q.ilike('name',`%${m.q}%`);
  q=m.sort==='cheap'?q.order('price',{ascending:true}):m.sort==='ovr'?q.order('ovr',{ascending:false}):q.order('created_at',{ascending:false});
  const {data,error}=await q.limit(80);
  if(TR.tab!=='market'||m.view!=='browse') return;
  if(error){ $('#mkList').innerHTML=`<p class="tr-note bad">${esc(mkNet(error))}（還沒在 Supabase 執行 supabase/market.sql 的話，請先執行）</p>`; return; }
  m.rows=data||[];
  const t=myTeam(), room=ROSTER_MAX-teamSize(t), uid=CLOUD.user.id;
  $('#mkList').innerHTML=m.rows.length?`<div class="tr-list tall"><table class="box tr-t mk-t"><tr><th>球員</th><th>位置</th><th>總評</th><th>稀有度</th><th>年齡</th><th>賣家</th><th>剩餘</th><th>價格</th><th></th></tr>
    ${m.rows.map((r,i)=>{const c=r.card, mine=r.seller===uid;
      return `<tr><td>${cardCell(c,i)}${r.target_code&&!mine?' <em class="mk-priv">指定給你</em>':r.target_code?` <em class="mk-priv">指定 ${r.target_code.toUpperCase()}</em>`:''}</td><td>${posAbbr(c)}</td><td><b>${c.ovr}</b></td><td>${rarCell(c)}</td><td>${c.age}</td>
        <td>${esc(r.seller_name||'')}</td><td>${timeLeft(r.expires_at)}</td><td class="mk-price">● ${r.price.toLocaleString()}</td>
        <td>${mine?'<small>你的</small>':`<button class="hot-btn sm" data-mkbuy="${i}" ${me().coins<r.price||room<1?'disabled':''}>購買</button>`}</td></tr>`;}).join('')}</table></div>
    ${room<1?`<p class="tr-note bad">名單已滿（${ROSTER_MAX} 人），先釋出球員才能買。</p>`:''}`
    :'<p class="lead">目前沒有符合條件的掛單。</p>';
}
function mkSell(){
  const m=TR.mk, t=myTeam(), ids=[...t.roster,...t.farm].sort((a,b)=>P_(b).ovr-P_(a).ovr);
  if(!ids.includes(m.sel)) m.sel=null;
  const p=m.sel&&P_(m.sel), err=p?sellCheck(p):'', price=+m.price||0, net=Math.floor(price*(1-MARKET_FEE));
  $('#mkBody').innerHTML=`<div class="tm-grid"><section>
      <div class="tr-list tall"><table class="box tr-t tm-t">${pHead(false)}${ids.map(id=>pRow(P_(id),{sel:id===m.sel}).replace('<tr ','<tr data-mksel="1" ')).join('')}</table></div>
    </section><section class="tm-side">${p?`${miniCard(p)}
      <label class="mk-f">價格（金幣）<input type="number" data-mkp="price" min="100" max="9999999" step="50" value="${esc(m.price)}" placeholder="100～9,999,999"></label>
      <label class="mk-f">指定買家的玩家代碼（選填）<input data-mkp="target" maxlength="8" value="${esc(m.target)}" placeholder="空白＝所有人都能買"></label>
      <p class="tr-tip"><span id="mkNetTxt">${price>=100?`賣出後你會收到 <b>${net.toLocaleString()}</b> 金幣（扣 ${MARKET_FEE*100}% 手續費）。`:''}</span>掛賣時這張卡會先從你的球隊移出，交給市場保管；7 天沒賣掉或取消就退回。同時最多 ${MARKET_MAX} 張。
        參考：商城單抽 ${GACHA.single} 金幣。</p>
      ${err?`<p class="tr-note bad">${esc(err)}</p>`:''}
      <button class="hot-btn" data-mk="sell" ${err||price<100||m.busy?'disabled':''}>掛賣 ${esc(p.name)}</button>`
      :'<p class="lead">點左邊的球員選擇要賣的卡。</p>'}</section></div>`;
}
async function mkMine(){
  const el=$('#mkBody'); el.innerHTML='<p class="lead">讀取中…</p>';
  const {data,error}=await CLOUD.sb.from('market').select('id,card,price,target_code,expires_at,created_at').eq('seller',CLOUD.user.id).eq('status','open').order('created_at',{ascending:false});
  if(TR.tab!=='market'||TR.mk.view!=='mine') return;
  if(error){ el.innerHTML=`<p class="tr-note bad">${esc(mkNet(error))}</p>`; return; }
  TR.mk.mine=data||[];
  el.innerHTML=TR.mk.mine.length?`<p class="tr-tip">掛賣中 ${TR.mk.mine.length}／${MARKET_MAX} 張。取消後卡片會退回你的二軍。</p>
    <table class="box tr-t mk-t"><tr><th>球員</th><th>總評</th><th>稀有度</th><th>價格</th><th>指定買家</th><th>剩餘</th><th></th></tr>
    ${TR.mk.mine.map((r,i)=>`<tr><td>${esc(r.card.name)}</td><td><b>${r.card.ovr}</b></td><td>${rarCell(r.card)}</td><td class="mk-price">● ${r.price.toLocaleString()}</td>
      <td>${r.target_code?r.target_code.toUpperCase():'—'}</td><td>${timeLeft(r.expires_at)}</td><td><button class="ghost sm warn" data-mkcancel="${i}">取消</button></td></tr>`).join('')}</table>`
    :'<p class="lead">目前沒有掛賣中的卡。</p>';
}
async function mkHist(){
  const el=$('#mkBody'), uid=CLOUD.user.id; el.innerHTML='<p class="lead">讀取中…</p>';
  const {data,error}=await CLOUD.sb.from('market').select('id,seller,buyer,seller_name,buyer_name,card,price,status,sold_at,created_at').neq('status','open')
    .or(`seller.eq.${uid},buyer.eq.${uid}`).order('created_at',{ascending:false}).limit(60);
  if(TR.tab!=='market'||TR.mk.view!=='hist') return;
  if(error){ el.innerHTML=`<p class="tr-note bad">${esc(mkNet(error))}</p>`; return; }
  const fmt=s=>s?new Date(s).toLocaleString('zh-TW',{hour12:false,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit'}):'';
  el.innerHTML=data&&data.length?`<table class="box tr-t mk-t"><tr><th>時間</th><th>買／賣</th><th>球員</th><th>總評</th><th>價格</th><th>對方</th></tr>
    ${data.map(r=>{const sold=r.status==='sold', iSold=r.seller===uid;
      return `<tr><td>${fmt(r.sold_at||r.created_at)}</td><td>${!sold?'已下架':iSold?'<b class="up">賣出</b>':'<b class="dn">買入</b>'}</td><td>${esc(r.card.name)}</td><td>${r.card.ovr}</td>
        <td class="mk-price">● ${r.price.toLocaleString()}${sold&&iSold?`<small>（實收 ${Math.floor(r.price*(1-MARKET_FEE)).toLocaleString()}）</small>`:''}</td><td>${esc(sold?(iSold?r.buyer_name:r.seller_name)||'':'')}</td></tr>`;}).join('')}</table>`
    :'<p class="lead">還沒有買賣紀錄。</p>';
}

/* ---------- 動作 ---------- */
async function mkDoSell(){
  const m=TR.mk, p=P_(m.sel), price=Math.round(+m.price||0), target=(m.target||'').trim().toLowerCase();
  if(!p||sellCheck(p)||price<100) return;
  if(target&&!/^[0-9a-f]{8}$/.test(target)){ m.err='玩家代碼是 8 個英文或數字（0～9、A～F）'; return renderTrade(); }
  if(target===myCode()){ m.err='不能指定給自己'; return renderTrade(); }
  if(!confirm(`以 ${price.toLocaleString()} 金幣掛賣 ${p.name}？${target?`（只有玩家代碼 ${target.toUpperCase()} 買得到）`:''}\n卡片會先從你的球隊移出。`)) return;
  m.busy=true; m.err='';
  // 先從自己的聯盟移出並存檔，再交給市場；市場拒絕就放回來（不會出現一張卡同時在兩邊）
  const card=cardOf(p); removeFromTeam(p.id); await saveLeague();
  const {error}=await CLOUD.sb.rpc('market_sell',{p_card:card, p_price:price, p_seller_name:me().name, p_target:target||null});
  if(error){ importCard(card); await saveLeague(); m.err=mkNet(error); }
  else { TR.note={ok:true, msg:`已掛賣 ${card.name}（● ${price.toLocaleString()}）`}; m.sel=null; m.price=''; m.target=''; m.view='mine'; }
  m.busy=false; renderSetup(); renderTrade();
}
async function mkDoBuy(r){
  const pf=me(), t=myTeam();
  if(pf.coins<r.price||teamSize(t)>=ROSTER_MAX) return;
  if(!confirm(`用 ${r.price.toLocaleString()} 金幣買下 ${r.card.name}（總評 ${r.card.ovr}・${rarOf(r.card).name}）？會放進你的二軍。`)) return;
  const {data,error}=await CLOUD.sb.rpc('market_buy',{p_id:r.id, p_buyer_name:pf.name});
  if(error){ TR.mk.err=mkNet(error); return mkRefresh(); }
  pf.coins-=data.price;
  const p=importCard(data.card); pf.mktDone=[...(pf.mktDone||[]),'p'+data.id].slice(-400);
  saveProfiles(); await saveLeague(); renderSetup();
  await CLOUD.sb.rpc('market_ack',{p_ids:[data.id]});
  TR.note={ok:true, msg:`買下 ${p.name}！已放進二軍（花了 ${data.price.toLocaleString()} 金幣）`}; TR.mk.err='';
  mkRefresh();
}
async function mkDoCancel(r){
  if(!confirm(`取消掛賣 ${r.card.name}？卡片會退回你的二軍。`)) return;
  const {error}=await CLOUD.sb.rpc('market_cancel',{p_id:r.id});
  if(error){ TR.mk.err=mkNet(error); return mkRefresh(); }
  const msg=await marketSync(true);
  TR.note={ok:true, msg:msg||`已取消 ${r.card.name}`}; mkRefresh();
}
function mkRefresh(){ TR.mk.rows=null; renderTrade(); }
function mkShowCard(c){ $('#cardBody').innerHTML=cardHTML(c)+`<button class="go" id="cardClose">關閉</button>`; $('#cardm').hidden=false; }

$('#tradeBody').addEventListener('click',async e=>{
  if(TR.tab!=='market') return;
  const el=s=>e.target.closest(s), m=TR.mk;
  if(el('[data-mkv]')){ m.view=el('[data-mkv]').dataset.mkv; m.err=''; TR.note=null; return renderTrade(); }
  const k=el('[data-mk]')&&el('[data-mk]').dataset.mk;
  if(k==='copy'){ try{await navigator.clipboard.writeText(myCode().toUpperCase()); toast('已複製玩家代碼');}catch(err){} return; }
  if(k==='reload') return mkRefresh();
  if(k==='sell') return mkDoSell();
  if(el('[data-mkcard]')) return mkShowCard(m.rows[+el('[data-mkcard]').dataset.mkcard].card);
  if(el('[data-mkbuy]')) return mkDoBuy(m.rows[+el('[data-mkbuy]').dataset.mkbuy]);
  if(el('[data-mkcancel]')) return mkDoCancel(m.mine[+el('[data-mkcancel]').dataset.mkcancel]);
  const row=el('tr[data-mksel]'); if(row&&!el('[data-card]')){ m.sel=row.dataset.id; m.err=''; return renderTrade(); }
},true);
$('#tradeBody').addEventListener('change',e=>{
  if(TR.tab!=='market') return;
  const f=e.target.dataset.mkf; if(f&&f!=='q'){ TR.mk[f]=e.target.value; mkRefresh(); }
});
$('#tradeBody').addEventListener('input',e=>{
  if(TR.tab!=='market') return;
  // 輸入價格時只更新按鈕和「會收到多少」，不重畫（才不會打斷輸入）
  const k=e.target.dataset.mkp; if(k){ TR.mk[k]=e.target.value; if(k==='price'){ const b=$('[data-mk="sell"]'), p=TR.mk.sel&&P_(TR.mk.sel), v=Math.round(+e.target.value||0);
    if(b) b.disabled=!p||!!sellCheck(p)||v<100;
    const n=$('#mkNetTxt'); if(n) n.innerHTML=v>=100?`賣出後你會收到 <b>${Math.floor(v*(1-MARKET_FEE)).toLocaleString()}</b> 金幣（扣 ${MARKET_FEE*100}% 手續費）。`:''; } }
  if(e.target.dataset.mkf==='q'){ clearTimeout(TR.mk.qt); TR.mk.qt=setTimeout(()=>{TR.mk.q=e.target.value.trim(); mkRefresh(); const i=$('[data-mkf="q"]'); if(i){i.focus(); i.setSelectionRange(i.value.length,i.value.length);}},400); }
});

// 打開交易市場、雲端登入完成時，順便處理待收的款項與卡片
const _openTradeMk=openTrade;
openTrade=function(){ _openTradeMk(); marketSync(); };
