// 更新網站前執行：把 index.html 裡的版本號（style.css?v=…、players_db.js?v=…、載入 js 用的 V）換成現在的時間，
// 瀏覽器看到新的網址就會重新下載，不會拿快取裡的舊 CSS／JS 配新的 index.html。
// 執行：node tools/stamp-version.cjs
const fs = require('node:fs');
const path = require('node:path');
const file = path.join(__dirname, '..', 'index.html');
const d = new Date(), p = n => String(n).padStart(2, '0');
const v = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}${p(d.getHours())}${p(d.getMinutes())}`;
let s = fs.readFileSync(file, 'utf8');
const before = s;
s = s.replace(/(style\.css\?v=)[\w.-]+/, `$1${v}`)
     .replace(/(players_db\.js\?v=)[\w.-]+/, `$1${v}`)
     .replace(/(var V=')[\w.-]+(')/, `$1${v}$2`);
if (s === before) { console.error('index.html 裡找不到版本號，沒有改動'); process.exit(1); }
fs.writeFileSync(file, s);
console.log('版本號 →', v);
