-- 앱 기본 테이블: 프로필 · 원격 설정(킬스위치·최소 지원 버전) · 푸시 토큰.
-- 모든 테이블은 RLS 를 켜고, 앱(공개 키)이 할 수 있는 일을 정책으로만 연다.

-- 프로필: 가입하면 자동으로 한 행. 본인만 읽고 고친다. 계정을 지우면 함께 지워진다.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) <= 50),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
grant select, update on public.profiles to authenticated;
create policy "profiles: read own" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles: update own" on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 원격 설정: 누구나(로그인 전 포함) 읽고, 아무도 앱에서 쓰지 못한다(대시보드·service_role 만).
--   min_version  {"ios": "1.0.0", "android": "1.0.0"} 보다 낮은 앱은 업데이트 화면을 띄운다
--   features     {"<기능>": false} 로 기능을 끈다(킬스위치). 로그인 수단도 여기서 켠다
--   maintenance  {"enabled": true, "message": "..."} 면 점검 화면
create table public.app_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.app_config enable row level security;
grant select on public.app_config to anon, authenticated;
create policy "app_config: read" on public.app_config for select to anon, authenticated using (true);
insert into public.app_config (key, value) values
  ('min_version', '{"ios": "0.0.0", "android": "0.0.0"}'),
  ('features', '{"login_apple": false, "login_google": false}'),
  ('maintenance', '{"enabled": false, "message": null}');

-- 푸시 토큰: 한 사용자가 여러 기기, 본인 것만.
create table public.push_tokens (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  token text not null check (char_length(token) <= 255),
  platform text not null check (platform in ('ios', 'android')),
  updated_at timestamptz not null default now(),
  primary key (user_id, token)
);
alter table public.push_tokens enable row level security;
grant select, insert, update, delete on public.push_tokens to authenticated;
create policy "push_tokens: own" on public.push_tokens for all to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
