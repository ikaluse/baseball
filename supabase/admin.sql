-- 投打對決：管理員權限（在 Supabase 的 SQL Editor 執行；要先執行過 schema.sql）
-- 管理員＝admins 表裡的雲端帳號。判斷在資料庫裡做，網頁上改暱稱、改程式都拿不到權限。
-- 管理員可以：看到所有玩家、改任何人的存檔（金幣、積分、整個聯盟）、重置玩家的聯盟。

-- 1. 管理員名單（網頁讀不到這張表，只能透過下面的 is_admin() 問「我是不是管理員」）
create table if not exists public.admins (
  user_id  uuid primary key references auth.users(id) on delete cascade,
  email    text,
  added_at timestamptz not null default now()
);
alter table public.admins enable row level security;

-- 2. 目前登入的人是不是管理員
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- 3. 管理員可以讀、改、刪所有人的存檔（一般玩家還是只能動自己的，見 schema.sql）
drop policy if exists "saves_admin_select" on public.saves;
drop policy if exists "saves_admin_update" on public.saves;
drop policy if exists "saves_admin_delete" on public.saves;
create policy "saves_admin_select" on public.saves for select using (public.is_admin());
create policy "saves_admin_update" on public.saves for update using (public.is_admin()) with check (public.is_admin());
create policy "saves_admin_delete" on public.saves for delete using (public.is_admin());

-- 4. 玩家清單（含 Email、最後登入時間；沒有存檔的帳號也列出來）。只有管理員能呼叫
create or replace function public.admin_players()
returns table (user_id uuid, email text, last_sign_in_at timestamptz, created_at timestamptz,
               rev bigint, profile jsonb, updated_at timestamptz, league_size int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_admin() then raise exception 'not admin'; end if;
  return query
    select u.id, u.email::text, u.last_sign_in_at, u.created_at, s.rev, s.profile, s.updated_at, coalesce(length(s.league), 0)
    from auth.users u left join public.saves s on s.user_id = u.id
    order by s.updated_at desc nulls last, u.created_at desc;
end;
$$;
revoke all on function public.admin_players() from public;
grant execute on function public.admin_players() to authenticated;

-- 5. 把你的帳號設成管理員：先在遊戲裡用這個 Email 註冊雲端帳號，把下面的 your-email@example.com 換成你的 Email 再執行
--    （要加其他管理員就把 Email 換掉，只執行這一段）
insert into public.admins (user_id, email)
select id, email from auth.users where lower(email) = lower('your-email@example.com')
on conflict (user_id) do nothing;

-- 確認：應該要看到你的 Email 一列
select * from public.admins;
