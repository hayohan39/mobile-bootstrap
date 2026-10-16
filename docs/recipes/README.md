# 레시피

앱마다 필요 여부가 다른 기능의 "검증된 만드는 법". Claude 는 해당 기능을 만들기 전에 이 문서를 읽고,
결정이 필요한 것(비용·계정·법)은 먼저 사용자에게 묻고 `docs/decisions.md` 에 남긴다.

| 레시피 | 언제 | 스토어·법 |
| --- | --- | --- |
| [ugc-moderation.md](ugc-moderation.md) | 글·댓글·사진·채팅 (커뮤니티, 당근·인스타·틱톡류) | Apple 1.2 |
| [monetization.md](monetization.md) | 구독·인앱결제·광고, 예약·거래 결제 | Apple 3.1.1, Google 결제 정책, 한국 전기통신사업법 |
| [game.md](game.md) | 2D 게임 (디펜스 등) | 연령 등급 |
| [location.md](location.md) | 근처·동네·지도 | 위치정보법, 권한 문구 |
| [offline-sync.md](offline-sync.md) | 오프라인 우선 (Anki 류) | — |

템플릿에 이미 들어 있는 것(로그인·계정 삭제·푸시 토큰·강제 업데이트·킬스위치)은 코드와 `CLAUDE.md` 를 본다.

공통 원칙
- 네이티브 모듈을 추가하는 레시피는 **네이티브 변경**이다 — 그 모듈만 넣는 작은 PR 을 먼저(새 스테이징 빌드),
  화면은 다음 PR(OTA)로. 새 기능은 `app_config` 킬스위치로 끌 수 있게 만든다.
- 테이블을 추가하면 RLS 와 `test/db/` 의 "남의 것은 못 읽고 못 쓴다" 테스트를 같은 PR 에.
