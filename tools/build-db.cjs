// 產生球員資料庫：data/players.sqlite（可用 DB Browser for SQLite 等工具直接開）
// 以及 data/players_db.js（同一份資料庫轉成 base64，讓直接開 index.html 時也能讀到）
// 執行：node tools/build-db.cjs [亂數種子]
const { DatabaseSync } = require('node:sqlite');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../js/engine.js');

const seed = +process.argv[2] || 20260926;
const L = E.buildLeague(seed);
// 聯盟球員壓到稀有以下、球速照稀有度上限（和遊戲載入舊存檔時的轉換一樣）
Object.values(L.players).forEach(E.capLeaguePlayer);
L.teams.forEach(t => { E.autoLineup(L, t); E.autoStaff(L, t); });
const dir = path.join(__dirname, '..', 'data');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, 'players.sqlite');
fs.rmSync(file, { force: true });

const db = new DatabaseSync(file);
db.exec(`
CREATE TABLE meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE teams(
  id TEXT PRIMARY KEY, sort INTEGER, name TEXT, short TEXT, color TEXT, park TEXT, note TEXT,
  rot_idx INTEGER NOT NULL DEFAULT 0,
  gp INTEGER NOT NULL DEFAULT 0);                 -- 本季已出賽場數（排行榜的規定打席、局數）
CREATE TABLE players(
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('H','P')),   -- H 野手、P 投手
  team_id TEXT REFERENCES teams(id),             -- NULL = 自由球員
  level INTEGER CHECK(level IN (1,2)),            -- 1 一軍、2 二軍、NULL 自由球員
  num INTEGER, age INTEGER, tier TEXT,
  ovr INTEGER, pot INTEGER, salary INTEGER, years INTEGER,
  height INTEGER, weight INTEGER, hometown TEXT,
  pos TEXT, alt TEXT, bats TEXT, throws TEXT,
  pow INTEGER, con INTEGER, eye INTEGER, spd INTEGER, fld INTEGER, thr INTEGER, arm INTEGER,
  hot_zone TEXT,                                  -- 3x3 冷熱區 JSON，-2~2
  prole TEXT, velo INTEGER, ctrl INTEGER, stam INTEGER,
  enh INTEGER NOT NULL DEFAULT 0,                 -- 強化等級 0~5
  rar TEXT);                                      -- 卡片稀有度（common/fine/rare/perfect/epic/legend/mythic）
CREATE TABLE pitches(
  player_id TEXT NOT NULL REFERENCES players(id), ord INTEGER NOT NULL, name TEXT NOT NULL, rating INTEGER NOT NULL,
  PRIMARY KEY(player_id, ord));
CREATE TABLE transactions(                      -- 交易、簽約、釋出紀錄
  id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT, type TEXT CHECK(type IN ('trade','sign','release')),
  team_a TEXT, team_b TEXT, a_out TEXT, b_out TEXT);  -- a_out/b_out：兩邊送出的球員 id（JSON）
CREATE INDEX players_team ON players(team_id, level);
CREATE INDEX players_ovr ON players(ovr DESC);
CREATE INDEX players_pos ON players(kind, pos, prole);
`);

const insMeta = db.prepare('INSERT INTO meta VALUES (?,?)');
const insTeam = db.prepare('INSERT INTO teams VALUES (?,?,?,?,?,?,?,?,0)');
const insPlayer = db.prepare(`INSERT INTO players VALUES (${Array(33).fill('?').join(',')})`);
const insPitch = db.prepare('INSERT INTO pitches VALUES (?,?,?,?)');
const n = v => (v === undefined ? null : v);

db.exec('BEGIN');
insMeta.run('schema_version', '1');
insMeta.run('seed', String(seed));
insMeta.run('created', new Date().toISOString());
insMeta.run('scale150', '1');   // 已經是能力上限 150 的版本，遊戲載入時不用再轉換
L.teams.forEach((t, i) => insTeam.run(t.id, i, t.name, t.short, t.color, t.park, t.note, t.rotIdx));
for (const p of Object.values(L.players)) {
  insPlayer.run(p.id, p.name, p.kind, n(p.team), n(p.level), p.num, p.age, p.tier,
    p.ovr, p.pot, p.salary, p.years, p.height, p.weight, p.hometown,
    p.pos, p.alt ? p.alt.join(',') : null, p.bats, p.throws,
    n(p.pow), n(p.con), n(p.eye), n(p.spd), n(p.fld), n(p.thr), n(p.arm),
    p.hz ? JSON.stringify(p.hz) : null, n(p.prole), n(p.velo), n(p.ctrl), n(p.stam), p.enh || 0, p.rar || null);
  (p.pitches || []).forEach((x, i) => insPitch.run(p.id, i, x.n, x.r));
}
db.exec('COMMIT');
db.exec('VACUUM');
const count = db.prepare('SELECT COUNT(*) AS c FROM players').get().c;
db.close();

const bytes = fs.readFileSync(file);
fs.writeFileSync(path.join(dir, 'players_db.js'),
  `// 由 tools/build-db.cjs 產生，請勿手動修改。內容是 data/players.sqlite 的 base64。\nwindow.PLAYERS_DB_B64="${bytes.toString('base64')}";\n`);
console.log(`已寫入 ${count} 名球員：data/players.sqlite（${(bytes.length / 1024).toFixed(0)} KB）與 data/players_db.js`);
