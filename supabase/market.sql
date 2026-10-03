-- 速球王：玩家市場（掛賣球員卡）。在 Supabase 的 SQL Editor 執行一次（要先執行過 schema.sql）
-- 流程：賣家掛賣時卡片從自己的聯盟移出、放進 market 託管 → 買家買下時資料庫一次完成「標成已賣出」（同一張卡不會被兩個人買到）
--       → 買家的遊戲把卡加進自己的二軍、賣家的遊戲收款（扣 5% 手續費）；取消或 7 天沒賣掉，卡退回賣家。
-- 玩家只能透過下面的函式寫入；每一步都有 seller_done／buyer_done 記錄，網路斷掉也不會重複拿到。

create table if not exists public.market (
  id          bigint generated always as identity primary key,
  seller      uuid not null references auth.users(id) on delete cascade,
  seller_name text not null,
  card        jsonb not null,                    -- 球員資料（和遊戲裡的球員物件一樣）
  name        text, kind text, pos text, ovr int, rar text,   -- 方便篩選、排序
  price       int not null check (price between 100 and 9999999),
  target_code text,                              -- 指定買家的玩家代碼（帳號 id 前 8 碼）；空白＝所有人都能買
  status      text not null default 'open' check (status in ('open','sold','cancelled')),
  buyer       uuid references auth.users(id) on delete set null,
  buyer_name  text,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default now() + interval '7 days',
  sold_at     timestamptz,
  seller_done boolean not null default false,    -- 賣家已收款（賣出）或已拿回卡（取消、過期）
  buyer_done  boolean not null default false     -- 買家已拿到卡
);
create index if not exists market_open on public.market (status, expires_at);
create index if not exists market_seller on public.market (seller);
create index if not exists market_buyer on public.market (buyer);

alter table public.market enable row level security;
-- 看得到：所有人可以看的公開掛單、指定給自己的掛單、自己賣的、自己買的
drop policy if exists "market_select" on public.market;
create policy "market_select" on public.market for select using (
  (status = 'open' and expires_at > now() and (target_code is null or target_code = left(auth.uid()::text, 8)))
  or seller = auth.uid() or buyer = auth.uid()
);
-- 不開放直接新增、修改、刪除，一律走下面的函式

-- 掛賣（最多同時 5 張）
create or replace function public.market_sell(p_card jsonb, p_price int, p_seller_name text, p_target text default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare new_id bigint;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  if p_price < 100 or p_price > 9999999 then raise exception 'bad price'; end if;
  if (select count(*) from market where seller = auth.uid() and status = 'open' and expires_at > now()) >= 5 then
    raise exception 'too many listings'; end if;
  insert into market (seller, seller_name, card, name, kind, pos, ovr, rar, price, target_code)
  values (auth.uid(), left(coalesce(p_seller_name, ''), 24), p_card, p_card->>'name', p_card->>'kind',
          coalesce(p_card->>'prole', p_card->>'pos'), (p_card->>'ovr')::int, p_card->>'rar', p_price,
          nullif(lower(trim(coalesce(p_target, ''))), ''))
  returning id into new_id;
  return new_id;
end; $$;

-- 購買：只有還在賣、沒過期、不是自己的、而且沒有指定別人的掛單才買得到
create or replace function public.market_buy(p_id bigint, p_buyer_name text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare r market;
begin
  if auth.uid() is null then raise exception 'login required'; end if;
  update market set status = 'sold', buyer = auth.uid(), buyer_name = left(coalesce(p_buyer_name, ''), 24), sold_at = now()
  where id = p_id and status = 'open' and expires_at > now() and seller <> auth.uid()
    and (target_code is null or target_code = left(auth.uid()::text, 8))
  returning * into r;
  if r.id is null then raise exception 'not available'; end if;
  return jsonb_build_object('id', r.id, 'card', r.card, 'price', r.price);
end; $$;

-- 取消自己的掛單（卡會在 market_pending 退回）
create or replace function public.market_cancel(p_id bigint)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update market set status = 'cancelled' where id = p_id and seller = auth.uid() and status = 'open';
  return found;
end; $$;

-- 待處理：賣出的款項、取消或過期要退回的卡、買到還沒拿的卡
create or replace function public.market_pending()
returns table (id bigint, what text, card jsonb, price int, other text)
language sql stable security definer set search_path = public as $$
  select m.id, 'proceeds', null::jsonb, m.price, m.buyer_name from market m
    where m.seller = auth.uid() and m.status = 'sold' and not m.seller_done
  union all
  select m.id, 'return', m.card, m.price, null from market m
    where m.seller = auth.uid() and not m.seller_done and (m.status = 'cancelled' or (m.status = 'open' and m.expires_at <= now()))
  union all
  select m.id, 'purchase', m.card, m.price, m.seller_name from market m
    where m.buyer = auth.uid() and m.status = 'sold' and not m.buyer_done;
$$;

-- 遊戲處理完待處理項目後回報（過期的掛單順便標成取消）
create or replace function public.market_ack(p_ids bigint[])
returns void language plpgsql security definer set search_path = public as $$
begin
  update market set seller_done = true,
    status = case when status = 'open' and expires_at <= now() then 'cancelled' else status end
  where id = any(p_ids) and seller = auth.uid()
    and (status in ('sold', 'cancelled') or (status = 'open' and expires_at <= now()));
  update market set buyer_done = true where id = any(p_ids) and buyer = auth.uid() and status = 'sold';
end; $$;

revoke all on function public.market_sell(jsonb, int, text, text) from public;
revoke all on function public.market_buy(bigint, text) from public;
revoke all on function public.market_cancel(bigint) from public;
revoke all on function public.market_pending() from public;
revoke all on function public.market_ack(bigint[]) from public;
grant execute on function public.market_sell(jsonb, int, text, text) to authenticated;
grant execute on function public.market_buy(bigint, text) to authenticated;
grant execute on function public.market_cancel(bigint) to authenticated;
grant execute on function public.market_pending() to authenticated;
grant execute on function public.market_ack(bigint[]) to authenticated;
