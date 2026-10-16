---
name: new-project
description: mobile-bootstrap 템플릿 리포지토리에서, 사용자가 새 앱(Android·iOS)을 만들어 달라고 할 때 사용한다. new-project 워크플로를 실행해 GitHub 리포지토리·Supabase 프로젝트·EAS 프로젝트·브랜치 규칙을 한 번에 만들고, 같은 세션에서 이어서 개발한다.
---

# 새 앱 프로젝트 만들기

클라우드 세션은 GitHub 프록시 때문에 리포지토리를 직접 만들 수 없다(`gh repo create` 403).
대신 이 리포지토리의 `new-project.yml` 워크플로를 dispatch 한다. Actions 러너에는 프록시가 없다.

## 1. 입력 정하기 (한 번에 묻는다)

- **name**: 소문자/숫자/하이픈. 리포지토리·Supabase 프로젝트·EAS slug 가 된다. 규칙에 안 맞으면 고친 이름을 제안한다.
- **display_name**: 폰 홈 화면에 보이는 앱 이름(한국어 가능, 예: "단어 카드"). 나중에 바꿀 수 있다.
- **bundle_id**: 앱 식별자(예: `com.<github아이디>.<이름>`). **스토어에 한 번 올리면 바꿀 수 없다** —
  기본값을 보여 주고 확인받는다. 소문자·숫자·밑줄, 점으로 2단 이상, 하이픈 불가.
- **description**: 한 줄. 사용자가 설명한 앱의 목적.
- **로그인이 필요한가**: 필요 없으면(혼자 쓰는 학습 앱·오프라인 게임) 첫 PR 에서 로그인·계정 삭제 화면을 빼고
  `docs/decisions.md` 에 기록한다. 필요하면 방식(이메일 / Apple / Google)을 묻는다.
- visibility: 기본 private.

이름이 이미 있는 리포지토리와 겹치면 워크플로가 **그 리포지토리를 재사용**한다(재실행용 동작).
새 프로젝트인데 이름이 겹치면 다른 이름을 제안한다. Supabase 무료 플랜은 프로젝트가 2개까지다 — 한도에 걸리면
워크플로 요약에 나온다(기존 프로젝트 정리 또는 Pro 플랜).

## 2. 실행

```bash
node scripts/gh.mjs dispatch new-project.yml name=<name> display_name="<표시 이름>" bundle_id=<id> description="<설명>"
sleep 8
gh run list --workflow new-project.yml --limit 1      # REST 라서 된다
gh run watch <run-id> --exit-status
```

dispatch 가 안 되면 사용자에게 GitHub → Actions → New project → Run workflow 로 직접 실행해 달라고 안내한다.
실패하면 실패한 스텝 로그(`gh run view <id> --log-failed`)를 읽고 원인을 설명한다(시크릿 누락은 `docs/bootstrap/SETUP.md`).
같은 이름으로 다시 실행하면 이미 된 부분은 재사용하고 나머지만 채운다.

## 3. 이 세션에서 계속 개발한다

`add_repo`(세션에 리포지토리를 새로 붙이는) 도구가 **지금 이 세션에 있는지** 본다.

**있으면 — 같은 세션에서 바로 이어간다:**

1. `add_repo` 로 방금 만든 `<owner>/<name>` 을 붙인다(push 권한으로). 안내받은 대로 clone 하고
   `register_repo_root` 로 그 리포지토리의 CLAUDE.md·스킬을 불러온다.
2. 첫 스테이징 빌드(`deploy.yml`)는 EAS 큐에서 수십 분 걸릴 수 있다 — 기다리지 않고 개발을 시작한다.
3. 이제 이 세션은 새 프로젝트의 세션이다. **새로 불러온 CLAUDE.md 의 규칙**(브랜치 → 구현 → PR, merge 는 사용자)을 따라
   사용자가 설명한 앱을 실제로 만들기 시작한다 — "이제 개발하세요" 라고 멈추지 않는다.
   첫 기능 전에 `docs/decisions.md` 의 미결(로그인 필요 여부, 수익화, 위치 사용)을 먼저 묻는다.
   게임·커뮤니티·위치·결제 같은 앱이면 `docs/recipes/` 의 해당 문서를 먼저 읽는다.
4. 사용자에게 한 번에 알린다: 리포지토리·Supabase·EAS 가 만들어졌고, 같은 세션에서 개발을 시작한다는 것,
   그리고 아래 "사용자에게 남는 일".

**없으면** (예: Slack 이나 리포지토리를 붙일 수 없는 세션): run 요약(`gh run view <id>`)의 결과를 알리고,
claude.ai/code 에서 새 세션을 열어 `<owner>/<name>` 을 고르라고 안내한다.

## 사용자에게 남는 일 (체크리스트로 알린다)

- 첫 스테이징 빌드가 끝나면 merge 코멘트/EAS 링크에서 **APK 를 Android 폰에 설치**(iPhone 은 Apple 계정 연결 후 TestFlight).
- 새 리포지토리의 `docs/runbook.md` "처음 한 번": Sentry, Supabase 플랜·Auth 설정.
- 스토어 계정(오래 걸림): `docs/STORE-LAUNCH.md` 0번 — 특히 Google Play 개인 계정의 **테스터 12명·14일 비공개 테스트**.
- 워크플로 요약의 ⚠️ 항목(DB URL 시크릿, EAS 연결, 브랜치 규칙).
