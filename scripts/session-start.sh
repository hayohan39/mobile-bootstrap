#!/usr/bin/env bash
# Claude Code 세션 시작 훅. 클라우드(웹/모바일) 세션에서만 의존성을 설치해 두어
# Claude 가 바로 lint / test / 웹 export 를 돌릴 수 있게 한다. 로컬에서는 아무것도 안 한다.
set -euo pipefail
[ "${CLAUDE_CODE_REMOTE:-}" = "true" ] || exit 0
cd "${CLAUDE_PROJECT_DIR:-.}"
# gh 가 없으면 설치를 시도한다(scripts/gh.mjs 가 쓴다). 실패해도 세션은 계속한다.
if ! command -v gh >/dev/null 2>&1 && command -v apt-get >/dev/null 2>&1; then
  (apt-get install -y gh >/dev/null 2>&1 || { apt-get update >/dev/null 2>&1 && apt-get install -y gh >/dev/null 2>&1; }) || true
fi
if [ ! -d node_modules ]; then
  npm ci --no-audit --no-fund >/dev/null 2>&1 || npm install --no-audit --no-fund >/dev/null 2>&1 || true
fi
if [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  # 세션 프록시가 expo.dev 를 막을 수 있다. 오프라인 모드면 expo CLI 가 버전 조회·로그인 없이 동작한다.
  { echo "export EXPO_OFFLINE=1"; echo "export EXPO_NO_TELEMETRY=1"; } >> "$CLAUDE_ENV_FILE"
  # 브라우저 다운로드가 막혀 있으므로 미리 설치된 Chromium 을 Playwright 에 알려 준다.
  for chromium in /opt/pw-browsers/chromium /opt/pw-browsers/chromium-*/chrome-linux/chrome; do
    if [ -x "$chromium" ]; then echo "export PW_CHROMIUM_PATH=$chromium" >> "$CLAUDE_ENV_FILE"; break; fi
  done
fi
# 세션에 로컬 Postgres 가 있으면 켜 두고 테스트용 URL 을 알려 준다(없으면 DB 테스트는 건너뜀).
# Supabase 가 아닌 일반 Postgres 이므로 scripts/db.mjs 가 supabase/local-shim.sql 로 auth 기본기를 깐다.
if command -v pg_ctlcluster >/dev/null 2>&1 && [ -n "${CLAUDE_ENV_FILE:-}" ]; then
  version=$(ls /usr/lib/postgresql 2>/dev/null | sort -n | tail -1)
  [ -n "$version" ] && pg_ctlcluster "$version" main start >/dev/null 2>&1 || true
  if pg_isready -q -h localhost 2>/dev/null; then
    su postgres -c "psql -qc \"alter user postgres password 'postgres'\"" >/dev/null 2>&1 || true
    echo "export TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres" >> "$CLAUDE_ENV_FILE"
  fi
fi
exit 0
