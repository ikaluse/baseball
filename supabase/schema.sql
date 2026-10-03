-- 速球王：雲端存檔資料表（在 Supabase 專案的 SQL Editor 貼上執行一次）
-- 一個帳號一列：profile＝玩家資料（金幣、積分、設定…），league＝整個聯盟（SQLite 壓縮後的 base64）
-- rev 每次上傳 +1，用來發現「兩台電腦同時改過」的衝突

create table if not exists public.saves (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  rev        bigint not null default 1,
  profile    jsonb not null,
  league     text,
  updated_at timestamptz not null default now()
);

-- 每個人只能讀寫自己的存檔
alter table public.saves enable row level security;

drop policy if exists "saves_select_own" on public.saves;
drop policy if exists "saves_insert_own" on public.saves;
drop policy if exists "saves_update_own" on public.saves;
drop policy if exists "saves_delete_own" on public.saves;

create policy "saves_select_own" on public.saves for select using (auth.uid() = user_id);
create policy "saves_insert_own" on public.saves for insert with check (auth.uid() = user_id);
create policy "saves_update_own" on public.saves for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "saves_delete_own" on public.saves for delete using (auth.uid() = user_id);
