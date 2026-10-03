// 雲端同步設定（Supabase）。兩個值都在 Supabase 專案的 Project Settings → API：
//   url     ＝ Project URL（https://xxxx.supabase.co）
//   anonKey ＝ Project API keys 裡的 anon public（本來就是公開給網頁用的；資料靠 supabase/schema.sql 的權限規則保護）
// 留空就是不開雲端同步，遊戲照舊只存在這台電腦。
window.CLOUD_CONFIG = {
  url: 'https://groofrozqqinmdiplrdh.supabase.co',
  anonKey: 'sb_publishable_4kc81YdvqK-twzesAD8Xag_-2r97esT',
};
