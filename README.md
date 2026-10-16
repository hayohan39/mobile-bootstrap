# mobile-bootstrap

Claude 클라우드 세션만으로 **Android·iOS 앱을 개발 → 스토어 출시 → 운영·업데이트** 하기 위한 템플릿 리포지토리.
[project-bootstrap](https://github.com/hayohan39/project-bootstrap) · [production-bootstrap](https://github.com/hayohan39/production-bootstrap)
의 개발 워크플로(세션에서 요청 → Claude 가 PR → 사람이 merge → 자동 배포)를 모바일에 맞게 옮긴 것이다.

- 앱: Expo SDK 57 (React Native) + Expo Router + TypeScript — 하나의 코드로 Android·iOS(·웹 프리뷰)
- 빌드·제출·OTA: EAS (Mac 없이 iOS 빌드)
- 백엔드: Supabase (Postgres + RLS, Auth, Storage, Realtime, Edge Functions)
- 운영: Sentry, Risk Score 기반 merge 게이트, 스테이징 → 단계적 출시 → 롤백

구성 작업 중이다. 설계와 사용법은 `CLAUDE.md`(프로젝트 규칙)와 이후 추가될 `docs/bootstrap/` 을 본다.

## 로컬 확인

```bash
npm ci
npm run check     # lint · typecheck · test · 웹 export · 웹 스모크
```
