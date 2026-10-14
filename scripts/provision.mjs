// [템플릿 전용] 새 프로젝트의 Supabase 프로젝트를 만들고 GitHub 리포지토리와 연결한다.
// new-project.yml 워크플로가 실행한다(EAS 프로젝트 연결은 같은 워크플로의 `eas init` 이 한다).
//
//   node scripts/provision.mjs --repo owner/name --scheme myapp [--region ap-northeast-2]
//       Supabase 프로젝트(이름 = 리포지토리 이름)를 찾거나 만든다 → API 키·Session pooler 주소 →
//       GitHub 시크릿 SUPABASE_DB_URL, 변수 SUPABASE_PROJECT_REF·EAS_PLATFORMS →
//       Auth 의 리디렉트 허용 주소(<scheme>://) → $GITHUB_OUTPUT 에 supabase_url, publishable_key
//   node scripts/provision.mjs --repo owner/name --protect
//       라벨 + main 브랜치 규칙(ruleset): PR 필수, 필수 체크 test·risk-gate, force push·삭제 금지.
//       초기화 push 뒤에 실행한다(규칙이 먼저 걸리면 초기화 커밋을 main 에 push 할 수 없다).
//
// 필요한 환경변수:
//   GH_TOKEN               대상 리포지토리에 시크릿/변수를 쓸 수 있는 토큰
//   SUPABASE_ACCESS_TOKEN  Supabase 개인 액세스 토큰 (Account → Access Tokens)
//   SUPABASE_ORG_ID        Supabase 조직 slug (Organization → Settings 의 Organization slug)
//
// 다시 실행해도 안전하다(같은 이름의 프로젝트가 있으면 재사용한다). 단 DB 비밀번호는 만들 때만 알 수 있으므로
// 재사용한 프로젝트에 SUPABASE_DB_URL 이 없으면 사용자가 대시보드에서 넣어야 한다(요약에 안내).
import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const API = process.env.SUPABASE_API_URL ?? 'https://api.supabase.com';

// ---------------------------------------------------------------------------
// 순수 함수 (test/template/provision.test.ts)

/** API 키 목록에서 앱에 넣을 공개 키: 새 publishable 키, 없으면 legacy anon. */
export function pickPublishableKey(keys) {
  const list = Array.isArray(keys) ? keys : [];
  const key = list.find((k) => k?.type === 'publishable') ?? list.find((k) => k?.name === 'anon');
  return key?.api_key ?? null;
}

/**
 * Supavisor 설정 → Session pooler 연결 문자열(포트 5432). GitHub 러너는 IPv6 를 못 써서
 * IPv6 전용인 직접 연결 대신 pooler 를 쓴다. 마이그레이션에는 transaction 모드(6543)가 아닌 session 모드.
 */
export function sessionPoolerUrl(pooler, ref, password) {
  const list = Array.isArray(pooler) ? pooler : [pooler];
  const primary = list.find((p) => p && (p.database_type ?? 'PRIMARY') === 'PRIMARY' && p.db_host) ?? list.find((p) => p?.db_host);
  if (!primary) return null;
  const user = primary.db_user ?? `postgres.${ref}`;
  const db = primary.db_name ?? 'postgres';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${primary.db_host}:5432/${db}`;
}

/** Auth 리디렉트 허용 목록에 앱 scheme 을 더한다(이미 있으면 그대로). */
export function redirectAllowList(current, scheme) {
  const items = String(current ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  for (const url of [`${scheme}://`, `${scheme}://**`]) if (!items.includes(url)) items.push(url);
  return items.join(',');
}

// ---------------------------------------------------------------------------
// Supabase Management API

async function supabase(apiPath, { method = 'GET', body } = {}) {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) throw new Error('SUPABASE_ACCESS_TOKEN 이 없습니다.');
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${API}${apiPath}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if ((res.status === 429 || res.status >= 500) && attempt < 5) {
      await new Promise((r) => setTimeout(r, attempt * 3000));
      continue;
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`Supabase ${method} ${apiPath} → HTTP ${res.status}: ${data?.message ?? text.slice(0, 200)}`);
    return data;
  }
}

async function waitHealthy(ref) {
  for (let i = 0; i < 60; i++) {
    const project = await supabase(`/v1/projects/${ref}`);
    if (project?.status === 'ACTIVE_HEALTHY') return;
    console.log(`  Supabase 프로젝트 상태: ${project?.status} (기다리는 중)`);
    await new Promise((r) => setTimeout(r, 10_000));
  }
  throw new Error('Supabase 프로젝트가 10분 안에 준비되지 않았습니다.');
}

async function provisionSupabase({ name, region, scheme }) {
  const org = process.env.SUPABASE_ORG_ID;
  if (!org) throw new Error('SUPABASE_ORG_ID 가 없습니다(조직 slug).');
  const projects = (await supabase('/v1/projects')) ?? [];
  let project = projects.find((p) => p.name === name && (p.organization_slug ?? p.organization_id) === org) ?? projects.find((p) => p.name === name);
  let password = null;
  if (project) {
    console.log(`  Supabase 프로젝트 재사용: ${project.id}`);
  } else {
    password = randomBytes(24).toString('base64url');
    console.log(`::add-mask::${password}`);
    project = await supabase('/v1/projects', { method: 'POST', body: { name, organization_slug: org, region, db_pass: password } });
    console.log(`  Supabase 프로젝트 생성: ${project.id} (${region})`);
  }
  const ref = project.id ?? project.ref;
  await waitHealthy(ref);

  const keys = await supabase(`/v1/projects/${ref}/api-keys?reveal=false`);
  const publishableKey = pickPublishableKey(keys);
  if (!publishableKey) throw new Error('Supabase 공개(publishable/anon) 키를 찾지 못했습니다.');

  let dbUrl = null;
  if (password) {
    dbUrl = sessionPoolerUrl(await supabase(`/v1/projects/${ref}/config/database/pooler`), ref, password);
    if (dbUrl) console.log(`::add-mask::${dbUrl}`);
  }

  try {
    const auth = await supabase(`/v1/projects/${ref}/config/auth`);
    await supabase(`/v1/projects/${ref}/config/auth`, {
      method: 'PATCH',
      body: { uri_allow_list: redirectAllowList(auth?.uri_allow_list, scheme) },
    });
    console.log(`  Auth 리디렉트 허용: ${scheme}://`);
  } catch (error) {
    // 로그인 기능 전에만 필요하다. 실패해도 프로젝트는 쓸 수 있다.
    console.log(`::warning::Auth 리디렉트 설정 실패(대시보드에서 ${scheme}:// 추가): ${error.message}`);
  }
  return { ref, url: `https://${ref}.supabase.co`, publishableKey, dbUrl };
}

// ---------------------------------------------------------------------------
// GitHub

function gh(argv, input) {
  execFileSync('gh', argv, { input, stdio: ['pipe', 'inherit', 'inherit'] });
}
const ghJson = (argv, input) =>
  JSON.parse(execFileSync('gh', argv, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] }) || 'null');
const setSecret = (repo, key, value) => {
  gh(['secret', 'set', key, '-R', repo], value);
  console.log(`  secret ${key} → ${repo}`);
};
const setVariable = (repo, key, value) => {
  gh(['variable', 'set', key, '-R', repo, '--body', value]);
  console.log(`  variable ${key}=${value}`);
};

const LABELS = [
  ['risk:low', '2da44e', 'Risk Score LOW'],
  ['risk:medium', 'd4a72c', 'Risk Score MEDIUM'],
  ['risk:high', 'e16f24', 'Risk Score HIGH'],
  ['risk:very-high', 'cf222e', 'Risk Score VERY HIGH'],
  ['risk:critical', '6e0b0b', 'Risk Score CRITICAL'],
  ['risk-accepted', '0e8a16', '관리자가 이 커밋의 위험을 수락함 (CRITICAL merge 조건)'],
  ['no-autofix', 'bfdadc', 'CI 실패 시 Claude auto-fix 끄기'],
  ['no-refine', 'bfdadc', 'CI 뒤 Claude 품질 리뷰(자동 정리) 끄기'],
  ['e2e', '1d76db', 'JS 변경도 Android 에뮬레이터 e2e 를 돌린다(다음 push 부터)'],
];

function ensureLabels(repo) {
  for (const [name, color, description] of LABELS) {
    try {
      gh(['label', 'create', name, '-R', repo, '--color', color, '--description', description, '--force']);
    } catch {
      console.log(`  ::warning::라벨 ${name} 생성 실패`);
    }
  }
}

/** main 보호 규칙. 비공개 리포는 GitHub Pro/Team 이상에서만 된다. */
function protectMain(repo) {
  const ruleset = {
    name: 'main protection',
    target: 'branch',
    enforcement: 'active',
    conditions: { ref_name: { include: ['~DEFAULT_BRANCH'], exclude: [] } },
    rules: [
      { type: 'deletion' },
      { type: 'non_fast_forward' },
      {
        type: 'pull_request',
        parameters: {
          required_approving_review_count: 0,
          dismiss_stale_reviews_on_push: false,
          require_code_owner_review: false,
          require_last_push_approval: false,
          required_review_thread_resolution: false,
        },
      },
      {
        type: 'required_status_checks',
        parameters: {
          strict_required_status_checks_policy: false,
          required_status_checks: [{ context: 'test' }, { context: 'risk-gate' }],
        },
      },
    ],
  };
  const existing = ghJson(['api', `repos/${repo}/rulesets`]) ?? [];
  const found = existing.find((r) => r.name === ruleset.name);
  const apiPath = found ? `repos/${repo}/rulesets/${found.id}` : `repos/${repo}/rulesets`;
  ghJson(['api', '-X', found ? 'PUT' : 'POST', apiPath, '--input', '-'], JSON.stringify(ruleset));
  console.log(`  ruleset "${ruleset.name}" ${found ? '갱신' : '생성'} (필수 체크: test, risk-gate)`);
}

// ---------------------------------------------------------------------------

function args() {
  const out = {};
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const next = argv[i + 1];
    out[argv[i].slice(2)] = next === undefined || next.startsWith('--') ? true : argv[++i];
  }
  return out;
}

function output(values) {
  if (!process.env.GITHUB_OUTPUT) return;
  writeFileSync(process.env.GITHUB_OUTPUT, Object.entries(values).map(([k, v]) => `${k}=${v ?? ''}\n`).join(''), { flag: 'a' });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { repo, region = 'ap-northeast-2', scheme, protect } = args();
  try {
    if (!repo || !repo.includes('/')) throw new Error('usage: node scripts/provision.mjs --repo owner/name --scheme <scheme> | --protect');
    if (protect) {
      ensureLabels(repo);
      protectMain(repo);
      console.log('\n✅ 브랜치 보호 완료');
    } else {
      if (!scheme) throw new Error('--scheme 이 필요합니다(app.json 의 scheme).');
      const name = repo.split('/')[1];
      const db = await provisionSupabase({ name, region, scheme });
      setVariable(repo, 'SUPABASE_PROJECT_REF', db.ref);
      setVariable(repo, 'EAS_PLATFORMS', 'android');
      if (db.dbUrl) setSecret(repo, 'SUPABASE_DB_URL', db.dbUrl);
      output({ supabase_url: db.url, publishable_key: db.publishableKey, ref: db.ref, db_url_set: Boolean(db.dbUrl) });
      console.log('\n✅ Supabase 프로비저닝 완료');
    }
  } catch (error) {
    const hint = protect ? ' — 비공개 리포의 브랜치 규칙은 GitHub Pro(개인)/Team(조직) 이상이 필요합니다. docs/bootstrap/SETUP.md 참고.' : '';
    console.error(`::error::${error.message}${hint}`);
    process.exitCode = 1;
  }
}
