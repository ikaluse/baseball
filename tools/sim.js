// 用 AI 對 AI 模擬大量比賽，檢查數值平衡
// 執行：node tools/sim.js [場數]
const E = require('../js/engine.js');
const N = +process.argv[2] || 400;
const L = E.buildLeague();
// 和遊戲的資料庫一樣：聯盟球員壓到稀有以下、球速照稀有度上限
Object.values(L.players).forEach(E.capLeaguePlayer);
L.teams.forEach(t => { E.autoLineup(L, t); E.autoStaff(L, t); });
const teams = L.teams, T = teams.length;
const S = {pa:0,h:0,hr:0,bb:0,hbp:0,so:0,sf:0,tb:0,r:0,pitches:0,ph:0,pr:0,def:0};
const W = {}; teams.forEach(t => W[t.id] = 0);
const GP = {}; teams.forEach(t => GP[t.id] = 0);
for (let i = 0; i < N; i++) {
  const a = teams[i % T].id, h = teams[(i + 1 + Math.floor(i / T) % (T - 1)) % T].id;
  GP[a]++; GP[h]++;
  const ga = E.gameTeam(L, a), gh = E.gameTeam(L, h);
  [a, h].forEach(id => { const t = teams.find(x => x.id === id); t.rotIdx++; });
  E.newGame(ga, gh, -1);
  let G = E.getG(), fresh = true;
  while (!G.over) {
    E.aiBullpen();
    if (fresh) { fresh = false; E.aiSubs(); }
    const p = E.curPitcher(), b = E.curBatter();
    const c = E.aiChoosePitch(p, b);
    const P = E.makePitch(p, c.idx, c.target, c.power, 0);
    const o = E.processPitch(P, E.aiSwing(b, p, P));
    S.pitches++;
    if (o.done) {
      S.pa++;
      if (o.kind === 'k') S.so++;
      if (o.kind === 'bb') S.bb++;
      if (o.kind === 'hbp') S.hbp++;
      if (o.kind === 'inplay') {
        const r = o.bb;
        if (r.sf) S.sf++;
        if (r.hit) { S.h++; S.tb += {'1B':1,'2B':2,'3B':3,'HR':4}[r.hit]; if (r.hit === 'HR') S.hr++; }
      }
      E.endPA(); fresh = true;
    }
  }
  G.teams.forEach(t => [...t.lineup, ...t.gone].forEach(b => { if (b.sub) S[b.sub]++; }));
  const ra = E.runs(0), rh = E.runs(1);
  S.r += ra + rh;
  if (ra > rh) W[a]++; else if (rh > ra) W[h]++;
}
const ab = S.pa - S.bb - S.hbp - S.sf, f = x => x.toFixed(3);
console.log(`模擬 ${N} 場`);
console.log(`打擊率 ${f(S.h/ab)}  上壘率 ${f((S.h+S.bb+S.hbp)/S.pa)}  長打率 ${f(S.tb/ab)}`);
console.log(`三振率 ${(S.so/S.pa*100).toFixed(1)}%  保送率 ${(S.bb/S.pa*100).toFixed(1)}%`);
console.log(`每隊每場得分 ${(S.r/N/2).toFixed(2)}  全壘打 ${(S.hr/N/2).toFixed(2)}  每打席用球 ${(S.pitches/S.pa).toFixed(2)}`);
console.log(`每場換人：代打 ${(S.ph/N).toFixed(2)}  代跑 ${(S.pr/N).toFixed(2)}  換守備 ${(S.def/N).toFixed(2)}`);
console.log('勝率：', teams.map(t => `${t.name} ${(W[t.id] / GP[t.id]).toFixed(3)}`).join('、'));
console.log(`球員總數 ${Object.keys(L.players).length}（每隊 ${teams[0].roster.length} 人，自由球員 ${L.freeAgents.length} 人）`);
