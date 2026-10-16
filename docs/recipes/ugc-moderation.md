# 사용자 생성 콘텐츠: 신고·차단·필터 (Apple 1.2)

글·댓글·사진·프로필·채팅처럼 **다른 사용자가 보는 콘텐츠**가 있으면 App Store 심사에서 아래가 모두 필요하다.
없으면 거의 확실히 거절된다.

1. **부적절한 콘텐츠 필터** — 게시 전에 걸러내는 장치(금칙어, 이미지 검사 등)
2. **신고** — 콘텐츠·사용자를 신고하는 버튼, 그리고 **운영자가 제때(24시간 안) 처리**하는 절차
3. **차단** — 사용자를 차단하면 그 사람의 콘텐츠가 보이지 않는다
4. **운영자 연락처** — 앱 안과 스토어 정보에 문의 경로

## 데이터 (마이그레이션 예시)

```sql
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  target_type text not null check (target_type in ('post', 'comment', 'user', 'message')),
  target_id uuid not null,
  reason text not null check (char_length(reason) between 1 and 500),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);
alter table public.reports enable row level security;
grant insert, select on public.reports to authenticated;
-- 신고는 본인 것만 보고 만든다. 처리(status 변경)는 운영자 도구(service_role, Edge Function)만.
create policy "reports: insert own" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "reports: read own" on public.reports for select to authenticated using (reporter_id = auth.uid());

create table public.blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);
alter table public.blocks enable row level security;
grant select, insert, delete on public.blocks to authenticated;
create policy "blocks: own" on public.blocks for all to authenticated
  using (blocker_id = auth.uid()) with check (blocker_id = auth.uid());
```

콘텐츠 테이블의 SELECT 정책에서 차단한 사람의 글을 뺀다:

```sql
create policy "posts: read visible" on public.posts for select to authenticated using (
  not hidden
  and not exists (select 1 from public.blocks b where b.blocker_id = auth.uid() and b.blocked_id = posts.author_id)
);
```

신고가 일정 수(예: 3건) 쌓이면 자동으로 `hidden = true` 로 내리는 트리거를 두면 운영자가 늦어도 피해가 줄어든다.

## 필터

- 금칙어: Edge Function(`moderate-text`)에서 게시 전에 검사 — 목록은 DB 테이블(운영자가 수정)로.
- 이미지: 외부 API(예: 클라우드 비전의 SafeSearch)가 필요하면 비용·개인정보 문제라 **먼저 사용자에게 묻는다**.
  처음에는 "신고 + 자동 숨김 + 운영자 확인" 으로 시작해도 심사는 통과하는 경우가 많다.

## 운영자 처리

- 신고 알림: `reports` INSERT 트리거 → Edge Function → 운영자에게 이메일/Slack (24시간 대응).
- 처리 화면: 처음에는 Supabase 대시보드(Table editor)로 충분하다. 앱 안 관리자 화면을 만들면 관리자 판별은
  `app_metadata.role`(사용자가 못 바꾸는 값)으로 하고 RLS 로 막는다 — `user_metadata` 는 사용자가 바꿀 수 있어 쓰면 안 된다.

## 테스트

- `test/db/ugc.test.ts`: 남의 신고는 못 읽는다, 차단한 사람의 글이 안 보인다, 일반 사용자는 `status` 를 못 바꾼다.
- Playwright/jest: 글 상세의 "신고"·"차단" 메뉴가 보인다.

## 심사 메모

App Review Information 의 Notes 에 "신고: 글 … 메뉴 → 신고, 차단: 프로필 → 차단, 신고는 24시간 안에 처리" 를 적는다.
