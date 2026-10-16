# 오프라인 우선 (Anki 류 학습 앱)

## 원칙

- **기기의 SQLite 가 진짜 데이터**다. 화면은 로컬 DB 를 읽고 쓴다 — 네트워크가 없어도 모든 기능이 동작한다.
- 서버(Supabase)는 **백업·기기 간 동기화**용. 로그인한 사용자만, 원할 때.
- 동기화가 필요 없으면(혼자, 한 기기) 서버를 아예 쓰지 않는다 — 로그인·계정 삭제도 빼서 앱이 단순해진다(decisions.md).

## 로컬 DB: expo-sqlite

- 🤖 네이티브 PR: `npx expo install expo-sqlite` — 새 빌드.
- 스키마 버전은 `PRAGMA user_version` 으로 관리하고, 앱 시작 때 순서대로 올린다:

```ts
// src/lib/local-db.ts
const MIGRATIONS = [
  `create table decks (id text primary key, title text not null, updated_at integer not null, deleted integer not null default 0)`,
  `create table cards (id text primary key, deck_id text not null, front text not null, back text not null,
     due integer not null, interval integer not null, ease real not null, updated_at integer not null, deleted integer not null default 0)`,
  `create index cards_due on cards (deck_id, due)`,
];
export async function migrate(db) {
  const { user_version } = await db.getFirstAsync("pragma user_version");
  for (let v = user_version; v < MIGRATIONS.length; v++) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATIONS[v]);
      await db.execAsync(`pragma user_version = ${v + 1}`);
    });
  }
}
```

- **로컬 마이그레이션도 append-only** 다. 이미 출시된 앱 사용자 기기에 옛 스키마가 있다. 배열에 추가만 하고 고치지 않는다
  (Risk 스캐너가 `compat.device-storage` 로 표시한다). 마이그레이션 함수는 vitest 로 "v0 → 최신" 과 "v1 → 최신" 을 테스트한다
  (테스트에서는 node 용 SQLite 드라이버로 같은 SQL 을 돌린다).
- id 는 기기에서 만든다(UUID) — 오프라인에서 만든 행이 서버와 충돌하지 않게.
- 삭제는 `deleted = 1`(툼스톤) — 다른 기기에 삭제를 전파하려면 필요하다.

## 학습 로직(SRS)

SM-2 / FSRS 같은 스케줄링은 **순수 함수**(`review(card, grade, now) → card`)로 두고 vitest 로 충분히 테스트한다.
`now` 는 인자로 받는다(테스트 재현성, 시간대).

## 동기화 (필요할 때)

단순한 방식부터: **행 단위 최종 수정 우선(last-write-wins)**

1. Supabase 에 같은 모양의 테이블 + `user_id` + RLS(본인 행만).
2. 기기는 마지막 동기화 시각 이후 바뀐 로컬 행(`updated_at > last_sync`)을 upsert 로 올리고,
   서버에서 그 이후 바뀐 행을 내려받아 `updated_at` 이 더 큰 쪽을 남긴다.
3. 시계가 다른 기기 문제를 줄이려면 서버가 `updated_at` 을 찍는 RPC 를 쓴다.

복습 기록처럼 **추가만 되는 데이터**는 충돌이 없다(로그를 합치기만). 덱 편집 충돌이 잦아지면 PowerSync 같은 동기화 엔진을
검토한다(유료 구간 있음 — 결정 필요).

## 웹

`expo-sqlite` 는 웹에서 WASM 으로 동작하지만 저장소가 브라우저라 제한적이다. 웹 프리뷰는 "화면이 뜬다" 확인용으로 보고,
실제 데이터 검증은 jest/vitest 와 스테이징 앱으로 한다.
