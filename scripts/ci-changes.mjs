#!/usr/bin/env node
// 바뀐 파일이 문서뿐인지, 앱(번들·앱 설정)에 영향이 있는지 판정해 Actions 시간을 아낀다.
//   code=false  문서만 — 앱 검사·프리뷰·배포를 건너뛴다.
//   app=false   문서·검사·배포 도구만(워크플로, scripts/, 테스트, DB) — 검사는 하지만 PR 프리뷰는 만들지 않는다(앞 PR 과 같은 화면).
//
//   node scripts/ci-changes.mjs --base <커밋> [--head HEAD]   → code=true|false, app=true|false
//
// base 를 모르면(첫 push, 강제 push 로 사라진 커밋) 앱 코드가 바뀐 것으로 본다 — 건너뛰지 않는 쪽이 안전하다.
// GitHub Actions 에서는 $GITHUB_OUTPUT 에도 쓴다.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

// 앱·DB·빌드에 영향이 없는 파일. 세 템플릿(mobile·production·project)이 같은 규칙을 쓴다(아래 app 판정은 mobile 만 — 2026-11-14).
// 문서로 보는 곳만 나열한다: docs/, 루트의 .md, .claude/ 의 .md(세션 지침), .github/ 바로 아래의 .md(PR 템플릿),
// 어디에 있든 README.md, LICENSE. 그 밖의 .md(content/·public/ 처럼 앱이 읽을 수 있는 것)는 코드로 본다.
//   - src/·assets/ 안은 README 라도 번들에 들어갈 수 있어 문서로 보지 않는다.
//   - .github/review/·.github/risk/ 는 리뷰 기준(프롬프트·rubric)이라 파이프라인에 영향이 있다.
const DOCS = [/^docs\//, /^[^/]+\.md$/, /^\.claude\/.*\.md$/, /^\.github\/[^/]+\.md$/, /(^|\/)README\.md$/i, /^LICENSE(\.|$)/];
const NEVER_DOCS = [/^src\//, /^assets\//, /^\.github\/(review|risk)\//];

export const isDocs = (file) => DOCS.some((re) => re.test(file)) && !NEVER_DOCS.some((re) => re.test(file));

/** 바뀐 파일 목록 → 앱 코드가 바뀌었나. 목록이 비었으면(빈 커밋) 문서 변경과 같이 본다. */
export function codeChanged(files) {
  return files.some((f) => !isDocs(f));
}

// 앱 번들·앱 설정에 들어가지 않는 것: 검사·배포 도구, 테스트, DB·Edge Function, 세션 설정, 검사 도구 설정.
// 여기 없는 파일(src/·assets/·app.json·package.json·babel·metro·eas.json 등, 처음 보는 경로)은 앱에 영향이 있다고 본다.
const NOT_APP = [
  /^\.github\//,
  /^scripts\//,
  /^test\//,
  /^e2e\//,
  /^\.maestro\//,
  /^supabase\//,
  /^\.claude\//,
  /^(eslint|vitest|jest|playwright)\.(config|setup)\.[cm]?[jt]s$/,
];
// 프리뷰를 만드는 쪽을 고치면 프리뷰를 돌려 그 변경을 확인한다.
const PREVIEW_PIPELINE = [/^\.github\/workflows\/ci\.yml$/, /^scripts\/(preview-comment|eas-links)\.mjs$/];

export const affectsApp = (file) => !isDocs(file) && (!NOT_APP.some((re) => re.test(file)) || PREVIEW_PIPELINE.some((re) => re.test(file)));

/** 바뀐 파일 목록 → 앱(또는 프리뷰 파이프라인)에 영향이 있나. 없으면 PR 프리뷰를 건너뛴다. */
export function appChanged(files) {
  return files.some(affectsApp);
}

/** base...head 에서 바뀐 경로. 이름 바꾸기는 옛 경로와 새 경로를 둘 다 낸다(assets/ → docs/ 로 옮긴 파일을 문서로 보지 않게). */
export function changedFiles(base, head = 'HEAD', cwd = process.cwd()) {
  const out = execFileSync('git', ['diff', '--name-only', '--no-renames', `${base}...${head}`], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  return out.split('\n').filter(Boolean);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (name) => argv[argv.indexOf(`--${name}`) + 1];
  const base = argv.includes('--base') ? arg('base') : '';
  const head = argv.includes('--head') ? arg('head') : 'HEAD';
  let code = true;
  let app = true;
  if (base && !/^0+$/.test(base)) {
    try {
      const files = changedFiles(base, head);
      code = codeChanged(files);
      app = appChanged(files);
      console.log(`바뀐 파일 ${files.length}개 — ${!code ? '문서만' : app ? '앱 코드 포함' : '앱 밖(도구·테스트·DB)만'}`);
    } catch {
      console.log(`base ${base.slice(0, 7)} 를 찾지 못했습니다 — 앱 코드가 바뀐 것으로 봅니다.`);
    }
  }
  console.log(`code=${code}`);
  console.log(`app=${app}`);
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `code=${code}\napp=${app}\n`, { flag: 'a' });
}
