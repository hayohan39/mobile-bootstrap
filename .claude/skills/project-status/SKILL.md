---
name: project-status
description: 사용자가 이 앱 프로젝트의 개발 상황·"어디까지 됐어?"·"PR 어떻게 됐어?"·스테이징/출시 상태·롤아웃·Risk 를 물을 때 사용한다. 열린 PR(CI·리뷰·Risk·네이티브 여부), 스테이징 배포·출시·롤백, 미결 결정을 모아 짧게 보고한다.
---

# 개발 현황 보고

사용자는 대개 휴대폰으로 읽는다. **10줄 안팎**으로, 결론부터.

## 1. 모으기

클라우드 세션에서는 GraphQL 이 막혀 `gh pr ...` 이 안 된다. REST 헬퍼를 쓴다:

```bash
git fetch origin main --quiet
node scripts/gh.mjs pr-list          # 열린 PR + Risk 라벨 + 체크
node scripts/gh.mjs pr-status <번호>  # 체크 상세 + 네이티브 변경 여부 + 프리뷰 + 종합 코멘트(Risk·리뷰·발견 사항)
node scripts/gh.mjs deploys          # 최근 스테이징 배포·출시·롤백 실행
git log origin/main --oneline -10    # 최근 merge
gh issue list --search "롤아웃 자동 중단" --state open   # rollout-monitor 가 연 사고 이슈 (REST 실패 시 생략)
```

스테이징 결과는 merge 된 PR 의 배포 코멘트(📦 OTA / 🧱 새 빌드 / ❌ / ⏭️)와 Actions 실행 요약에 있다.
출시 비율·심사 상태는 EAS·스토어 콘솔에 있어 세션에서 직접 못 볼 수 있다 — release / rollout-monitor 실행 요약으로
알 수 있는 만큼만 쓰고, 나머지는 "콘솔에서 확인 필요" 라고 적는다.
그리고 `docs/decisions.md` 에서 "미결" 항목을 확인한다.

## 2. 보고 형식

```
**요약** 한 줄 (예: PR 2개 중 1개 merge 가능, 스테이징 정상, production OTA 50% 롤아웃 중)

**merge 가능** — #12 단어장 화면: 🟡 MEDIUM 28 · ⚡ OTA · 리뷰 ✅ · 웹 프리뷰 <링크>
**조치 필요** — #13 카메라 업로드: 🟠 HIGH 52 · 🧱 새 빌드 필요 · 리뷰 ✋ (권한 문구 1건) · 롤백 계획 빠짐
**진행 중** — #14 …: CI ❌ auto-fix 2/3
**스테이징** — 10/5 #11 📦 OTA ✅ (폰에서 확인했나요?)
**출시** — 10/3 OTA 10% → 10/4 50% (rollout-monitor) / 스토어 1.1.0 심사 중
**결정 필요** — 로그인 방식, 스토어 계정 (decisions.md)

**다음 제안** 1~2개
```

- 사용자가 할 일(merge, 폰 확인, 출시 지시, CRITICAL 판단, 스토어 콘솔 버튼, 계정·키)은 굵게 표시한다.
- 롤아웃 자동 중단·스테이징 실패·CRITICAL PR 은 맨 위에 올린다.
- 🧱 네이티브 변경 PR 은 "merge 하면 새 스테이징 빌드를 설치해야 하고, 출시는 스토어 심사를 거친다" 를 한 번 상기시킨다.
- Risk 점수는 숫자만 전하지 말고 가장 큰 위험 요인 한 가지를 같이 적는다.
- 추측하지 않는다. 확인 못 한 항목은 "확인 못 함" 이라고 쓴다.
