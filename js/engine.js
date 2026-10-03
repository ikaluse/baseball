// engine.js — 比賽引擎（不依賴畫面，可在瀏覽器或 Node.js 執行）
// 球種資料、球員產生、投球/揮棒/擊球判定、跑壘與計分、AI 投打
// ===== ENGINE START =====
// 球種定義：v=相對直球球速, hb=臂側水平位移(ft, 正=往投手臂側；左右投相反), vb=垂直位移(ft, 正=上竄), late=晚變指數, cost=體力消耗倍率
// 速球類另有：lift=自轉產生的升力佔重力的比例（逆旋越強越抗重力，軌跡越平）、la=被擊中時仰角的偏移（伸卡、二縫線容易打成滾地球）
//   四縫線：強烈逆旋 → 上竄尾勁、略帶臂側位移；投在高處時進壘角度平，打者容易打在球下方
//   二縫線：自轉效率低 → 明顯臂側位移＋自然下沉
//   伸卡：側旋更多 → 進壘前往臂側竄、下墜最多，打者容易打到球的上半部
const PITCH_DEFS = {
  '四縫線':      {v:1.00, hb:0.30, vb:0.24, late:2.0, cost:1.00, fam:'FB', lift:0.55, la:3},
  '二縫線':      {v:0.97, hb:0.62, vb:-0.26, late:2.2, cost:1.00, fam:'FB', lift:0.26, la:-3},
  '上升快速球':  {v:1.005,hb:0.15, vb:0.42, late:2.4, cost:1.05, fam:'FB', lift:0.66, la:4},
  '噴射球':      {v:0.96, hb:0.45, vb:-0.18, late:3.0, cost:1.05, fam:'FB', lift:0.30, la:-2},
  '伸卡':        {v:0.96, hb:0.70, vb:-0.56, late:2.4, cost:1.05, fam:'FB', lift:0.12, la:-6},
  '切球':        {v:0.93, hb:-0.25, vb:0.00, late:3.2, cost:1.05, fam:'FB', lift:0.35, la:0},
  '變速球':      {v:0.86, hb:0.50, vb:-0.50, late:2.5, cost:0.95, fam:'OS'},
  '圈指變速球':  {v:0.85, hb:0.65, vb:-0.60, late:2.6, cost:0.95, fam:'OS'},
  '螃蟹球':      {v:0.85, hb:0.50, vb:-0.80, late:2.8, cost:1.05, fam:'OS'},
  '掌心球':      {v:0.78, hb:0.25, vb:-0.85, late:2.2, cost:0.95, fam:'OS'},
  '指叉球':      {v:0.87, hb:0.25, vb:-1.15, late:3.2, cost:1.20, fam:'OS'},
  '快速指叉球':  {v:0.92, hb:0.25, vb:-0.80, late:3.4, cost:1.15, fam:'OS'},
  '螺旋球':      {v:0.80, hb:0.90, vb:-0.90, late:2.3, cost:1.25, fam:'BR'},
  '滑球':        {v:0.88, hb:-0.50, vb:-0.25, late:2.8, cost:1.10, fam:'BR'},
  'V滑球':       {v:0.88, hb:-0.18, vb:-0.70, late:2.8, cost:1.10, fam:'BR'},
  'Sweeper':     {v:0.84, hb:-1.10, vb:-0.10, late:2.2, cost:1.10, fam:'BR'},
  '滑曲球':      {v:0.82, hb:-0.75, vb:-0.65, late:2.2, cost:1.10, fam:'BR'},
  '12-6曲球':    {v:0.79, hb:-0.08, vb:-1.40, late:1.8, cost:1.10, fam:'BR'},
  '1-7滑曲球':   {v:0.80, hb:-0.65, vb:-1.05, late:1.9, cost:1.10, fam:'BR'},
  '3-9曲球':     {v:0.78, hb:-1.20, vb:-0.50, late:1.8, cost:1.10, fam:'BR'},
  '慢速曲球':    {v:0.70, hb:-0.35, vb:-1.55, late:1.6, cost:0.90, fam:'BR'},
};
const SHORT = {'四縫線':'四縫','二縫線':'二縫','上升快速球':'上升','噴射球':'噴射','伸卡':'伸卡','切球':'切球','變速球':'變速','圈指變速球':'圈變','螃蟹球':'螃蟹','掌心球':'掌心','指叉球':'指叉','快速指叉球':'快指','螺旋球':'螺旋','滑球':'滑球','V滑球':'V滑','Sweeper':'橫掃','滑曲球':'滑曲','12-6曲球':'12-6','1-7滑曲球':'1-7','3-9曲球':'3-9','慢速曲球':'慢曲'};
const POS_NAME = {C:'捕手','1B':'一壘手','2B':'二壘手','3B':'三壘手',SS:'游擊手',LF:'左外野手',CF:'中外野手',RF:'右外野手',DH:'指定打擊'};
const AREA = {LF:'左外野',CF:'中外野',RF:'右外野'};

function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
let rnd = Math.random;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const R=(a,b)=>a+(b-a)*rnd();
function gauss(){let u=0,v=0;while(!u)u=rnd();while(!v)v=rnd();return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}

/* 聯盟架構：全台 6 都、11 縣、3 個省轄市共 20 隊，分卡皮、巴拉兩個聯盟，每個聯盟 2 個分區、每區 5 隊 */
const LEAGUES = [
  {id:'capy', name:'卡皮聯盟', color:'#d9822b', divs:[{id:'N', name:'北區'}, {id:'C', name:'中區'}]},
  {id:'bara', name:'巴拉聯盟', color:'#3d8bd9', divs:[{id:'S', name:'南區'}, {id:'E', name:'東南區'}]},
];
// 球隊（虛構）。city＝縣市、pre＝隊名前面的縣市簡稱（玩家可以改 pre 後面的隊名）；mod 是整隊能力的加減值，park 是主場名稱
const TEAM_DEFS = [
  {id:'taipei',    lg:'capy', div:'N', city:'台北市', pre:'台北', short:'雷鳴', color:'#d9482b', park:'雷鳴巨蛋',   mod:{pow:10,con:-2,spd:-5,def:-4,pit:0}, note:'重砲打線，長打能力聯盟第一'},
  {id:'newtaipei', lg:'capy', div:'N', city:'新北市', pre:'新北', short:'獵豹', color:'#ffb300', park:'板橋球場',   mod:{pow:2,con:3,spd:9,def:2,pit:-3}, note:'跑得快、愛盜壘的年輕球隊'},
  {id:'keelung',   lg:'capy', div:'N', city:'基隆市', pre:'基隆', short:'浪鯨', color:'#1f8a8a', park:'雨港球場',   mod:{pow:3,con:0,spd:-3,def:4,pit:2}, note:'雨港硬漢，守備扎實'},
  {id:'taoyuan',   lg:'capy', div:'N', city:'桃園市', pre:'桃園', short:'飛翼', color:'#3d6fe0', park:'航空城球場', mod:{pow:5,con:5,spd:0,def:-2,pit:2}, note:'打線火力平均的強權'},
  {id:'yilan',     lg:'capy', div:'N', city:'宜蘭縣', pre:'宜蘭', short:'蒼鷺', color:'#7cb342', park:'蘭陽球場',   mod:{pow:-4,con:4,spd:4,def:6,pit:0}, note:'小球戰術，失誤少'},
  {id:'hsinchu',   lg:'capy', div:'C', city:'新竹市', pre:'新竹', short:'疾風', color:'#26a8c9', park:'風城球場',   mod:{pow:-3,con:9,spd:6,def:2,pit:-4}, note:'高打擊率的連打型球隊'},
  {id:'hsinchuco', lg:'capy', div:'C', city:'新竹縣', pre:'竹縣', short:'鐵牛', color:'#8d6e63', park:'竹北球場',   mod:{pow:7,con:-3,spd:-6,def:0,pit:3}, note:'慢郎中，但一棒一棒都很重'},
  {id:'miaoli',    lg:'capy', div:'C', city:'苗栗縣', pre:'苗栗', short:'石虎', color:'#d6589f', park:'山城球場',   mod:{pow:-2,con:2,spd:5,def:5,pit:1}, note:'靈活的守備型球隊'},
  {id:'taichung',  lg:'capy', div:'C', city:'台中市', pre:'台中', short:'黑熊', color:'#7a5bd6', park:'黑森林球場', mod:{pow:-2,con:0,spd:0,def:3,pit:10}, note:'投手王國，先發與牛棚都很深'},
  {id:'changhua',  lg:'capy', div:'C', city:'彰化縣', pre:'彰化', short:'鐵騎', color:'#607d8b', park:'八卦山球場', mod:{pow:4,con:2,spd:2,def:-3,pit:3}, note:'中規中矩，後勁很強'},
  {id:'nantou',    lg:'bara', div:'S', city:'南投縣', pre:'南投', short:'雲豹', color:'#9575cd', park:'日月潭球場', mod:{pow:0,con:3,spd:7,def:3,pit:-2}, note:'山林裡跑出來的快腿'},
  {id:'yunlin',    lg:'bara', div:'S', city:'雲林縣', pre:'雲林', short:'火鳳', color:'#e65100', park:'斗六球場',   mod:{pow:6,con:1,spd:-1,def:-2,pit:4}, note:'先發投手球威十足'},
  {id:'chiayi',    lg:'bara', div:'S', city:'嘉義市', pre:'嘉義', short:'火雞', color:'#9e9d24', park:'諸羅球場',   mod:{pow:3,con:6,spd:0,def:0,pit:-1}, note:'棒球故鄉，打者很會選球'},
  {id:'chiayico',  lg:'bara', div:'S', city:'嘉義縣', pre:'嘉縣', short:'神木', color:'#00695c', park:'阿里山球場', mod:{pow:1,con:-1,spd:-2,def:6,pit:6}, note:'穩如神木的投守'},
  {id:'tainan',    lg:'bara', div:'S', city:'台南市', pre:'台南', short:'赤龍', color:'#b8324f', park:'赤崁球場',   mod:{pow:6,con:-3,spd:-2,def:-5,pit:6}, note:'強投加重砲，但守備漏洞多'},
  {id:'kaohsiung', lg:'bara', div:'E', city:'高雄市', pre:'高雄', short:'海鷹', color:'#2f7fd1', park:'港灣球場',   mod:{pow:-7,con:6,spd:10,def:8,pit:-1}, note:'速度與守備型球隊'},
  {id:'pingtung',  lg:'bara', div:'E', city:'屏東縣', pre:'屏東', short:'黑鮪', color:'#1a237e', park:'東港球場',   mod:{pow:8,con:0,spd:-2,def:-3,pit:1}, note:'全壘打大砲排成一排'},
  {id:'taitung',   lg:'bara', div:'E', city:'台東縣', pre:'台東', short:'飛魚', color:'#4fc3f7', park:'太平洋球場', mod:{pow:2,con:2,spd:8,def:4,pit:-4}, note:'原鄉好手輩出，腳程聯盟頂尖'},
  {id:'hualien',   lg:'bara', div:'E', city:'花蓮縣', pre:'花蓮', short:'山豬', color:'#1f9b5c', park:'洄瀾球場',   mod:{pow:4,con:4,spd:3,def:0,pit:-3}, note:'攻守均衡，打線沒有明顯漏洞'},
  {id:'penghu',    lg:'bara', div:'E', city:'澎湖縣', pre:'澎湖', short:'玄武', color:'#37474f', park:'海風球場',   mod:{pow:-1,con:-1,spd:0,def:2,pit:7}, note:'海風強勁，投手越投越順'},
].map(t=>({...t, name:t.pre+t.short}));
const SURN='陳林黃張李王吳劉蔡楊許鄭謝郭洪曾邱廖賴周徐蘇葉莊呂江何蕭羅高潘簡朱鍾彭游詹胡施沈余趙盧梁顏柯孫魏翁戴范宋方鄧杜傅侯曹薛丁卓馬董溫唐藍石蔣古紀姚連馮歐'.split('');
const GIV='宇翔凱傑志豪俊偉冠廷柏睿承恩哲維彥霖勝銘鴻仁智安軒誠澤明信昊亦辰佑宏家祐嘉瑋政峰崇文育道立威德濬聖書宸耀竣弘晨皓'.split('');
// 各守備位置的打擊能力範圍（一般先發等級）；alt 是可以兼守的位置
const POS_T = {
  C:   {pow:[38,64], con:[44,66], spd:[22,46], alt:[]},
  '1B':{pow:[70,96], con:[52,76], spd:[25,48], alt:['DH']},
  '2B':{pow:[38,62], con:[58,82], spd:[55,84], alt:['SS']},
  SS:  {pow:[40,64], con:[60,84], spd:[62,88], alt:['2B','3B']},
  '3B':{pow:[58,82], con:[54,76], spd:[42,66], alt:['1B']},
  LF:  {pow:[52,80], con:[54,76], spd:[50,76], alt:['RF']},
  CF:  {pow:[40,66], con:[64,88], spd:[76,97], alt:['LF','RF']},
  RF:  {pow:[62,88], con:[60,84], spd:[48,72], alt:['LF']},
  DH:  {pow:[72,94], con:[54,74], spd:[25,50], alt:['1B']},
};
// 球員等級：能力加減與年齡範圍
const TIERS = {star:{b:9,age:[25,33]}, reg:{b:0,age:[23,35]}, bench:{b:-8,age:[22,36]}, vet:{b:-4,age:[33,38]},
  prospect:{b:-11,age:[18,23]}, farm:{b:-14,age:[19,27]}};
const TIER_NAME = {star:'明星', reg:'主力', bench:'替補', vet:'老將', prospect:'新秀', farm:'二軍'};
const HOMETOWNS='台北市 新北市 桃園市 台中市 台南市 高雄市 基隆市 新竹市 新竹縣 苗栗縣 彰化縣 南投縣 雲林縣 嘉義市 嘉義縣 屏東縣 宜蘭縣 花蓮縣 台東縣 澎湖縣 金門縣'.split(' ');
const DEFR = { // 接球, 傳球, 臂力
  C:[[60,86],[62,86],[72,95]], '1B':[[60,86],[50,72],[40,65]], '2B':[[70,92],[70,90],[55,76]],
  SS:[[76,96],[74,92],[76,96]], '3B':[[64,88],[64,86],[76,95]], LF:[[55,80],[55,76],[50,76]],
  CF:[[76,96],[64,86],[60,86]], RF:[[64,86],[64,86],[82,98]], DH:[[28,50],[28,50],[30,55]]
};
const ARCH = [
  ['四縫線','滑球','指叉球','變速球'],
  ['伸卡','二縫線','變速球','切球'],
  ['上升快速球','12-6曲球','變速球'],
  ['四縫線','Sweeper','V滑球'],
  ['噴射球','滑球','快速指叉球','慢速曲球'],
  ['二縫線','螺旋球','3-9曲球'],
  ['四縫線','切球','1-7滑曲球','圈指變速球'],
  ['伸卡','螃蟹球','滑曲球'],
  ['上升快速球','掌心球','滑球','指叉球'],
];

// 每位投手都必須有四縫線、二縫線、伸卡其中一種。沒有的話把基本速球放在第一個，球種數不變
// （上升快速球的配球換成四縫線、噴射球換成二縫線）。球員資料庫的舊資料在載入時也用同一個規則補上
const FB_BASE=['四縫線','二縫線','伸卡'];
function withBaseFastball(names){
  if(names.some(n=>FB_BASE.includes(n))) return names;
  return [names[0]==='噴射球'?'二縫線':'四縫線', ...names].slice(0,names.length);
}
function ensureBaseFastball(p){
  const names=withBaseFastball(p.pitches.map(x=>x.n)); if(names[0]===p.pitches[0].n) return false;
  p.pitches=p.pitches.map((x,i)=>({n:names[i], r:x.r})); return true;
}
// 速球的重力拋物線高度：拋物線相對直線的位移 = arc·t(1-t)，arc = 有效重力 × 飛行時間² / 2
const fbArc=(d,mph)=>{const T=18.4/(mph*0.447); return 32.2*(1-d.lift)*T*T/2;};

/* ---------- 聯盟與球員名單 ----------
   LEAGUE = {players:{id:球員}, teams:[{id,…, roster:[id], lineup:[{id,pos}], rotation:[id], bullpen:[id], closer:id, rotIdx}], freeAgents:[id]}
   球員只存在 players 裡，球隊只記 id，之後做交易只要搬 id 再呼叫 autoLineup / autoStaff。 */
const PROLE = {SP:'先發', RP:'中繼', CL:'終結'};
const PITCH_T = {SP:{velo:[60,86], ctrl:[62,88], stam:[80,96], n:4}, RP:{velo:[64,88], ctrl:[56,82], stam:[38,52], n:3}, CL:{velo:[80,97], ctrl:[58,82], stam:[30,42], n:3}};
const HIT_ROSTER = [ // [守備位置, 等級]：9 名先發 + 4 名替補
  ['C','reg'],['1B','reg'],['2B','reg'],['SS','reg'],['3B','reg'],['LF','reg'],['CF','reg'],['RF','reg'],['DH','reg'],
  ['C','bench'],['SS','bench'],['3B','bench'],['CF','bench']];
const PIT_ROSTER = [['SP','reg'],['SP','reg'],['SP','reg'],['SP','reg'],['SP','bench'],
  ['RP','reg'],['RP','reg'],['RP','reg'],['RP','reg'],['RP','reg'],['RP','bench'],['RP','prospect'],['CL','reg']];
// 二軍 34 人：18 野手 + 16 投手
const FARM_HIT = ['C','1B','2B','SS','3B','LF','CF','RF','C','SS','2B','3B','CF','LF','RF','1B','DH','SS'];
const FARM_PIT = ['SP','SP','SP','SP','SP','SP','RP','RP','RP','RP','RP','RP','RP','RP','RP','RP'];
const LEAGUE_SIZE = 1500; // 20 隊 × 60 人＝1200，其餘 300 人是自由球員

function hitterOvr(b){ const d=DEFR[b.pos]?(b.fld+b.thr+b.arm)/3:50;
  return Math.round(b.con*0.3+b.pow*0.3+b.eye*0.1+b.spd*0.1+(b.pos==='DH'?55:d)*0.2); }
function pitcherOvr(p){ const ps=p.pitches.map(x=>x.r), best=Math.max(...ps), avg=ps.reduce((a,b)=>a+b,0)/ps.length;
  return Math.round(p.velo*0.3+p.ctrl*0.3+best*0.22+avg*0.13+(p.prole==='SP'?p.stam*0.05:5)); }

function buildLeague(seed){
  const g = mulberry32(seed||20260926);
  const gi=(a,b)=>Math.floor(a+(b-a+1)*g());
  const pick=a=>a[gi(0,a.length-1)];
  const used=new Set();
  const nm=()=>{let n;do{n=pick(SURN)+pick(GIV)+(g()<0.75?pick(GIV):'');}while(used.has(n)||n[1]===n[2]);used.add(n);return n;};
  const rr=(r,m)=>clamp(Math.round(gi(r[0],r[1])+(m||0)),1,99);
  const players={}; let pid=0;
  const newId=k=>k+String(++pid).padStart(4,'0');
  // 身高體重、出身地、潛力、年薪（萬元）、合約年數
  function bio(p){
    const P=p.kind==='P';
    p.height=P?gi(175,198):gi(p.pos==='2B'||p.pos==='SS'?168:172,p.pos==='1B'||p.pos==='DH'?195:190);
    p.weight=Math.round((p.height-100)*gi(86,106)/100+(P?0:(p.pow-60)*0.18));
    p.hometown=pick(HOMETOWNS);
    const gap=p.age<=22?gi(8,25):p.age<=25?gi(3,15):p.age<=29?gi(0,6):0;
    p.pot=clamp(p.ovr+gap,p.ovr,99);
    const base=Math.max(0,p.ovr-45);
    p.salary=Math.max(50,Math.round((50+base*base*1.5)*(p.age<=24?0.6:1)/10)*10);
    p.years=gi(1,5);
  }
  function makeHitter(pos, tier, m){
    const t=POS_T[pos], tb=TIERS[tier].b, d=DEFR[pos], con=rr(t.con,m.con+tb);
    const b={id:newId('b'), kind:'H', name:nm(), pos, alt:t.alt.slice(), bats:g()<0.32?'L':'R', age:gi(...TIERS[tier].age), tier,
      pow:rr(t.pow,m.pow+tb-4), con, eye:clamp(con+gi(-12,10),1,99), spd:rr(t.spd,m.spd+tb*0.5),
      fld:rr(d[0],m.def+tb*0.5), thr:rr(d[1],m.def+tb*0.5), arm:rr(d[2],m.def+tb*0.5)};
    // 冷熱區：3x3，row0=高、col0=捕手視角左側
    const base=(b.con+b.pow)/2>78?1:(b.con+b.pow)/2<58?-1:0, pat=gi(0,4), inside=b.bats==='R'?0:2;
    b.hz=[];
    for(let r=0;r<3;r++)for(let c=0;c<3;c++){
      let v=base+(g()<0.35?(g()<0.5?-1:1):0);
      if(pat===0&&r===2)v++; if(pat===1&&r===0)v++; if(pat===2&&c===inside)v++; if(pat===3&&c===2-inside)v++; if(pat===4&&r===1&&c===1)v+=2;
      if(pat===0&&r===0)v--; if(pat===1&&r===2)v--; if(pat===2&&c===2-inside)v--; if(pat===3&&c===inside)v--;
      b.hz.push(clamp(v,-2,2));
    }
    b.throws=b.bats==='L'&&['1B','LF','CF','RF','DH'].includes(pos)&&g()<0.6?'L':'R';
    b.ovr=hitterOvr(b); bio(b); players[b.id]=b; return b.id;
  }
  function makePitcher(prole, tier, m){
    const t=PITCH_T[prole], tb=TIERS[tier].b, arch=withBaseFastball(pick(ARCH).slice(0,t.n)), out=gi(1,arch.length-1);
    const p={id:newId('p'), kind:'P', name:nm(), prole, pos:'P', throws:g()<0.3?'L':'R', age:gi(...TIERS[tier].age), tier,
      velo:rr(t.velo,m.pit+tb), ctrl:rr(t.ctrl,m.pit+tb), stam:rr(t.stam,0),
      pitches:arch.map((n,i)=>({n, r:clamp(gi(i===out?76:56,i===out?95:86)+m.pit+tb,1,99)}))};
    p.bats=g()<0.25?'L':'R';
    p.ovr=pitcherOvr(p); bio(p); players[p.id]=p; return p.id;
  }
  const place=(ids,team,level)=>{ids.forEach(id=>{players[id].team=team; players[id].level=level;}); return ids;};
  const teams=TEAM_DEFS.map(td=>{
    const m=td.mod, stars=new Set([gi(0,8),gi(0,8)]), ace=gi(0,3);
    const roster=place([
      ...HIT_ROSTER.map(([pos,tier],i)=>makeHitter(pos, stars.has(i)?'star':tier, m)),
      ...PIT_ROSTER.map(([pr,tier],i)=>makePitcher(pr, i===ace?'star':tier, m)),
    ], td.id, 1);
    const farm=place([
      ...FARM_HIT.map((pos,i)=>makeHitter(pos, i%4===0?'prospect':'farm', m)),
      ...FARM_PIT.map((pr,i)=>makePitcher(pr, i%4===0?'prospect':'farm', m)),
    ], td.id, 2);
    const t={...td, roster, farm, rotIdx:0};
    autoLineup({players}, t); autoStaff({players}, t);
    return t;
  });
  // 自由球員：補到 LEAGUE_SIZE 人，野手約 55%
  const z={pow:0,con:0,spd:0,def:0,pit:0}, freeAgents=[], POSL=Object.keys(POS_T);
  while(Object.keys(players).length<LEAGUE_SIZE){
    const r=g(), tier=r<0.12?'vet':r<0.5?'bench':r<0.75?'prospect':'farm';
    const id=g()<0.55?makeHitter(pick(POSL),tier,z):makePitcher(g()<0.4?'SP':g()<0.85?'RP':'CL',tier,z);
    players[id].team=null; players[id].level=null; players[id].years=0; freeAgents.push(id);
  }
  // 背號：同隊（含二軍）不重複
  teams.forEach(t=>{const taken=new Set(); [...t.roster,...t.farm].forEach(id=>{let n; do{n=gi(0,99);}while(taken.has(n)); taken.add(n); players[id].num=n;});});
  freeAgents.forEach(id=>players[id].num=gi(0,99));
  // 聯盟原有球員一律在「稀有」以下；完美以上只能靠抽卡或合成
  Object.values(players).forEach(capLeaguePlayer);
  teams.forEach(t=>{autoLineup({players},t); autoStaff({players},t);});
  return {players, teams, freeAgents, log:[]};
}

// 依名單自動排出守備位置與打序
function autoLineup(L, t){
  const hit=t.roster.map(id=>L.players[id]).filter(p=>p.kind==='H'), used=new Set(), pen=(p,pos)=>p.pos===pos?0:p.alt.includes(pos)?6:18;
  const bat=p=>(p.con+p.pow)/2*0.7+p.eye*0.1+p.spd*0.1, def=p=>(p.fld+p.thr+p.arm)/3;
  const picks=[], filled=new Set();
  const choose=(pos,ok)=>{
    let best=null, bs=-1e9;
    for(const p of hit){ if(used.has(p.id)||!ok(p))continue;
      const s=pos==='DH'?bat(p):bat(p)*0.65+(def(p)-pen(p,pos))*0.35-(pos==='C'&&p.pos!=='C'?40:0);
      if(s>bs){bs=s;best=p;} }
    if(best){used.add(best.id); filled.add(pos); picks.push({p:best,pos});}
  };
  const FIELD=['C','SS','CF','2B','3B','RF','LF','1B'];
  FIELD.forEach(pos=>choose(pos,p=>p.pos===pos));                       // 先用本職球員
  FIELD.forEach(pos=>{if(!filled.has(pos))choose(pos,p=>p.alt.includes(pos));}); // 再用可兼守的
  FIELD.forEach(pos=>{if(!filled.has(pos))choose(pos,()=>true)});        // 最後誰都可以
  choose('DH',()=>true);
  const obp=x=>x.p.con*0.6+x.p.eye*0.4, rest=picks.slice(), order=[];
  const take=f=>{let i=0; rest.forEach((x,j)=>{if(f(x)>f(rest[i]))i=j;}); order.push(rest.splice(i,1)[0]);};
  // 1~5 棒依序挑：開路（上壘+速度）、串聯（上壘）、主砲（上壘+長打）、四棒、五棒（長打）
  take(x=>obp(x)*0.6+x.p.spd*0.4); take(obp); take(x=>obp(x)+x.p.pow); take(x=>x.p.pow); take(x=>x.p.pow);
  while(rest.length) take(x=>obp(x)+x.p.pow);
  t.lineup=order.map(x=>({id:x.p.id,pos:x.pos}));
  t.bench=hit.filter(p=>!used.has(p.id)).map(p=>p.id);
  return t.lineup;
}
// 依名單自動排出先發輪值、牛棚與終結者
function autoStaff(L, t){
  const pit=t.roster.map(id=>L.players[id]).filter(p=>p.kind==='P').sort((a,b)=>b.ovr-a.ovr);
  const sp=pit.filter(p=>p.prole==='SP');
  t.rotation=sp.slice(0,5).map(p=>p.id);
  for(const p of pit){ if(t.rotation.length>=5)break; if(!t.rotation.includes(p.id)&&p.stam>=55)t.rotation.push(p.id); }
  const left=pit.filter(p=>!t.rotation.includes(p.id));
  const cl=left.find(p=>p.prole==='CL')||left[0];
  t.closer=cl?cl.id:null;
  t.bullpen=left.filter(p=>p!==cl).map(p=>p.id);
  t.rotIdx=t.rotIdx%Math.max(1,t.rotation.length);
}
// 交易、簽約、升降二軍用：把球員移到某隊的一軍(level=1)或二軍(level=2)；toId=null 代表釋出成自由球員。
// 牽涉到的球隊會自動重排打序與投手群
function movePlayer(L, pid, toId, level=1){
  const from=L.teams.find(t=>t.roster.includes(pid)||t.farm.includes(pid));
  if(from){from.roster=from.roster.filter(x=>x!==pid); from.farm=from.farm.filter(x=>x!==pid);}
  else L.freeAgents=L.freeAgents.filter(x=>x!==pid);
  const to=toId?L.teams.find(t=>t.id===toId):null, p=L.players[pid];
  if(to){(level===2?to.farm:to.roster).push(pid); p.team=to.id; p.level=level;
    // 背號撞號就換成最小的空號
    const taken=new Set([...to.roster,...to.farm].filter(x=>x!==pid).map(x=>L.players[x].num));
    if(taken.has(p.num)){let n=0; while(taken.has(n))n++; p.num=n;}}
  else {L.freeAgents.push(pid); p.team=null; p.level=null;}
  [from,to].forEach(t=>{if(t){autoLineup(L,t);autoStaff(L,t);}});
}

/* ---------- 交易系統 ----------
   以「A 隊（玩家）向 B 隊（AI）提案」的角度：give = A 送出的球員，get = A 想要的 B 隊球員。
   B 隊依球員價值與自身需求決定接不接受；所有異動都記在 L.log，存檔時寫進 SQLite 的 transactions 表。 */
const SALARY_CAP=56000;          // 萬元，一軍＋二軍年薪總額上限
const ROSTER_MAX=90;             // 一軍＋二軍人數上限（抽卡會加人，所以放寬）
const ACTIVE_MAX=26;             // 一軍人數上限
const ACTIVE_MIN={H:10, P:10};   // 一軍至少要有的野手、投手
const AI_MARGIN=1.08;            // AI 要多賺 8% 才肯交易
const payroll=(L,t)=>[...t.roster,...t.farm].reduce((s,id)=>s+L.players[id].salary,0);
const teamSize=t=>t.roster.length+t.farm.length;
const teamById_=(L,id)=>L.teams.find(t=>t.id===id);

// 球員交易價值：總評越高價值越陡；25 歲以下依潛力加分，33 歲以上打折
function playerValue(p){
  const sq=v=>Math.max(0,v-40)**2/10;
  let v=sq(p.ovr);
  if(p.age<=25) v+=(sq(p.pot)-sq(p.ovr))*0.5*Math.min(1,(26-p.age)/6);
  if(p.age>=33) v*=Math.max(0.4,1-(p.age-32)*0.08);
  return Math.round(v);
}
// 對某隊的需求：比該隊同位置現任主力好 ×1.15，只是補位 ×0.9
function needFactor(L,t,p){
  const ovr=id=>L.players[id].ovr;
  let cur=0;
  if(p.kind==='H'){const s=t.lineup.find(x=>x.pos===p.pos)||t.lineup.find(x=>x.pos==='DH'); cur=s?ovr(s.id):0;}
  else if(p.prole==='SP') cur=t.rotation.length?Math.min(...t.rotation.map(ovr)):0;
  else if(p.prole==='CL') cur=t.closer?ovr(t.closer):0;
  else cur=t.bullpen.length?Math.min(...t.bullpen.map(ovr)):0;
  return p.ovr>cur?1.15:0.9;
}
// 一軍人數整理。strict（AI 球隊）：一軍維持 13 野手 + 13 投手，二軍有更強的就互換；
// 玩家球隊只確保一軍不超過 26 人、野手投手各不少於 10 人，其他由玩家自己調整
function fitRoster(L,t,strict){
  const P=id=>L.players[id], cnt=k=>t.roster.filter(id=>P(id).kind===k).length;
  const move=(id,lv)=>{if(lv===2){t.roster=t.roster.filter(x=>x!==id); t.farm.push(id);} else {t.farm=t.farm.filter(x=>x!==id); t.roster.push(id);} P(id).level=lv;};
  const lastC=id=>P(id).pos==='C'&&t.roster.filter(x=>P(x).pos==='C').length<=1;
  const worst=k=>t.roster.filter(id=>P(id).kind===k&&!lastC(id)).sort((a,b)=>P(a).ovr-P(b).ovr)[0];
  const best=k=>t.farm.filter(id=>P(id).kind===k).sort((a,b)=>P(b).ovr-P(a).ovr)[0];
  for(const k of ['H','P']){
    const lo=strict?13:ACTIVE_MIN[k];
    while(cnt(k)<lo&&best(k)) move(best(k),1);
    if(strict) while(cnt(k)>13&&worst(k)) move(worst(k),2);
  }
  while(t.roster.length>ACTIVE_MAX){const k=cnt('H')-ACTIVE_MIN.H>=cnt('P')-ACTIVE_MIN.P?'H':'P', w=worst(k); if(!w)break; move(w,2);}
  if(strict) for(const k of ['H','P']){let b=best(k), w=worst(k), g=0; while(b&&w&&P(b).ovr>P(w).ovr+3&&g++<30){move(b,1); move(w,2); b=best(k); w=worst(k);}}
  autoLineup(L,t); autoStaff(L,t);
}
// 評估交易提案（不會改動資料）
function tradeCheck(L,aId,bId,give,get){
  const A=teamById_(L,aId), B=teamById_(L,bId), P=id=>L.players[id], sum=(ids,f)=>ids.reduce((s,id)=>s+f(P(id)),0);
  const r={ok:false, problems:[]};
  r.valGive=sum(give,playerValue); r.valGet=sum(get,playerValue);
  r.payA=payroll(L,A)-sum(give,p=>p.salary)+sum(get,p=>p.salary);
  r.payB=payroll(L,B)-sum(get,p=>p.salary)+sum(give,p=>p.salary);
  r.sizeA=teamSize(A)-give.length+get.length; r.sizeB=teamSize(B)-get.length+give.length;
  if(!give.length||!get.length) r.problems.push('兩邊都至少要選一名球員');
  if(r.sizeA>ROSTER_MAX) r.problems.push(`${A.short}的名單會超過 ${ROSTER_MAX} 人`);
  if(r.sizeB>ROSTER_MAX) r.problems.push(`${B.short}的名單會超過 ${ROSTER_MAX} 人`);
  if(r.payA>SALARY_CAP&&r.payA>payroll(L,A)) r.problems.push(`${A.short}的薪資會超過上限`);
  if(r.payB>SALARY_CAP&&r.payB>payroll(L,B)) r.problems.push(`${B.short}的薪資會超過上限`);
  r.recv=Math.round(sum(give,p=>playerValue(p)*needFactor(L,B,p)));   // B 隊眼中收到的價值
  r.need=Math.round(r.valGet*AI_MARGIN);                               // B 隊要求的價值
  r.ratio=r.need?r.recv/r.need:(give.length?2:0);
  r.ok=!r.problems.length&&r.recv>=r.need;
  r.msg=r.problems.length?r.problems[0]:r.ok?`${B.short}願意接受這筆交易`:`${B.short}覺得不划算（還差 ${r.need-r.recv} 點價值）`;
  return r;
}
// AI 開價：玩家選好要送出的球員後，B 隊從自己名單挑出它願意給的組合（不超過它眼中的收穫）
function aiOffer(L,aId,bId,give){
  const B=teamById_(L,bId), P=id=>L.players[id];
  const recv=give.reduce((s,id)=>s+playerValue(P(id))*needFactor(L,B,P(id)),0);
  const pool=[...B.roster,...B.farm].map(id=>({id, v:playerValue(P(id))})).filter(x=>x.v>0).sort((a,b)=>b.v-a.v);
  const out=[]; let used=0;
  for(const x of pool){ if(out.length>=3)break; if((used+x.v)*AI_MARGIN<=recv){out.push(x.id); used+=x.v;} }
  while(out.length&&!tradeCheck(L,aId,bId,give,out).ok) out.pop();
  return out;
}
function executeTrade(L,aId,bId,give,get,userId){
  const chk=tradeCheck(L,aId,bId,give,get); if(!chk.ok) return chk;
  const lv=id=>L.players[id].level===2?2:1;
  const moves=[...give.map(id=>[id,bId,lv(id)]), ...get.map(id=>[id,aId,lv(id)])];
  moves.forEach(([id,to,l])=>movePlayer(L,id,to,l));
  [aId,bId].forEach(id=>{const t=teamById_(L,id); fitRoster(L,t,id!==userId);});
  L.log.push({at:new Date().toISOString(), type:'trade', a:aId, b:bId, aOut:give.slice(), bOut:get.slice()});
  return chk;
}
function signFA(L,tId,pid,userId){
  const t=teamById_(L,tId), p=L.players[pid];
  if(p.team) return {ok:false, msg:'這名球員不是自由球員'};
  if(teamSize(t)>=ROSTER_MAX) return {ok:false, msg:`名單已滿（${ROSTER_MAX} 人）`};
  if(payroll(L,t)+p.salary>SALARY_CAP) return {ok:false, msg:'薪資會超過上限'};
  p.years=p.age>=32?1:p.age<=24?3:2;
  movePlayer(L,pid,tId,2); fitRoster(L,t,tId!==userId);
  L.log.push({at:new Date().toISOString(), type:'sign', a:tId, b:null, aOut:[], bOut:[pid]});
  return {ok:true, msg:`簽下 ${p.name}（放在二軍）`};
}
function releasePlayer(L,pid,userId){
  const p=L.players[pid], t=teamById_(L,p.team); if(!t) return {ok:false, msg:'已經是自由球員'};
  movePlayer(L,pid,null); p.years=0; fitRoster(L,t,t.id!==userId);
  L.log.push({at:new Date().toISOString(), type:'release', a:t.id, b:null, aOut:[pid], bOut:[]});
  return {ok:true, msg:`釋出 ${p.name}`};
}
// 升一軍 / 降二軍（玩家手動調整）
function setLevel(L,pid,level){
  const p=L.players[pid], t=teamById_(L,p.team); if(!t||p.level===level) return {ok:false, msg:''};
  if(level===1&&t.roster.length>=ACTIVE_MAX) return {ok:false, msg:`一軍已滿 ${ACTIVE_MAX} 人，請先把人降到二軍`};
  if(level===2&&t.roster.filter(id=>L.players[id].kind===p.kind).length<=ACTIVE_MIN[p.kind]) return {ok:false, msg:`一軍${p.kind==='H'?'野手':'投手'}不能少於 ${ACTIVE_MIN[p.kind]} 人`};
  movePlayer(L,pid,t.id,level);
  return {ok:true, msg:`${p.name} ${level===1?'升上一軍':'降到二軍'}`};
}
const nextStarter=t=>t.rotation[t.rotIdx%t.rotation.length];

// 由聯盟資料做出一場比賽用的球隊（複製球員，比賽數據從零開始）
function gameTeam(L, teamId, starterId){
  const t=L.teams.find(x=>x.id===teamId), cp=id=>JSON.parse(JSON.stringify(L.players[id]));
  const hitter=id=>{const b=cp(id); b.natPos=b.pos; b.st={pa:0,ab:0,h:0,d2:0,d3:0,hr:0,rbi:0,bb:0,hbp:0,sf:0,so:0}; return b;};
  const lineup=t.lineup.map(({id,pos})=>{const b=hitter(id); setPos(b,pos); return b;});
  const bench=(t.bench||[]).filter(id=>L.players[id]).map(hitter);
  const sid=starterId||nextStarter(t);
  const staff=[[sid,'先發'], ...t.bullpen.map(id=>[id,'中繼']), ...(t.closer?[[t.closer,'終結']]:[])];
  const pitchers=staff.map(([id,role],i)=>({...cp(id), role, energy:100, pc:0, used:i===0, ra:0, ps:{bf:0,outs:0,h:0,hr:0,bb:0,hbp:0,so:0}}));
  return {id:t.id, name:t.name, short:t.short, color:t.color, park:t.park, note:t.note, lineup, bench, gone:[], pitchers, pIdx:0, bIdx:0};
}
// 守非本職位置要扣接球、傳球（可兼守扣得少）；b.pen 記下扣了多少，換位置時先還回去再重算
function setPos(b,pos){
  if(b.pen){b.fld+=b.pen[0]; b.thr+=b.pen[1]; b.pen=null;}
  if(pos!=='DH'&&b.natPos!==pos){const alt=b.alt.includes(pos);
    b.pen=[Math.min(b.fld-1,alt?5:15), Math.min(b.thr-1,alt?3:10)]; b.fld-=b.pen[0]; b.thr-=b.pen[1];}
  b.pos=pos;
}

let G=null;
function newGame(away, home, human){
  G={teams:[away,home], human, inning:1, half:0, outs:0, balls:0, strikes:0,
     bases:[null,null,null], line:[[0],[]], hits:[0,0], errors:[0,0], over:false, log:[], paPitches:[]};
  return G;
}
const batTeam=()=>G.teams[G.half];
const fldTeam=()=>G.teams[1-G.half];
const curPitcher=()=>{const t=fldTeam();return t.pitchers[t.pIdx];};
const curBatter=()=>{const t=batTeam();return t.lineup[t.bIdx];};
const fielder=pos=>fldTeam().lineup.find(p=>p.pos===pos);
const runs=s=>G.line[s].reduce((a,b)=>a+(b||0),0);
const fatigue=p=>p.energy>=50?1:0.76+0.24*Math.max(0,p.energy)/50;
const ZX=0.71, ZB=1.6, ZT=3.5, BR=0.12;
const isStrike=(x,y)=>Math.abs(x)<=ZX+BR && y>=ZB-BR && y<=ZT+BR;

// 晚變倍率：參考 MVP Baseball 2005 的實機畫面，前 2/3 幾乎直線、最後一段才明顯變化
const LATE_K=1.3;
// 變化幅度倍率：試玩後覺得位移不夠明顯，整體放大 20%
const BREAK_K=1.2;
// meter：人類投球時由計量條算出的偏移。數字＝隨機方向偏移量(ft)；{dx,dy}＝指定方向偏移；0/省略＝AI 投球
function makePitch(p, idx, target, power, meter){
  const pp=p.pitches[idx], d=PITCH_DEFS[pp.n], ff=fatigue(p);
  const arm = p.throws==='R'?-1:1;
  const sc=(0.55+0.45*pp.r/99)*(0.85+0.3*power)*(0.85+0.15*ff);
  const adj=(power-0.8)*5-(1-ff)*18;
  const mph=Math.min(MPH_MAX,veloMph(p.velo)*d.v+adj);
  // 球威：AI 打者判斷用。沿用改版前的球速公式（84＋球速×0.17），聯盟的數值平衡不變；超過 99 一樣往上加
  const heat=((84+p.velo*0.17)*d.v+adj-88)/30;
  // 控球 99 以上繼續變準，150 時偏差約只剩 99 的一半
  const sig=(p.ctrl<=99?0.05+(1-p.ctrl/99)*0.2:0.05-(p.ctrl-99)/51*0.025)+(1-ff)*0.5;
  let dx=gauss()*sig, dy=gauss()*sig;
  if(meter&&typeof meter==='object'){dx+=meter.dx; dy+=meter.dy;}
  else if(meter){const a=rnd()*Math.PI*2; dx+=Math.cos(a)*meter; dy+=Math.sin(a)*meter;}
  else {dx*=1.3; dy*=1.3;}
  const x=clamp(target.x+dx,-2.4,2.4), y=clamp(target.y+dy,0.2,5.2);
  const bx=d.hb*arm*sc*BREAK_K, by=d.vb*sc*BREAK_K, late=d.late*(0.8+0.4*pp.r/99)*LATE_K;
  // 速球：重力拋物線＋自轉升力。ride = 和一般速球相比，打者「預期之外」多出來的上竄(+)或下沉(-)（ft）；
  // 高進壘點的四縫線進壘角度平，上竄感更強
  let arc=0, ride=0;
  if(d.lift!==undefined){
    const T=18.4/(mph*0.447);
    arc=fbArc(d,mph);
    ride=(d.lift-0.3)*32.2*T*T/2*0.22*(0.55+0.45*pp.r/99);
    if(d.lift>=0.5&&y>ZT-0.7) ride*=1.6;
  }
  // 垂直進壘角度（VAA）：以真人的出手高度 6 ft 換算，負值＝往下進壘
  const vy=(y-6.0)+by*(late-1)-(d.lift!==undefined?arc:(1-d.v)*2.4*Math.PI);
  const vaa=Math.atan(vy/55)*180/Math.PI;
  return {name:pp.n, fam:d.fam, idx, mph, heat, x, y, bx, by, lift:d.lift, arc, ride, vaa, laShift:d.la||0,
    late, travel:18.4/(mph*0.447)*1000*1.9,
    rating:pp.r*(0.85+0.15*ff)*(0.9+0.2*power), power, vr:d.v, relX:arm*1.35, cost:d.cost, bmag:Math.hypot(d.hb,d.vb)*sc*BREAK_K};
}
function spendEnergy(p, P){p.energy=Math.max(0,p.energy-100/(35+p.stam*0.9)*P.cost*(0.7+0.6*P.power)); p.pc++;}

function aiChoosePitch(p, b){
  const {balls,strikes}=G;
  const w=p.pitches.map(pp=>{const d=PITCH_DEFS[pp.n];let x=Math.pow(pp.r,2);
    if(d.fam==='FB'&&balls-strikes>=2)x*=1.8; if(d.fam!=='FB'&&strikes===2)x*=1.5; if(d.fam==='FB'&&balls===0&&strikes===0)x*=1.3; return x;});
  let s=w.reduce((a,b)=>a+b,0)*rnd(), idx=0; for(;idx<w.length-1;idx++){s-=w[idx];if(s<=0)break;}
  const fam=PITCH_DEFS[p.pitches[idx].n].fam;
  const behind=balls>=3||balls-strikes>=2, ahead=strikes===2&&balls<3;
  const r=rnd(); let mode;
  if(behind) mode=r<0.7?'zone':'edge'; else if(ahead) mode=r<0.45?'chase':r<0.85?'edge':'zone'; else mode=r<0.45?'zone':r<0.9?'edge':'chase';
  let t;
  if(mode==='zone') t={x:R(-0.5,0.5), y:R(1.9,3.2)};
  else if(mode==='edge') { if(rnd()<0.6) t={x:(rnd()<0.5?-1:1)*R(0.75,1.15), y:R(1.5,3.5)}; else t={x:R(-0.8,0.8), y:rnd()<0.5?R(1.1,1.5):R(3.55,3.95)}; }
  else t= fam==='FB'? {x:R(-0.8,0.8), y:R(3.8,4.3)} : (rnd()<0.6?{x:R(-0.9,0.9), y:R(0.7,1.3)}:{x:(rnd()<0.5?-1:1)*R(1.0,1.4), y:R(1.2,2.4)});
  return {idx, target:t, power:R(0.72,0.95)};
}
function aiNeedsChange(p){return p.energy<20 || (p.ra>=6 && p.energy<70) || (p.ra>=8);}

/* 對決基準：打者和投手總評都很高時（例如神話打神話），兩邊在打擊判定裡都扣掉「較弱一方超過 72 的部分」，
   同級對決的結果就和聯盟（稀有以下）差不多；強弱懸殊時差距照樣全部算進去。
   只影響看不到的判定（揮棒、擊中、擊球品質），球速、位移、控球偏差都照真實能力。 */
const MATCH_BASE=72;
const matchShift=(b,p)=>Math.max(0,Math.min(b.ovr,p.ovr)-MATCH_BASE);
function aiSwing(b, p, P){
  const {balls,strikes}=G, inZ=isStrike(P.x,P.y), s=matchShift(b,p);
  const plat=b.bats!==p.throws?1:-1, con=clamp(b.con-s+plat*4,1,ABIL_MAX), eye=b.eye-s, rating=P.rating-s, heat=P.heat-s*0.17/30;
  let ps = inZ ? 0.62+(con-50)/400 : 0.17-(eye-50)/220+(rating-50)/300;
  if(strikes===2) ps+= inZ?0.28:0.16;
  if(balls===3&&strikes<2) ps-=0.2;
  if(balls===0&&strikes===0) ps-=0.1;
  if(rnd()>ps) return {type:'none'};
  const type = strikes<2 && ((balls>strikes&&b.pow-s>=70&&rnd()<0.6)||(b.pow-s>=85&&rnd()<0.3)) ? 'power':'normal';
  const diff=rating/99*0.6+heat+P.bmag*0.3;
  const sl=Math.max(0.04,0.16+(1-con/99)*0.30+diff*0.2);
  const st=Math.max(8,24+(1-con/99)*45+diff*24);
  const bias=-(1-Math.min(1,P.vr))*140*(1-clamp(eye,1,ABIL_MAX)/99*0.55);
  // 打者照「一般速球」的軌跡預判，四縫線會揮在球下方、伸卡二縫線會揮在球上方；選球眼好的人比較不會被騙
  const fooled=(P.ride||0)*(1-Math.min(1.5,clamp(eye,1,ABIL_MAX)/99)*0.5);
  return {type, x:P.x+gauss()*sl, y:P.y-fooled+gauss()*sl*0.9-(type==='power'?0.04:0.02), te:bias+gauss()*st};
}

function contactCalc(b,p,P,sw){
  const plat=b.bats!==p.throws?1:-1, s=matchShift(b,p);
  const con=clamp(b.con-s+plat*4,1,ABIL_MAX), pow=clamp(b.pow-s+plat*3,1,ABIL_MAX);
  const pw=sw.type==='power';
  const RR=(0.28+con/99*0.30)*(pw?0.62:1)+BR;
  const dx=P.x-sw.x, dy=P.y-sw.y, dist=Math.hypot(dx,dy);
  const perfect=pw?18:26, maxW=pw?85:115, ate=Math.abs(sw.te);
  if(ate>maxW) return {hit:false, tag:sw.te<0?'早了':'慢了'};
  if(dist>RR) return {hit:false, tag:'揮空'};
  const locQ=1-dist/RR, timQ=1-clamp((ate-perfect)/(maxW-perfect),0,1);
  let q=locQ*0.6+timQ*0.4;
  const ox=Math.max(0,Math.abs(P.x)-(ZX+BR)), oy=Math.max(0,ZB-BR-P.y,P.y-ZT-BR);
  q*=1-Math.min(Math.hypot(ox,oy)/0.7,1)*0.45;
  q*=1-(P.rating-s-50)/99*0.12;
  if(isStrike(P.x,P.y)&&b.hz){const c=clamp(Math.floor((P.x+ZX)/(2*ZX)*3),0,2), r=clamp(Math.floor((ZT-P.y)/(ZT-ZB)*3),0,2); q*=1+b.hz[r*3+c]*0.05;}
  if(rnd()<clamp(0.62-q*0.6,0.08,0.6)) return {hit:true, foul:true};
  const sweet=locQ>0.7&&timQ>0.85;
  let ev=(pw?93+pow*0.19:88+pow*0.13)-(1-q)*(pw?30:26)+gauss()*4+(sweet?(pw?5:2):0); ev=Math.min(ev,117+Math.max(0,pow-99)*0.15);   // 力量破百的打者擊球初速上限也提高（150 時約 125 mph）
  let la=12+clamp(dy/RR,-1,1)*40+gauss()*7+(pw?3:0)+(P.laShift||0);
  const pull=b.bats==='R'?-1:1;
  let spray=sw.te/maxW*38*(-pull)+pull*(pow-50)/99*6+gauss()*10;
  if(Math.abs(spray)>45) return {hit:true, foul:true};
  return {hit:true, foul:false, ev, la, spray, sweet};
}

function battedBall(ev,la,spray,b){
  const v=ev*1.4667, th=la*Math.PI/180;
  const type=la<10?'GB':la<25?'LD':la<50?'FB':'PU';
  const fence=330+70*(1-Math.abs(spray)/45);
  let dist = type==='GB'? clamp(60+ev*0.8,60,150) : Math.max(40, v*v/32.2*Math.sin(2*th)*0.75);
  if(dist>400) dist=400+(dist-400)*0.5;
  const res={type, dist, spray, ev, la, hit:null, out:false, dp:false, error:false, infield:false, pos:null};
  // 守備也套用對決基準（打者和投手都很強時，守備員能力一起扣掉同樣的量）
  const s=G?matchShift(b,curPitcher()):0, F=f=>({spd:f.spd-s, fld:f.fld-s, thr:f.thr-s, arm:f.arm-s}), bs=b.spd-s;
  const rng=f=>(f.spd*0.5+f.fld*0.5)/99;
  const errChance=f=>Math.max(0,(99-f.fld)/99*0.045+(99-f.thr)/99*0.025);
  if(type==='GB'){
    let pos=spray<-28?'3B':spray<-8?'SS':spray<8?(rnd()<0.5?'SS':'2B'):spray<28?'2B':'1B';
    const f=F(fielder(pos)); res.pos=pos; res.infield=true;
    let pOut=0.80-Math.max(0,ev-85)*0.013+(rng(f)-0.6)*0.35+(f.arm-60)/99*0.08;
    if(Math.abs(spray)<8) pOut-=0.12;
    if(ev<78) pOut-=(bs-45)/99*0.4;
    pOut=clamp(pOut,0.2,0.95);
    if(rnd()<pOut){
      if(rnd()<errChance(f)){res.error=true; return res;}
      res.out=true;
      if(G.bases[0]&&G.outs<2&&rnd()<clamp(0.55+(f.thr+f.arm-130)/300-(bs-50)/200,0.2,0.85)) res.dp=true;
      return res;
    }
    res.infield=ev<85; res.hit=(!res.infield&&Math.abs(spray)>28&&ev>96&&rnd()<0.35)?'2B':'1B';
    if(!res.infield) res.pos=spray<-15?'LF':spray<15?'CF':'RF';
    return res;
  }
  if(type==='PU'){ const pos=dist<120?(spray<0?'SS':'2B'):(spray<-15?'LF':spray<15?'CF':'RF'); res.pos=pos; res.out=rnd()<0.975; if(!res.out)res.hit='1B'; return res;}
  if(la>=18&&la<=50&&dist>=fence){res.hit='HR'; res.pos=spray<-15?'LF':spray<15?'CF':'RF'; return res;}
  if(type==='LD'&&dist<150){
    const pos=spray<-28?'3B':spray<-8?'SS':spray<8?'2B':spray<28?'2B':'1B'; res.pos=pos; res.infield=true;
    res.out=rnd()<0.72; if(!res.out){res.hit='1B';res.infield=false;res.pos=spray<-15?'LF':spray<15?'CF':'RF';} return res;
  }
  const pos=spray<-15?'LF':spray<15?'CF':'RF'; const f=F(fielder(pos)); res.pos=pos;
  const gap=Math.abs(spray)>10&&Math.abs(spray)<34;
  let pOut;
  if(type==='LD') pOut=0.30+(rng(f)-0.6)*0.3-(ev-90)*0.006;
  else pOut= dist>fence-30 ? 0.52+(rng(f)-0.6)*0.4 : 0.93+(rng(f)-0.6)*0.2-(dist<200?0.15:0);
  pOut=clamp(pOut,0.1,0.98);
  if(rnd()<pOut){ if(rnd()<(99-f.fld)/99*0.03){res.error=true;return res;} res.out=true; return res; }
  let hit='1B';
  if(dist>=fence-40) hit=rnd()<0.12+(bs-50)/250?'3B':'2B';
  else if(gap&&dist>215) hit=rnd()<0.72?(rnd()<0.08+(bs-50)/300?'3B':'2B'):'1B';
  else if(dist>265) hit=rnd()<0.55?'2B':'1B';
  else if(type==='LD'&&dist>180&&rnd()<0.2+(bs-50)/200) hit='2B';
  res.hit=hit; return res;
}

function describe(r){
  const where=r.pos?(AREA[r.pos]||POS_NAME[r.pos]):'';
  const tn={GB:'滾地球',LD:'平飛球',FB:'高飛球',PU:'內野高飛'}[r.type];
  const dd=` (${Math.round(r.ev)} mph, ${Math.round(r.la)}°, ${Math.round(r.dist)} ft)`;
  if(r.hit==='HR') return `${where}方向全壘打！飛行 ${Math.round(r.dist)} 英尺`+` (${Math.round(r.ev)} mph)`;
  if(r.error) return `${where}方向${tn}，${POS_NAME[r.pos]}失誤，打者上壘`+dd;
  if(r.dp) return `${POS_NAME[r.pos]}方向${tn}，雙殺！`+dd;
  if(r.out) return `${where}方向${tn}，${r.type==='GB'?'刺殺':'接殺'}出局`+dd;
  const hn={'1B':'一壘安打','2B':'二壘安打','3B':'三壘安打'}[r.hit];
  return `${r.infield?'內野':where}${r.infield?'':'方向'}${tn}，${hn}`+dd;
}

function addRuns(n){ if(!n)return; const li=G.inning-1, before=runs(G.half)-runs(1-G.half);
  G.line[G.half][li]=(G.line[G.half][li]||0)+n; curPitcher().ra+=n;
  // 超前分：記下當時雙方投手，比賽結束時用來判定勝投、敗投（最後一次超前的一定是贏的那隊）
  if(before<=0&&runs(G.half)>runs(1-G.half)){const bt=batTeam(); G.goAhead={side:G.half, wp:bt.pitchers[bt.pIdx], lp:curPitcher()};}
}

function forceWalk(b){const bs=G.bases;let s=0;if(bs[0]){if(bs[1]){if(bs[2])s++;bs[2]=bs[1];}bs[1]=bs[0];}bs[0]=b;return s;}

function applyInPlay(res){
  const b=curBatter(), bs=G.bases.slice(); let sc=0;
  const of=res.pos&&AREA[res.pos]?fielder(res.pos):null, arm=of?of.arm:60;
  if(res.hit==='HR'){sc=bs.filter(Boolean).length+1; G.bases=[null,null,null];}
  else if(res.hit==='3B'){sc=bs.filter(Boolean).length; G.bases=[null,null,b];}
  else if(res.hit==='2B'){const nb=[null,b,null]; if(bs[2])sc++; if(bs[1])sc++;
    if(bs[0]){if(rnd()<clamp(0.42+(bs[0].spd-50)/110-(arm-60)/220,0.1,0.9))sc++;else nb[2]=bs[0];} G.bases=nb;}
  else if(res.hit==='1B'||res.error){const nb=[b,null,null]; if(bs[2])sc++;
    if(bs[1]){if(!res.infield&&rnd()<clamp(0.55+(bs[1].spd-50)/110-(arm-60)/200,0.15,0.95))sc++;else nb[2]=bs[1];}
    if(bs[0]){if(!nb[2]&&!res.infield&&rnd()<clamp(0.28+(bs[0].spd-50)/140,0.05,0.7))nb[2]=bs[0];else nb[1]=bs[0];}
    G.bases=nb;}
  else if(res.dp){G.outs+=2; const nb=[null,null,null]; if(G.outs<3){if(bs[2])sc++; if(bs[1])nb[2]=bs[1];} G.bases=nb;}
  else { G.outs+=1;
    if(G.outs<3){
      if(res.type==='GB'){const nb=[null,null,null];
        if(bs[0]){nb[1]=bs[0]; if(bs[1]){nb[2]=bs[1]; if(bs[2])sc++;} else if(bs[2]){if(rnd()<0.5+(bs[2].spd-50)/150)sc++;else nb[2]=bs[2];}}
        else{ if(bs[1]){if(!bs[2]&&rnd()<0.55)nb[2]=bs[1];else nb[1]=bs[1];}
              if(bs[2]){if(rnd()<0.45+(bs[2].spd-50)/150)sc++;else nb[2]=bs[2];}}
        G.bases=nb;
      } else if(of){ const nb=bs.slice();
        if(bs[2]&&res.dist>=220&&rnd()<clamp(0.5+(bs[2].spd-50)/150-(arm-60)/220+(res.dist-240)/300,0.05,0.97)){sc++;nb[2]=null;res.sf=true;}
        if(bs[1]&&!nb[2]&&res.dist>=280&&rnd()<0.5){nb[2]=bs[1];nb[1]=null;}
        G.bases=nb;}
    }
  }
  addRuns(sc);
  const st=b.st; st.pa++;
  if(!res.sf) st.ab++;
  if(res.sf) st.sf++;
  if(res.hit){st.h++; G.hits[G.half]++; if(res.hit==='HR')st.hr++; if(res.hit==='2B')st.d2++; if(res.hit==='3B')st.d3++;}
  if(res.error) G.errors[1-G.half]++;
  if(!res.error&&!res.dp) st.rbi+=sc;
  return sc;
}

// 回傳 {kind, text, done(打席結束)}；順便記下投手這一球的成績（出局數、被安打、保送、三振…）
function processPitch(P, sw){
  const p=curPitcher(), o0=G.outs, out=pitchResult(P,sw), s=p.ps;
  if(!s) return out;
  s.outs+=Math.min(3,G.outs)-o0;
  if(out.done) s.bf++;
  if(out.kind==='k') s.so++; else if(out.kind==='bb') s.bb++; else if(out.kind==='hbp') s.hbp++;
  else if(out.bb&&out.bb.hit){s.h++; if(out.bb.hit==='HR')s.hr++;}
  return out;
}
function pitchResult(P, sw){
  const b=curBatter(), p=curPitcher(); spendEnergy(p,P);
  const inZ=isStrike(P.x,P.y);
  let out={kind:'', text:'', done:false, runs:0};
  const endK=()=>{G.outs++; b.st.pa++; b.st.ab++; b.st.so++; out.done=true;};
  if(sw.type==='none'){
    const hbpSide=b.bats==='R'?P.x<-1.5:P.x>1.5;
    if(hbpSide&&P.y>1.2&&P.y<4.6&&rnd()<0.6){out.kind='hbp';out.text='觸身球，保送上壘';out.runs=forceWalk(b);addRuns(out.runs);b.st.pa++;b.st.hbp++;out.done=true;return out;}
    if(inZ){G.strikes++; out.kind='strike'; out.text='好球（站著看）';
      if(G.strikes>=3){endK();out.kind='k';out.text='三振出局（站著看）';}}
    else {G.balls++; out.kind='ball'; out.text='壞球';
      if(G.balls>=4){out.kind='bb';out.text='四壞球保送';out.runs=forceWalk(b);addRuns(out.runs);b.st.pa++;b.st.bb++;out.done=true;}}
    return out;
  }
  const c=contactCalc(b,p,P,sw);
  if(!c.hit){G.strikes++; out.kind='strike'; out.text=`揮棒落空（${c.tag}）`;
    if(G.strikes>=3){endK();out.kind='k';out.text=`揮棒落空，三振出局`;} return out;}
  if(c.foul){ if(G.strikes<2)G.strikes++; out.kind='foul'; out.text='界外球'; return out;}
  const r=battedBall(c.ev,c.la,c.spray,b);
  out.kind='inplay'; out.bb=r; out.sweet=c.sweet; out.runs=applyInPlay(r); out.text=describe(r)+(r.sf?'，高飛犧牲打':''); out.done=true;
  return out;
}

// 打席結束後推進；回傳事件
function endPA(){
  const t=batTeam(); t.bIdx=(t.bIdx+1)%9; G.balls=0; G.strikes=0; G.paPitches=[];
  const a=runs(0), h=runs(1);
  if(G.half===1&&G.inning>=9&&h>a){G.over=true;return 'walkoff';}
  if(G.outs>=3){
    if(G.half===0&&G.inning>=9&&h>a){G.over=true;return 'final';}
    if(G.half===1&&G.inning>=9&&a!==h){G.over=true;return 'final';}
    if(G.half===1&&G.inning>=12){G.over=true;return 'tie';}
    G.outs=0; G.bases=[null,null,null];
    if(G.half===0){G.half=1; G.line[1][G.inning-1]=G.line[1][G.inning-1]||0;}
    else {G.half=0; G.inning++; G.line[0][G.inning-1]=0;}
    return 'switch';
  }
  return 'next';
}
function changePitcher(t, i){ t.pIdx=i; const p=t.pitchers[i]; p.used=true;
  if(G){const s=G.teams.indexOf(t); p.entryLead=runs(s)-runs(1-s);}   // 上場時領先幾分（判定救援成功用）
}
function aiBullpen(){
  const t=fldTeam(), p=t.pitchers[t.pIdx];
  if(!aiNeedsChange(p)) return null;
  // 九局以後、領先 1~3 分時優先派終結者；其他情況派還沒上場的中繼
  const lead=runs(1-G.half)-runs(G.half), save=G.inning>=9&&lead>=1&&lead<=3;
  const free=i=>!t.pitchers[i].used, idx=t.pitchers.map((_,i)=>i);
  let n=save?idx.find(i=>free(i)&&t.pitchers[i].role==='終結'):undefined;
  if(n===undefined) n=idx.find(i=>free(i)&&t.pitchers[i].role==='中繼');
  if(n===undefined) n=idx.find(free);
  if(n===undefined) return null;
  changePitcher(t,n); return t.pitchers[n];
}

/* ---------- 替補：代打、代跑、換守備 ----------
   替補換上來就接下被換掉的人的打序與守位；被換下的人不能再上場（記在 t.gone，賽後成績表會列出來）。 */
const SUB_KIND={ph:'代打', pr:'代跑', def:'守備'};
const batVal=(b,p)=>{const plat=p&&b.bats!==p.throws?3:0;   // 和 autoLineup 的打擊評分一樣，另外算左右投打相剋
  return (b.con+plat+b.pow)/2*0.7+b.eye*0.1+b.spd*0.1;};
const defVal=(b,pos)=>(b.fld+b.thr+b.arm)/3-(b.natPos===pos?0:b.alt.includes(pos)?6:18);
function substitute(t, slot, benchIdx, kind){
  const old=t.lineup[slot], nw=t.bench.splice(benchIdx,1)[0];
  setPos(nw,old.pos); nw.sub=kind; nw.subFor=old.name;
  old.slot=slot; t.gone.push(old); t.lineup[slot]=nw;
  if(G){const bi=G.bases.indexOf(old); if(bi>=0) G.bases[bi]=nw;}   // 代跑：壘上的人也要換
  return {old, nw, text:kind==='def'?`${t.short}換守備：${nw.name} 替換 ${old.name}，守${POS_NAME[nw.pos]}`
    :`${t.short}${SUB_KIND[kind]}：${nw.name}（${POS_NAME[nw.natPos]}）替換 ${old.name}`};
}
// 兩名打線上的球員對調守位
function swapPos(t, a, b){
  const A=t.lineup[a], B=t.lineup[b], pa=A.pos; setPos(A,B.pos); setPos(B,pa);
  return {text:`${t.short}守位調整：${A.name} 改守${POS_NAME[A.pos]}、${B.name} 改守${POS_NAME[B.pos]}`};
}
// 電腦球隊的換人，在每個打席開始前呼叫；回傳換人說明（給比賽紀錄用）
function aiSubs(){
  const msgs=[], bt=batTeam(), ft=fldTeam(), bIdx=G.half, fIdx=1-G.half;
  const diff=runs(bIdx)-runs(fIdx);   // 進攻方領先幾分
  // 守備方：每個半局開始時一次。先把代打、代跑留下來守非本職的人換掉；八局後領先 1~3 分再換上守備好的替補
  const key=G.inning*2+G.half;
  if(fIdx!==G.human&&ft.defKey!==key){ ft.defKey=key; let late=G.inning>=8&&-diff>=1&&-diff<=3;
    ft.lineup.forEach((b,slot)=>{ if(b.pos==='DH')return;
      let bi=-1, best=defVal(b,b.pos)+(b.pen?0:12);
      if(!b.pen&&!late) return;
      ft.bench.forEach((c,i)=>{const v=defVal(c,b.pos); if(c.natPos===b.pos||c.alt.includes(b.pos)) if(v>best){best=v;bi=i;}});
      if(bi<0) return;
      if(!b.pen) late=false;   // 守備加強一個半局只換一人
      msgs.push(substitute(ft,slot,bi,'def').text);
    });
  }
  if(bIdx===G.human||!bt.bench.length) return msgs;
  const close=G.inning>=8&&diff>=-1&&diff<=0;
  // 代跑：八局後追平或超前的那一分在壘上，跑者慢就換快腿（不拿捕手當代跑）
  if(close) for(let i=2;i>=0;i--){ const r=G.bases[i]; if(!r||r.spd>=50) continue;
    let bi=-1, best=r.spd+20;
    bt.bench.forEach((c,j)=>{if(c.natPos!=='C'&&c.spd>=best){best=c.spd;bi=j;}});
    if(bi>=0){msgs.push(substitute(bt,bt.lineup.indexOf(r),bi,'pr').text); break;}
  }
  // 代打：七局後比分接近（落後 3 分到領先 1 分），九局或得點圈有人時更積極
  const b=curBatter(), p=curPitcher();
  if(G.inning>=7&&diff>=-3&&diff<=1&&!b.sub){
    const need=(G.inning>=9||G.bases[1]||G.bases[2])?5:9;
    const cs=bt.bench.filter(c=>c.natPos==='C').length;
    let bi=-1, best=batVal(b,p)+need;
    bt.bench.forEach((c,j)=>{ if(b.pos==='C'&&c.natPos!=='C'&&cs===0) return;   // 換掉唯一的捕手後要有人能守
      if(c.natPos==='C'&&cs<=1&&b.pos!=='C') return;                             // 留一名捕手備用
      const v=batVal(c,p); if(v>best){best=v;bi=j;}});
    if(bi>=0) msgs.push(substitute(bt,bt.bIdx,bi,'ph').text);
  }
  return msgs;
}
// ===== ENGINE END =====

/* ---------- 累積成績（排行榜用） ----------
   每場比賽結束後把兩隊上場球員的成績加進 L.stats[球員id]，球隊出賽場數加在 t.gp（算規定打席、規定局數）。
   失分全部當成自責分；勝投＝最後一次超前時的己方投手（先發未投滿 5 局改給投最多局的中繼），敗投＝被超前時的對方投手，
   救援＝勝隊最後一位投手、不是勝投，上場時領先 1～3 分或投滿 3 局。 */
const STAT_KEYS=['g','pa','ab','h','d2','d3','hr','rbi','bb','hbp','sf','so',          // 打擊
  'pg','gs','w','l','sv','bf','outs','ph','phr','pbb','phbp','pso','pr'];               // 投球（p 開頭＝被打出的）
const blankStats=()=>Object.fromEntries(STAT_KEYS.map(k=>[k,0]));
function gameDecisions(g){
  const R=s=>g.line[s].reduce((a,b)=>a+(b||0),0), a=R(0), h=R(1);
  if(a===h||!g.goAhead) return {};
  const ws=a>h?0:1, wt=g.teams[ws], ga=g.goAhead;
  let wp=ga.wp, lp=ga.lp;
  if(ga.side!==ws) return {};
  if(wp===wt.pitchers[0]&&wp.ps.outs<15){
    const rel=wt.pitchers.slice(1).filter(p=>p.used&&p.ps.outs>0).sort((x,y)=>y.ps.outs-x.ps.outs)[0];
    if(rel) wp=rel;
  }
  const fin=wt.pitchers[wt.pIdx];
  const sv=fin!==wp&&fin.ps.outs>0&&((fin.entryLead>=1&&fin.entryLead<=3)||fin.ps.outs>=9)?fin:null;
  return {wp, lp, sv};
}
function recordGame(L, g){
  if(!g||g.recorded) return null; g.recorded=true;
  if(!L.stats) L.stats={};
  const S=id=>L.stats[id]||(L.stats[id]=blankStats()), dec=gameDecisions(g);
  g.teams.forEach(t=>{
    const lt=L.teams.find(x=>x.id===t.id); if(lt) lt.gp=(lt.gp||0)+1;
    [...t.lineup,...t.gone].forEach(b=>{ if(!L.players[b.id]) return; const s=S(b.id), st=b.st; s.g++;
      ['pa','ab','h','d2','d3','hr','rbi','bb','hbp','sf','so'].forEach(k=>s[k]+=st[k]||0); });
    t.pitchers.forEach((p,i)=>{ if(!p.used||!L.players[p.id]) return; const s=S(p.id), ps=p.ps||{};
      s.pg++; if(i===0) s.gs++;
      s.bf+=ps.bf||0; s.outs+=ps.outs||0; s.ph+=ps.h||0; s.phr+=ps.hr||0; s.pbb+=ps.bb||0; s.phbp+=ps.hbp||0; s.pso+=ps.so||0; s.pr+=p.ra||0;
      if(p===dec.wp) s.w++; if(p===dec.lp) s.l++; if(p===dec.sv) s.sv++; });
  });
  return dec;
}
// 打擊／投球的比率數據；分母是 0 時回傳 null（排行榜不列）
const statRates=s=>{
  const q=(a,b)=>b>0?a/b:null, obp=q(s.h+s.bb+s.hbp,s.ab+s.bb+s.hbp+s.sf), slg=q(s.h+s.d2+2*s.d3+3*s.hr,s.ab);
  return {avg:q(s.h,s.ab), obp, slg, ops:obp!==null&&slg!==null?obp+slg:null,
    era:q(s.pr*27,s.outs), whip:q((s.ph+s.pbb)*3,s.outs), k9:q(s.pso*27,s.outs)};
};
const ipTxt=outs=>`${Math.floor(outs/3)}${outs%3?'.'+outs%3:''}`;   // 局數：10.2 ＝ 10 又 2/3 局

/* ---------- 聯賽：賽程、模擬、戰績、季後賽（比照美國職棒） ----------
   季賽每隊 36 場、36 天、每天每隊都打一場：同區對手各 4 場（16）、同聯盟另一區各 2 場（10）、跨聯盟各 1 場（10），主客場各半。
   季後賽每個聯盟 4 隊：2 個分區冠軍＋2 張外卡（分區冠軍以外勝率最高的兩隊），依勝率排種子。
   分區系列賽 1 對 4、2 對 3（五戰三勝）→ 聯盟冠軍賽（七戰四勝）→ 兩聯盟冠軍打總冠軍賽（七戰四勝）。
   L.season = {year, phase:'regular'|'post'|'done', days:[[{a,h,r}]], post:{round, field, series:[…]}, champ, history:[…]}
   r＝[客隊得分, 主隊得分]，還沒打是 null。季賽成績才算進排行榜（L.stats），季後賽不算。 */
const POST_ROUNDS=[{name:'分區系列賽', best:5}, {name:'聯盟冠軍賽', best:7}, {name:'總冠軍賽', best:7}];
const POST_HOME={5:[1,1,0,0,1], 7:[1,1,0,0,0,1,1]};   // 1＝高種子主場（2-2-1、2-3-2）
const SEASON_GAMES=36;
const lgName=id=>(LEAGUES.find(l=>l.id===id)||{}).name||'';
const divName=t=>{const l=LEAGUES.find(x=>x.id===t.lg); const d=l&&l.divs.find(x=>x.id===t.div); return d?d.name:'';};
// 單循環（圈法）：回傳每一輪的對戰 [x,y]；人數是奇數時補 null（輪空）
function circleRounds(ids){
  const a=ids.slice(); if(a.length%2) a.push(null);
  const n=a.length, out=[];
  for(let r=0;r<n-1;r++){ const ps=[]; for(let i=0;i<n/2;i++) ps.push([a[i],a[n-1-i]]); out.push(ps); a.splice(1,0,a.pop()); }
  return out;
}
function makeSchedule(L, seed){
  const g=mulberry32(seed||1), met={}, games=[];
  // 同一組對手輪流當主場：第 1、3 次由 id 較小的一方主場，第 2、4 次反過來
  const game=(x,y)=>{const k=x<y?x+'|'+y:y+'|'+x, n=met[k]=(met[k]||0)+1, lo=x<y?x:y, hi=x<y?y:x; return n%2?{a:hi,h:lo,r:null}:{a:lo,h:hi,r:null};};
  const ids=(lg,div)=>L.teams.filter(t=>t.lg===lg&&(!div||t.div===div)).map(t=>t.id);
  const leagueDays=LEAGUES.map(l=>{
    const D0=ids(l.id,l.divs[0].id), D1=ids(l.id,l.divs[1].id), days=[];
    // 4 輪分區內循環（每輪 5 天）；兩區各有一隊輪空，輪空的兩隊打跨區（每輪錯開對手）
    for(let c=0;c<4;c++){
      const r0=circleRounds(D0), r1=circleRounds(D1.slice(c).concat(D1.slice(0,c)));
      r0.forEach((ps,k)=>{ const day=[], bye=[];
        [...ps,...r1[k]].forEach(([x,y])=>{ if(x&&y) day.push(game(x,y)); else bye.push(x||y); });
        day.push(game(bye[0],bye[1])); days.push(day); });
    }
    // 再補 6 天跨區：讓每組跨區對手剛好 2 場
    [0,1,2,3,4,4].forEach(s=>days.push(D0.map((x,i)=>game(x,D1[(i+s)%5]))));
    return days;
  });
  const days=leagueDays[0].map((d,i)=>[...d,...leagueDays[1][i]]);
  // 跨聯盟 10 天：每隊每個對手 1 場，主客各 5 場
  const C=ids('capy'), B=ids('bara');
  for(let r=0;r<10;r++) days.push(C.map((x,i)=>r%2?{a:x,h:B[(i+r)%10],r:null}:{a:B[(i+r)%10],h:x,r:null}));
  for(let i=days.length-1;i>0;i--){const j=Math.floor(g()*(i+1)); [days[i],days[j]]=[days[j],days[i]];}   // 打亂日期
  return days;
}
function newSeason(L, year=1, history=[]){
  L.stats={}; L.teams.forEach(t=>t.gp=0);
  return {year, phase:'regular', days:makeSchedule(L, 20260926+year*7919), post:null, champ:null, history};
}
// 電腦對電腦：整場用一樣的引擎跑完（不動到正在進行的比賽 G）；record＝成績算進排行榜
function simLeagueGame(L, aId, hId, record){
  const prev=G, ta=L.teams.find(t=>t.id===aId), th=L.teams.find(t=>t.id===hId);
  const ga=gameTeam(L,aId), gh=gameTeam(L,hId);
  [ta,th].forEach(t=>t.rotIdx=(t.rotIdx+1)%Math.max(1,t.rotation.length));
  newGame(ga,gh,-1); let fresh=true, guard=0;
  while(!G.over&&guard++<3000){
    aiBullpen(); if(fresh){fresh=false; aiSubs();}
    const p=curPitcher(), b=curBatter(), c=aiChoosePitch(p,b), P=makePitch(p,c.idx,c.target,c.power,0);
    if(processPitch(P,aiSwing(b,p,P)).done){endPA(); fresh=true;}
  }
  const g=G, r=[runs(0),runs(1)], dec=record?recordGame(L,g):gameDecisions(g);
  G=prev; return {r, dec};
}
// 戰績：{id:{w,l,t,rs,ra,res:['W','L',…]}}，勝率＝(勝＋和/2)÷場數
function seasonStandings(L){
  const S={}, s=L.season;
  L.teams.forEach(t=>S[t.id]={id:t.id, w:0, l:0, t:0, rs:0, ra:0, hw:0, hl:0, aw:0, al:0, res:[]});
  (s?s.days:[]).forEach(day=>day.forEach(x=>{ if(!x.r) return;
    const [ra,rh]=x.r, A=S[x.a], H=S[x.h]; if(!A||!H) return;
    A.rs+=ra; A.ra+=rh; H.rs+=rh; H.ra+=ra;
    if(ra===rh){A.t++; H.t++; A.res.push('T'); H.res.push('T');}
    else if(ra>rh){A.w++; A.aw++; H.l++; H.hl++; A.res.push('W'); H.res.push('L');}
    else {H.w++; H.hw++; A.l++; A.al++; H.res.push('W'); A.res.push('L');}
  }));
  Object.values(S).forEach(x=>{const g=x.w+x.l+x.t; x.g=g; x.pct=g?(x.w+x.t/2)/g:0; x.diff=x.rs-x.ra;});
  return S;
}
const standCmp=S=>(a,b)=>S[b].pct-S[a].pct||S[b].diff-S[a].diff||S[b].w-S[a].w||(a<b?-1:1);
const gamesBack=(lead,x)=>((lead.w-x.w)+(x.l-lead.l))/2;
// 某聯盟的季後賽種子：[1 種子, …, 4 種子]（前兩名是分區冠軍）
function playoffSeeds(L, lg, S=seasonStandings(L)){
  const l=LEAGUES.find(x=>x.id===lg), cmp=standCmp(S);
  const winners=l.divs.map(d=>L.teams.filter(t=>t.lg===lg&&t.div===d.id).map(t=>t.id).sort(cmp)[0]).sort(cmp);
  const wild=L.teams.filter(t=>t.lg===lg&&!winners.includes(t.id)).map(t=>t.id).sort(cmp).slice(0,2);
  return [...winners,...wild];
}
const mkSeries=(round,lg,hi,lo,hs,ls)=>({round, lg, hi, lo, hs, ls, best:POST_ROUNDS[round].best, games:[], w:[0,0], winner:null});
function startPlayoffs(L){
  const s=L.season, S=seasonStandings(L), field={};
  const series=LEAGUES.flatMap(l=>{const sd=playoffSeeds(L,l.id,S); field[l.id]=sd;
    return [mkSeries(0,l.id,sd[0],sd[3],1,4), mkSeries(0,l.id,sd[1],sd[2],2,3)];});
  s.phase='post'; s.post={round:0, field, series};
}
function nextRound(L){
  const s=L.season, p=s.post, cur=p.series.filter(x=>x.round===p.round);
  if(p.round===POST_ROUNDS.length-1){
    const ws=cur[0]; s.champ=ws.winner; s.phase='done';
    s.history.push({year:s.year, champ:ws.winner, runner:ws.winner===ws.hi?ws.lo:ws.hi, w:ws.w.slice(), name:(L.teams.find(t=>t.id===ws.winner)||{}).name});
    return;
  }
  p.round++;
  const seedOf=(x,id)=>id===x.hi?x.hs:x.ls;
  if(p.round===1) LEAGUES.forEach(l=>{const [a,b]=cur.filter(x=>x.lg===l.id), A=[a.winner,seedOf(a,a.winner)], B=[b.winner,seedOf(b,b.winner)];
    const [hi,lo]=A[1]<B[1]?[A,B]:[B,A]; p.series.push(mkSeries(1,l.id,hi[0],lo[0],hi[1],lo[1]));});
  else { const S=seasonStandings(L), [a,b]=cur.map(x=>x.winner), hiFirst=standCmp(S)(a,b)<0;
    const [hi,lo]=hiFirst?[a,b]:[b,a]; p.series.push(mkSeries(2,'final',hi,lo,1,2)); }
}
// 目前要打的比賽（季賽：最早一天還沒打的；季後賽：這一輪每組系列賽的下一場）
function seasonPending(L){
  const s=L.season; if(!s) return [];
  if(s.phase==='regular'){
    const d=s.days.findIndex(day=>day.some(x=>!x.r)); if(d<0) return [];
    return s.days[d].map((x,i)=>({kind:'reg', d, i, a:x.a, h:x.h})).filter(x=>!s.days[d][x.i].r);
  }
  if(s.phase==='post') return s.post.series.map((x,si)=>({x,si})).filter(o=>o.x.round===s.post.round&&!o.x.winner).map(({x,si})=>{
    const gi=x.games.length, hiHome=POST_HOME[x.best][gi];
    return {kind:'post', si, gi, round:x.round, a:hiHome?x.lo:x.hi, h:hiHome?x.hi:x.lo};});
  return [];
}
// 寫入比賽結果；季後賽和局不算（要重打），回傳 false。季賽打完自動進季後賽，季後賽一輪打完自動排下一輪
function applyResult(L, it, ra, rh){
  const s=L.season;
  if(it.kind==='reg'){
    const x=s.phase==='regular'&&s.days[it.d]&&s.days[it.d][it.i]; if(!x||x.r) return false;
    x.r=[ra,rh];
    if(s.days.every(day=>day.every(y=>y.r))) startPlayoffs(L);
    return true;
  }
  const x=s.phase==='post'&&s.post.series[it.si]; if(!x||x.winner||x.games.length!==it.gi||ra===rh) return false;
  x.games.push({a:it.a, h:it.h, r:[ra,rh]});
  const win=ra>rh?it.a:it.h; x.w[win===x.hi?0:1]++;
  if(Math.max(...x.w)>x.best/2) x.winner=win;
  if(s.post.series.filter(y=>y.round===s.post.round).every(y=>y.winner)) nextRound(L);
  return true;
}
// 模擬一場（季後賽和局就重打）
function simPending(L, it){
  for(let k=0;k<6;k++){
    const res=simLeagueGame(L,it.a,it.h,it.kind==='reg');
    if(applyResult(L,it,res.r[0],res.r[1])||it.kind==='reg') return {it, r:res.r};
  }
  return null;
}
// 某隊接下來的比賽：季賽／季後賽回傳 {kind, a, h, …}；季後賽還在等其他系列賽打完回傳 {wait:true}；被淘汰或球季結束回傳 null
function teamNext(L, id){
  const s=L.season; if(!s) return null;
  if(s.phase==='regular'){
    for(let d=0;d<s.days.length;d++){const i=s.days[d].findIndex(x=>!x.r&&(x.a===id||x.h===id)); if(i>=0){const x=s.days[d][i]; return {kind:'reg', d, i, a:x.a, h:x.h};}}
    return null;
  }
  if(s.phase!=='post') return null;
  const mine=s.post.series.filter(x=>x.hi===id||x.lo===id); if(!mine.length) return null;
  const last=mine[mine.length-1];
  if(last.winner&&last.winner!==id) return null;
  if(!last.winner&&last.round===s.post.round) return seasonPending(L).find(x=>x.a===id||x.h===id)||null;
  return {wait:true};
}

/* ---------- 訓練與強化 ----------
   訓練：選一項能力 +1～3（年輕球員成長快，15% 大成功加倍，34 歲以上減半）；總評不能超過潛力。
   強化：+1～+5 級，每成功一級全部能力 +2、潛力 +4（多出來的空間可以再訓練）；等級越高成功率越低，失敗只扣費用。 */
const TRAIN_MENU={
  H:[['pow','力量訓練'],['con','打擊技巧'],['eye','選球眼'],['spd','跑壘訓練'],['fld','守備接球'],['thr','傳球訓練'],['arm','臂力訓練']],
  P:[['velo','球速訓練'],['ctrl','控球訓練'],['stam','體力訓練']],
};
const ENH_MAX=5, ENH_COST=[500,800,1200,1800,2500], ENH_RATE=[1,0.85,0.7,0.55,0.4];
const recalcOvr=p=>{p.ovr=p.kind==='H'?hitterOvr(p):pitcherOvr(p); return p.ovr;};
// key：能力名稱，或 'pitch0'、'pitch1'… 代表第幾個球種；roll：0~1 亂數（測試時可以指定）
function trainPlayer(p,key,roll=rnd(),roll2=rnd()){
  const pi=key.startsWith('pitch')?+key.slice(5):-1, label=pi>=0?p.pitches[pi].n:(TRAIN_MENU[p.kind].find(x=>x[0]===key)||[])[1];
  const get=()=>pi>=0?p.pitches[pi].r:p[key], set=v=>{if(pi>=0)p.pitches[pi].r=v; else p[key]=v;};
  const before=get(), ovrBefore=p.ovr;
  const top=abilCap(p,pi>=0?'pitch':key);
  if(before>=top) return {ok:false, msg:`${label}已經到${rarOf(p).name}卡的能力上限（${top}）`};
  const cap=Math.min(p.pot,rarCap(p));
  const capMsg=()=>p.pot<=rarCap(p)?`${p.name}已達潛力上限（${p.pot}），請先強化提升潛力`
    :`${p.name}已達${rarOf(p).name}卡的上限（總評 ${rarCap(p)}），合成升級或強化後才能繼續`;
  if(p.ovr>=cap) return {ok:false, msg:capMsg()};
  const ageK=p.age<=23?2:p.age<=28?1.5:p.age>=34?0.5:1, great=roll<0.15;
  let gain=Math.max(1,Math.round((1+roll2*1.2)*ageK*(great?2:1)));
  gain=Math.min(gain,top-before);
  set(before+gain); recalcOvr(p);
  while(p.ovr>cap&&gain>0){gain--; set(before+gain); recalcOvr(p);}   // 不超過潛力與稀有度上限
  if(gain<=0){set(before); recalcOvr(p); return {ok:false, msg:capMsg()};}
  return {ok:true, great, label, before, after:before+gain, gain, ovrBefore, ovrAfter:p.ovr,
    msg:`${great?'大成功！':''}${p.name} ${label} ${before} → ${before+gain}（總評 ${ovrBefore} → ${p.ovr}）`};
}
function enhancePlayer(p,roll=rnd()){
  const lv=p.enh||0; if(lv>=ENH_MAX) return {ok:false, msg:`${p.name}已經強化到 +${ENH_MAX}`};
  if(roll>=ENH_RATE[lv]) return {ok:true, success:false, level:lv, msg:`強化失敗……${p.name} 維持 +${lv}`};
  const keys=p.kind==='H'?['pow','con','eye','spd','fld','thr','arm']:['velo','ctrl','stam'];
  const ovrBefore=p.ovr;
  keys.forEach(k=>p[k]=Math.max(p[k],capAbil(p,k,p[k]+2)));
  if(p.kind==='P') p.pitches.forEach(x=>x.r=Math.max(x.r,capAbil(p,'pitch',x.r+2)));
  p.enh=lv+1; p.pot=Math.min(ABIL_MAX,p.pot+4); recalcOvr(p); if(p.pot<p.ovr)p.pot=p.ovr;
  return {ok:true, success:true, level:p.enh, ovrBefore, ovrAfter:p.ovr, msg:`強化成功！${p.name} 升到 +${p.enh}（總評 ${ovrBefore} → ${p.ovr}、潛力 ${p.pot}）`};
}

/* ---------- 稀有度與抽卡 ----------
   稀有度依總評分 7 級：白(普通) 綠(精良) 藍(稀有) 黃(完美) 紫(史詩) 橘(傳說) 紅(神話)。
   抽卡會「產生新球員」（自由球員裡沒有傳說、神話），抽到的直接簽進玩家球隊二軍。 */
/* 能力上限 150、球速最快 120 mph。min/max＝總評範圍；cap＝單項能力上限；vcap＝球速能力上限。
   球速換算：全力投球的最快球速＝60＋球速能力×0.4（topMph），所以 vcap 52/70/85/102/117/132/150
   對應最快 81/88/94/101/107/113/120 mph。白綠藍的其他能力維持 99（聯盟原有球員都在這三級）。 */
const RARITY=[ // 由高到低
  {id:'mythic',  name:'神話', min:115, max:150, cap:150, vcap:150, color:'#e0202a'},
  {id:'legend',  name:'傳說', min:100, max:114, cap:132, vcap:132, color:'#ff8a1a'},
  {id:'epic',    name:'史詩', min:87,  max:99,  cap:117, vcap:117, color:'#8a4fd8'},
  {id:'perfect', name:'完美', min:75,  max:86,  cap:102, vcap:102, color:'#e6c02a'},
  {id:'rare',    name:'稀有', min:68,  max:74,  cap:99,  vcap:85,  color:'#2f7fd1'},
  {id:'fine',    name:'精良', min:60,  max:67,  cap:99,  vcap:70,  color:'#2e9b56'},
  {id:'common',  name:'普通', min:0,   max:59,  cap:99,  vcap:52,  color:'#c9ced6'},
];
const ABIL_MAX=150, MPH_MAX=120;
const abilPct=v=>clamp(v/ABIL_MAX*100,0,100);                // 能力條的長度（150 是滿格）
const veloMph=v=>59+v*0.4;                                   // 力道 0.8 時的速球球速（全力再快 1 mph）
const topMph=v=>Math.min(MPH_MAX,Math.round(veloMph(v)+1));  // 球員卡上的「最快球速」
// 單項能力上限：依卡片稀有度；key 是 'velo' 時用球速上限，其他（含球種）用 cap
const abilCap=(p,key)=>{const r=RARITY.find(x=>x.id===p.rar)||rarityOf(p.ovr); return key==='velo'?r.vcap:r.cap;};
const capAbil=(p,key,v)=>clamp(Math.round(v),1,abilCap(p,key));
// 把所有能力壓到稀有度上限內。球速被壓下來的投手，用控球與球種補回原本的總評（不超過上限）
function fitRarityCaps(p){
  const before=p.ovr; let changed=false;
  ABILITY_KEYS[p.kind].forEach(k=>{const v=capAbil(p,k,p[k]); if(v!==p[k]){p[k]=v; changed=true;}});
  if(p.pitches) p.pitches.forEach(x=>{const v=capAbil(p,'pitch',x.r); if(v!==x.r){x.r=v; changed=true;}});
  if(!changed) return false;
  recalcOvr(p);
  for(let i=0;i<40&&p.ovr<before;i++){
    const keys=(p.kind==='P'?['ctrl']:ABILITY_KEYS.H).filter(k=>p[k]<abilCap(p,k)), ps=p.pitches?p.pitches.filter(x=>x.r<abilCap(p,'pitch')):[];
    if(!keys.length&&!ps.length) break;
    keys.forEach(k=>p[k]++); ps.forEach(x=>x.r++); recalcOvr(p);
  }
  p.pot=Math.max(p.pot,p.ovr);
  return true;
}
// 舊版的完美～神話卡（總評 75～99 的舊範圍）依原本在範圍裡的位置換算到新範圍
const OLD_BANDS={perfect:[75,79], epic:[80,84], legend:[85,89], mythic:[90,99]};
function upliftOldCard(p){
  const ob=OLD_BANDS[p.rar]; if(!ob) return false;
  const r=RARITY.find(x=>x.id===p.rar), old=p.ovr, f=clamp((old-ob[0])/(ob[1]-ob[0]),0,1);
  const target=Math.min(r.max,r.min+Math.round(f*(r.max-r.min)*0.6)+Math.max(0,old-ob[1]));   // 強化多出來的總評也帶過去
  if(target<=old) return false;
  shiftOvr(p,target); p.pot=clamp(Math.max(p.pot+(p.ovr-old),p.ovr),1,ABIL_MAX);
  return true;
}
const rarityOf=ovr=>RARITY.find(r=>ovr>=r.min);
const rarityRank=id=>RARITY.length-1-RARITY.findIndex(r=>r.id===id);   // 普通=0 … 神話=6
const GACHA={
  single:300, ten:2700,
  rates:{common:.40, fine:.30, rare:.17, perfect:.08, epic:.035, legend:.012, mythic:.003},
  epicPity:30,     // 連續 30 抽沒出史詩以上，第 30 抽必定史詩以上
  legendPity:90,   // 連續 90 抽沒出傳說以上，第 90 抽必定傳說以上
  salary:{common:60, fine:100, rare:180, perfect:300, epic:500, legend:800, mythic:1200}, // 抽卡新人合約（萬），不受薪資上限限制
};
// 依機率從指定的稀有度裡抽一個（只在 ids 之間按原本比例分配）
function rollRarity(ids,g=rnd){
  const tot=ids.reduce((a,id)=>a+GACHA.rates[id],0); let r=g()*tot;
  for(const id of ids){r-=GACHA.rates[id]; if(r<=0)return id;} return ids[ids.length-1];
}
// 抽 n 張；state={sinceEpic, sinceLegend}（會被更新）。回傳稀有度 id 陣列
function gachaRarities(state,n,g=rnd){
  const ALL=Object.keys(GACHA.rates), out=[];
  for(let i=0;i<n;i++){
    state.sinceEpic=(state.sinceEpic||0)+1; state.sinceLegend=(state.sinceLegend||0)+1;
    let pool=ALL;
    if(state.sinceLegend>=GACHA.legendPity) pool=['legend','mythic'];
    else if(state.sinceEpic>=GACHA.epicPity) pool=['epic','legend','mythic'];
    else if(n>=10&&i===n-1&&!out.some(r=>rarityRank(r)>=rarityRank('rare'))) pool=['rare','perfect','epic','legend','mythic']; // 十連保底
    const r=rollRarity(pool,g); out.push(r);
    if(rarityRank(r)>=rarityRank('epic')) state.sinceEpic=0;
    if(rarityRank(r)>=rarityRank('legend')) state.sinceLegend=0;
  }
  return out;
}
// 產生一名指定稀有度的新球員，簽進 teamId 的二軍
function createPlayer(L,{rarity,teamId,kind},g=rnd){
  const gi=(a,b)=>Math.floor(a+(b-a+1)*g()), pick=a=>a[gi(0,a.length-1)];
  const R=RARITY.find(r=>r.id===rarity), lo=Math.max(45,R.min), hi=lo+Math.round((R.max-lo)*0.6), target=gi(lo,hi);   // 落在範圍的下面 6 成，留空間訓練
  kind=kind||(g()<0.55?'H':'P');
  const names=new Set(Object.values(L.players).map(p=>p.name)); let name, guard=0;
  do{name=pick(SURN)+pick(GIV)+(g()<0.75?pick(GIV):'');}while((names.has(name)||name[1]===name[2])&&guard++<500);
  const nums=Object.keys(L.players).map(id=>+id.slice(1)).filter(Number.isFinite);
  const id=(kind==='H'?'b':'p')+String(Math.max(0,...nums)+1).padStart(4,'0');
  let p, keys;
  if(kind==='H'){
    const pos=pick(Object.keys(POS_T)), t=POS_T[pos], d=DEFR[pos], r2=r=>gi(r[0],r[1]);
    p={id, kind:'H', name, pos, alt:t.alt.slice(), bats:g()<0.32?'L':'R', pow:r2(t.pow), con:r2(t.con), spd:r2(t.spd), fld:r2(d[0]), thr:r2(d[1]), arm:r2(d[2])};
    p.eye=clamp(p.con+gi(-12,10),1,99);
    p.throws=p.bats==='L'&&['1B','LF','CF','RF','DH'].includes(pos)&&g()<0.6?'L':'R';
    const base=target>=80?1:target<60?-1:0;
    p.hz=Array.from({length:9},()=>clamp(base+(g()<0.35?(g()<0.5?-1:1):0),-2,2));
    keys=['pow','con','eye','spd','fld','thr','arm'];
  } else {
    const prole=g()<0.45?'SP':g()<0.85?'RP':'CL', t=PITCH_T[prole];
    p={id, kind:'P', name, prole, pos:'P', throws:g()<0.3?'L':'R', bats:g()<0.25?'L':'R',
      velo:gi(...t.velo), ctrl:gi(...t.ctrl), stam:gi(...t.stam), pitches:withBaseFastball(pick(ARCH).slice(0,t.n)).map(n=>({n, r:gi(60,85)}))};
    keys=['velo','ctrl'];
  }
  p.rar=rarity; ABILITY_KEYS[kind].forEach(k=>p[k]=capAbil(p,k,p[k])); if(p.pitches)p.pitches.forEach(x=>x.r=capAbil(p,'pitch',x.r));
  // 全部能力一起上下調，讓總評落在這個稀有度的範圍
  for(let i=0;i<80;i++){
    const ov=recalcOvr(p); if(ov>=lo&&ov<=hi&&Math.abs(ov-target)<=1) break;
    const step=ov<target?1:-1;
    keys.forEach(k=>p[k]=capAbil(p,k,p[k]+step)); if(p.pitches) p.pitches.forEach(x=>x.r=capAbil(p,'pitch',x.r+step));
  }
  const rank=rarityRank(rarity);
  p.age=rank>=5?gi(22,31):rank>=3?gi(20,30):gi(18,28);
  p.tier=rank>=5?'star':rank>=3?'reg':p.age<=23?'prospect':'bench';
  p.height=kind==='P'?gi(175,198):gi(170,192); p.weight=Math.round((p.height-100)*gi(86,106)/100);
  p.hometown=pick(HOMETOWNS);
  p.pot=clamp(p.ovr+(p.age<=22?gi(5,15):p.age<=26?gi(2,8):gi(0,3)),p.ovr,ABIL_MAX);
  p.salary=GACHA.salary[rarity]; p.years=3; p.enh=0;
  const t=L.teams.find(x=>x.id===teamId), taken=new Set(t?[...t.roster,...t.farm].map(x=>L.players[x].num):[]);
  p.num=0; while(taken.has(p.num)&&p.num<99)p.num++;   // 背號：隊上最小的空號
  L.players[id]=p; p.team=null; p.level=null; L.freeAgents.push(id);
  movePlayer(L,id,teamId,2);    // 會處理背號重複
  return p;
}

/* ---------- 卡片稀有度（固定在卡上）與合成 ----------
   每張卡有固定的稀有度 p.rar。總評上限 = 該稀有度的最高總評 + 強化等級×2；訓練、強化都不會讓卡升級，
   只有「合成」能讓稀有度往上一級：同稀有度 5 張 → 主卡升一級、另外 4 張消耗掉。 */
const rarOf=p=>RARITY.find(r=>r.id===p.rar)||rarityOf(p.ovr);
const rarCap=p=>Math.min(ABIL_MAX,rarOf(p).max+2*(p.enh||0));
const RARE_CAP=RARITY.find(r=>r.id==='rare').max;   // 聯盟球員上限（74）
const SYNTH_N=5;
// 合成成功率（依升級後的稀有度）；失敗：4 張材料照樣消耗、主卡不變。每失敗一次，下次合到同一級 +5%（成功後歸零）
const SYNTH_RATE={fine:.95, rare:.85, perfect:.70, epic:.55, legend:.40, mythic:.25}, SYNTH_FAIL_BONUS=.05;
const ABILITY_KEYS={H:['pow','con','eye','spd','fld','thr','arm'], P:['velo','ctrl','stam']};
// 把能力一起往上／往下調，直到總評到 target（不使用亂數，結果固定）
function shiftOvr(p,target){
  const keys=ABILITY_KEYS[p.kind];
  for(let i=0;i<120;i++){
    const ov=recalcOvr(p); if(ov===target) break;
    const step=ov<target?1:-1;
    keys.forEach(k=>p[k]=capAbil(p,k,p[k]+step)); if(p.pitches) p.pitches.forEach(x=>x.r=capAbil(p,'pitch',x.r+step));
    if(step<0&&recalcOvr(p)<target) break;   // 往下調時寧可停在 target 以上一點
  }
  return recalcOvr(p);
}
// 聯盟球員壓到「稀有」以下：75～95 依原本高低對應到 70～74，順序不變；年薪依新總評重算
function capLeaguePlayer(p){
  if(p.ovr>RARE_CAP){
    const old=p.ovr, target=70+Math.round((Math.min(old,95)-75)/20*4);
    shiftOvr(p,target); if(p.ovr>RARE_CAP) shiftOvr(p,RARE_CAP);
    p.pot=Math.min(RARE_CAP,Math.max(p.ovr,p.pot-(old-p.ovr)));
    const base=Math.max(0,p.ovr-45); p.salary=Math.max(50,Math.round((50+base*base*1.5)*(p.age<=24?0.6:1)/10)*10);
  }
  p.rar=rarityOf(Math.min(p.ovr,RARE_CAP)).id;
  fitRarityCaps(p);   // 球速壓到稀有度上限（白 81、綠 88、藍 94 mph）
  return p;
}
// 合成檢查：ids = 5 張卡，mainId = 主卡（保留並升級的那張）
function synthCheck(L,ids,mainId,bonus=0){
  const ps=ids.map(id=>L.players[id]).filter(Boolean), main=L.players[mainId];
  if(ps.length!==SYNTH_N||new Set(ids).size!==SYNTH_N) return {ok:false, msg:`請選 ${SYNTH_N} 張卡`};
  if(!main||!ids.includes(mainId)) return {ok:false, msg:'請指定主卡'};
  const r=rarOf(main);
  if(ps.some(p=>rarOf(p).id!==r.id)) return {ok:false, msg:'5 張卡的稀有度必須相同'};
  const ri=RARITY.findIndex(x=>x.id===r.id); if(ri===0) return {ok:false, msg:'神話已經是最高稀有度'};
  const t=L.teams.find(x=>x.id===main.team); if(!t||ps.some(p=>p.team!==t.id)) return {ok:false, msg:'只能用自己球隊的球員合成'};
  const left=k=>[...t.roster,...t.farm].filter(id=>!ids.includes(id)||id===mainId).filter(id=>L.players[id].kind===k).length;
  if(left('H')<9||left('P')<5) return {ok:false, msg:'合成後球隊的野手或投手會不夠打比賽'};
  const to=RARITY[ri-1], target=Math.min(ABIL_MAX,Math.max(main.ovr+1,to.min+Math.round(Math.max(0,main.ovr-r.min)/Math.max(1,r.max-r.min)*2)));
  const rate=Math.min(1,SYNTH_RATE[to.id]+bonus);
  return {ok:true, from:r, to, target, rate, msg:`${main.name}：${r.name} → ${to.name}，總評 ${main.ovr} → 約 ${target}（成功率 ${Math.round(rate*100)}%）`};
}
// opt.bonus：失敗加成；opt.roll：0~1 亂數（不給就用 rnd）；opt.assumeSuccess：試算用，一律成功
function synthesize(L,ids,mainId,opt={}){
  const chk=synthCheck(L,ids,mainId,opt.bonus||0); if(!chk.ok) return chk;
  const main=L.players[mainId], t=L.teams.find(x=>x.id===main.team), mats=ids.filter(id=>id!==mainId);
  const names=mats.map(id=>L.players[id].name), ovrBefore=main.ovr;
  mats.forEach(id=>{t.roster=t.roster.filter(x=>x!==id); t.farm=t.farm.filter(x=>x!==id); delete L.players[id];});
  const success=opt.assumeSuccess||(opt.roll??rnd())<chk.rate;
  if(!success){
    fitRoster(L,t,false);
    return {ok:true, success:false, main, from:chk.from, to:chk.to, rate:chk.rate, ovrBefore, ovrAfter:main.ovr, consumed:names,
      msg:`合成失敗……${main.name} 維持${chk.from.name}（成功率 ${Math.round(chk.rate*100)}%），${names.length} 張材料已消耗`};
  }
  main.rar=chk.to.id; shiftOvr(main,chk.target);
  main.pot=Math.min(ABIL_MAX,Math.max(main.pot,chk.to.max));       // 新稀有度的上限都可以訓練上去
  fitRoster(L,t,false);
  return {ok:true, success:true, main, from:chk.from, to:chk.to, rate:chk.rate, ovrBefore, ovrAfter:main.ovr, consumed:names,
    msg:`合成成功！${main.name} 升級為${chk.to.name}（總評 ${ovrBefore} → ${main.ovr}）`};
}

/* ---------- 一鍵處理 ---------- */
// 一鍵配置：一軍挑 13 野手（每個守位至少一人、兩名捕手，其餘依總評）＋13 投手（5 名先發、1 名終結，其餘依總評），
// 其他人放二軍，再重排打序、守備位置、先發輪值與牛棚。回傳升上一軍與降到二軍的名單
function optimizeRoster(L,t){
  const P=id=>L.players[id], all=[...t.roster,...t.farm], before=new Set(t.roster);
  const H=all.filter(id=>P(id).kind==='H').sort((a,b)=>P(b).ovr-P(a).ovr);
  const PI=all.filter(id=>P(id).kind==='P').sort((a,b)=>P(b).ovr-P(a).ovr);
  const hit=new Set(), pit=new Set(), plays=(id,pos)=>P(id).pos===pos||P(id).alt.includes(pos);
  for(const pos of ['C','SS','CF','2B','3B','RF','LF','1B']){
    const id=H.find(x=>!hit.has(x)&&P(x).pos===pos)||H.find(x=>!hit.has(x)&&plays(x,pos)); if(id) hit.add(id);
  }
  const c2=H.find(x=>!hit.has(x)&&P(x).pos==='C'); if(c2) hit.add(c2);              // 第二捕手
  for(const id of H){ if(hit.size>=13) break; hit.add(id); }
  PI.filter(id=>P(id).prole==='SP'||P(id).stam>=60).slice(0,5).forEach(id=>pit.add(id));
  const cl=PI.find(id=>!pit.has(id)&&P(id).prole==='CL')||PI.find(id=>!pit.has(id)); if(cl) pit.add(cl);
  for(const id of PI){ if(pit.size>=13) break; pit.add(id); }
  t.roster=[...hit,...pit]; t.farm=all.filter(id=>!hit.has(id)&&!pit.has(id));
  t.roster.forEach(id=>P(id).level=1); t.farm.forEach(id=>P(id).level=2);
  autoLineup(L,t); autoStaff(L,t);
  return {up:t.roster.filter(id=>!before.has(id)), down:[...before].filter(id=>!t.roster.includes(id))};
}
// 一鍵合成：從最低稀有度開始，每輪用該稀有度「總評最高」的卡當主卡、「總評最低」的 4 張當材料，能合就一直合，再往上一級。
// opt.keepCore：一軍主力（打序、輪值、終結）不當材料；opt.keepEnh：強化過的卡不當材料；
// opt.maxTier：最多合到哪個稀有度；opt.reserveH / reserveP：球隊至少保留的野手、投手人數
// opt.bonus：各稀有度的失敗加成（會被更新）；opt.assumeSuccess：預覽用
function autoSynthesize(L,t,opt={}){
  const o={keepCore:true, keepEnh:true, maxTier:'mythic', reserveH:13, reserveP:13, bonus:{}, ...opt}, steps=[], P=id=>L.players[id];
  for(const r of RARITY.slice(1).reverse()){                          // 普通 → 傳說（當來源）
    if(rarityRank(r.id)+1>rarityRank(o.maxTier)) break;
    for(let guard=0;guard<300;guard++){
      const mine=[...t.roster,...t.farm], tier=mine.filter(id=>rarOf(P(id)).id===r.id);
      if(tier.length<SYNTH_N) break;
      const core=new Set([...t.lineup.map(x=>x.id),...t.rotation,t.closer].filter(Boolean));
      const main=tier.slice().sort((a,b)=>P(b).ovr-P(a).ovr)[0];
      const left={H:mine.filter(id=>P(id).kind==='H').length, P:mine.filter(id=>P(id).kind==='P').length}, mats=[];
      for(const id of tier.filter(x=>x!==main).sort((a,b)=>P(a).ovr-P(b).ovr)){
        if(mats.length>=SYNTH_N-1) break;
        const p=P(id);
        if(o.keepCore&&core.has(id)) continue;
        if(o.keepEnh&&p.enh) continue;
        if(left[p.kind]-1<(p.kind==='H'?o.reserveH:o.reserveP)) continue;
        left[p.kind]--; mats.push(id);
      }
      if(mats.length<SYNTH_N-1) break;
      const to=RARITY[RARITY.findIndex(x=>x.id===r.id)-1].id;
      const res=synthesize(L,[main,...mats],main,{bonus:o.bonus[to]||0, assumeSuccess:o.assumeSuccess}); if(!res.ok) break;
      o.bonus[to]=res.success?0:(o.bonus[to]||0)+SYNTH_FAIL_BONUS;
      steps.push({from:res.from, to:res.to, mainId:res.main.id, main:res.main.name, ovrBefore:res.ovrBefore, ovrAfter:res.ovrAfter, consumed:res.consumed, success:res.success, rate:res.rate});
    }
  }
  return steps;
}
// 預覽用：複製一份聯盟（不會動到原本的資料）
const cloneLeague=L=>({players:JSON.parse(JSON.stringify(L.players)), teams:JSON.parse(JSON.stringify(L.teams)), freeAgents:L.freeAgents.slice(), log:[]});

/* ---------- 球隊等級 ----------
   戰力 = 一軍先發打線 9 人＋先發輪值 5 人＋終結者的平均總評；等級 = (戰力 − 50) ÷ 2 + 1。
   單人對戰時，電腦對手的等級跟著玩家球隊等級走（可在設定調整難度），只在那一場比賽的複製資料上調整能力。 */
const LEVEL_STEP=2;
function teamPower(L,t){
  const ids=[...t.lineup.map(x=>x.id),...t.rotation,...(t.closer?[t.closer]:[])].filter(id=>L.players[id]);
  return ids.length?ids.reduce((s,id)=>s+L.players[id].ovr,0)/ids.length:0;
}
const levelOf=power=>clamp(Math.floor((power-50)/LEVEL_STEP)+1,1,99);
const teamLevel=(L,t)=>levelOf(teamPower(L,t));
// 比賽用球隊（先發打線＋這場的先發投手）的等級
const gameTeamLevel=gt=>{const c=[...gt.lineup,gt.pitchers[0]]; return levelOf(c.reduce((s,p)=>s+p.ovr,0)/c.length);};
/* 電腦難度：用球員卡的 7 級稀有度命名，對手固定調到該難度的等級（不跟著玩家等級走），
   等級大約是那個稀有度總評範圍的中間；能力上限（含球速）也照那個稀有度。
   unlock＝累積積分到這個數字才開啟；win＝贏球的基本積分。 */
const AI_TIERS=[
  {id:'common',  lv:3,  unlock:0,    win:10},
  {id:'fine',    lv:7,  unlock:30,   win:20},
  {id:'rare',    lv:11, unlock:100,  win:35},
  {id:'perfect', lv:16, unlock:250,  win:55},
  {id:'epic',    lv:22, unlock:500,  win:80},
  {id:'legend',  lv:29, unlock:900,  win:120},
  {id:'mythic',  lv:38, unlock:1500, win:180},
].map(t=>{const r=RARITY.find(x=>x.id===t.id); return {...t, name:r.name, color:r.color};});
// 等級差倍率：對手每比你高 1 級 +10%（最多 ×2），每比你低 1 級 −10%（最少 ×0.5）
const tierMult=(myLv,oppLv)=>clamp(1+(oppLv-myLv)*0.1,0.5,2);
// 一場比賽拿到的積分：贏球＝基本積分×等級差倍率，和局一半，輸球 0
function tierPoints(i,result,myLv,oppLv){
  if(result==='loss') return 0;
  return Math.round(AI_TIERS[i].win*tierMult(myLv,oppLv)*(result==='tie'?0.5:1));
}
// 把比賽用球隊（gameTeam 的複製）調到指定等級：全部能力一起加減，讓戰力接近目標
// rarId：調整後的能力上限照這個稀有度（電腦難度用；不給就是 150）
function scaleGameTeam(gt,targetLevel,rarId){
  const R=RARITY.find(r=>r.id===rarId), top=k=>R?(k==='velo'?R.vcap:R.cap):ABIL_MAX;
  const ps=[...gt.lineup,...(gt.bench||[]),...gt.pitchers], core=[...gt.lineup,gt.pitchers[0]];   // 先發打線＋先發投手估算戰力
  const powerOf=()=>core.reduce((s,p)=>s+p.ovr,0)/core.length;
  const before=levelOf(powerOf()), delta=Math.round((targetLevel-before)*LEVEL_STEP);
  for(const p of ps){
    (p.kind==='H'?['pow','con','eye','spd','fld','thr','arm']:['velo','ctrl','stam']).forEach(k=>p[k]=clamp(p[k]+delta,1,top(k)));
    if(p.pitches) p.pitches.forEach(x=>x.r=clamp(x.r+delta,1,top('pitch')));
    recalcOvr(p);
  }
  return {before, after:levelOf(powerOf()), delta};
}

// Node.js 用（例如模擬器或連線伺服器）：const E=require('./engine.js')
if(typeof module!=='undefined') module.exports={
  ABIL_MAX, MPH_MAX, veloMph, topMph, abilCap, capAbil, fitRarityCaps, upliftOldCard, OLD_BANDS,
  PITCH_DEFS, SHORT, POS_NAME, TEAM_DEFS, TIER_NAME, LEAGUE_SIZE, buildLeague, hitterOvr, pitcherOvr, SYNTH_RATE, SYNTH_FAIL_BONUS, teamPower, levelOf, teamLevel, scaleGameTeam, gameTeamLevel, AI_TIERS, tierMult, tierPoints, optimizeRoster, autoSynthesize, cloneLeague, rarOf, rarCap, RARE_CAP, SYNTH_N, capLeaguePlayer, shiftOvr, synthCheck, synthesize, RARITY, rarityOf, rarityRank, GACHA, gachaRarities, createPlayer, TRAIN_MENU, ENH_MAX, ENH_COST, ENH_RATE, trainPlayer, enhancePlayer, ensureBaseFastball, withBaseFastball, FB_BASE, fbArc, playerValue, needFactor, fitRoster, tradeCheck, aiOffer, executeTrade, signFA, releasePlayer, setLevel, payroll, SALARY_CAP, ROSTER_MAX, autoLineup, autoStaff, movePlayer, nextStarter, gameTeam, newGame, getG:()=>G,
  batTeam, fldTeam, curPitcher, curBatter, runs, fatigue, isStrike,
  makePitch, aiChoosePitch, aiSwing, aiBullpen, changePitcher, processPitch, endPA, substitute, swapPos, aiSubs, setPos, batVal, defVal, SUB_KIND,
  setRandom:f=>{rnd=f;}, mulberry32, matchShift, MATCH_BASE,
  STAT_KEYS, blankStats, gameDecisions, recordGame, statRates, ipTxt,
  LEAGUES, POST_ROUNDS, SEASON_GAMES, circleRounds, makeSchedule, newSeason, simLeagueGame, seasonStandings, standCmp, gamesBack,
  playoffSeeds, startPlayoffs, seasonPending, applyResult, simPending, teamNext,
};
