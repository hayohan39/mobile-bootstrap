// [템플릿 전용] 템플릿에서 찍어낸 리포지토리를 "프로젝트" 로 바꾼다.
//
//   node scripts/init-project.mjs --name my-app [--description "..."] [--display-name "내 앱"] [--bundle-id com.me.myapp]
//
// - 플레이스홀더({{PROJECT_NAME}} 등)를 채운다
// - app.json: 표시 이름·slug·scheme·bundle id(iOS)·package(Android) — bundle id 는 출시 후 바꿀 수 없다
// - supabase/config.toml 의 project_id, package.json / package-lock.json 의 name
// - README 를 프로젝트용으로 교체하고, 템플릿에만 필요한 파일(이 스크립트 포함)을 지운다
//
// 한 번 초기화된 리포지토리에서 다시 돌리면 아무것도 하지 않는다.
import { existsSync } from 'node:fs';
import { readFile, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const NAME_RE = /^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$/;
// iOS·Android 둘 다 받는 형식: 점으로 나눈 2개 이상의 세그먼트, 각 세그먼트는 소문자로 시작, 영숫자·밑줄.
export const BUNDLE_ID_RE = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;

// 템플릿 리포지토리에만 의미가 있는 것들. 새 프로젝트에서는 지운다.
export const TEMPLATE_ONLY = [
  '.github/workflows/new-project.yml',
  '.claude/skills/new-project',
  'scripts/provision.mjs',
  'scripts/init-project.mjs',
  'test/template',
  'docs/bootstrap',
];

// 플레이스홀더를 치환할 파일. 목록에 없는 파일은 건드리지 않는다(워크플로의 ${{ }} 등).
const PLACEHOLDER_FILES = ['src/lib/project.ts', 'CLAUDE.md', 'README.md', 'docs/decisions.md'];

/** TS 문자열 리터럴 안에 들어가도 안전하게. */
const tsString = (value) => JSON.stringify(value).slice(1, -1);

/** 이름 조각을 bundle id 세그먼트로: 소문자·영숫자만, 숫자로 시작하면 앞에 'app'. */
export function bundleSegment(value) {
  const s = String(value).toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!s) throw new Error(`bundle id 로 바꿀 수 없는 이름: "${value}"`);
  return /^[a-z]/.test(s) ? s : `app${s}`;
}

/** 기본 bundle id: com.<owner>.<name> */
export const defaultBundleId = (owner, name) => `com.${bundleSegment(owner)}.${bundleSegment(name)}`;

export async function initProject(root, { name, description = '', displayName = '', bundleId = '' }) {
  if (!NAME_RE.test(name)) {
    throw new Error(`프로젝트 이름은 소문자/숫자/하이픈만 쓸 수 있습니다: "${name}"`);
  }
  const id = bundleId || `com.example.${bundleSegment(name)}`;
  if (!BUNDLE_ID_RE.test(id)) {
    throw new Error(`bundle id 형식이 아닙니다(예: com.myname.myapp — 소문자·숫자·밑줄, 하이픈 불가): "${id}"`);
  }
  const projectTs = path.join(root, 'src/lib/project.ts');
  if (!(await readFile(projectTs, 'utf8')).includes('{{PROJECT_NAME}}')) {
    console.log('이미 초기화된 프로젝트입니다. 건너뜁니다.');
    return false;
  }

  // README: 템플릿 설명서 대신 프로젝트용 README 를 쓴다.
  const projectReadme = path.join(root, 'docs/bootstrap/project-README.md');
  if (existsSync(projectReadme)) await rename(projectReadme, path.join(root, 'README.md'));

  const date = new Date().toISOString().slice(0, 10);
  for (const rel of PLACEHOLDER_FILES) {
    const file = path.join(root, rel);
    if (!existsSync(file)) continue;
    const escape = rel.endsWith('.ts') ? tsString : (v) => v;
    const text = (await readFile(file, 'utf8'))
      .replace(/<!-- template-only:start -->[\s\S]*?<!-- template-only:end -->\n*/g, '')
      .replaceAll('{{PROJECT_NAME}}', escape(name))
      .replaceAll('{{PROJECT_DESCRIPTION}}', escape(description || name))
      .replaceAll('{{CREATED_AT}}', date);
    await writeFile(file, text);
  }

  // app.json — EAS 프로젝트 연결(owner, extra.eas.projectId, updates.url)은 new-project 워크플로가 eas init 으로 채운다.
  const appFile = path.join(root, 'app.json');
  const app = JSON.parse(await readFile(appFile, 'utf8'));
  const expo = app.expo;
  expo.name = displayName || name;
  expo.slug = name;
  expo.scheme = name.replace(/-/g, '');
  expo.ios = { ...expo.ios, bundleIdentifier: id };
  expo.android = { ...expo.android, package: id };
  delete expo.owner;
  if (expo.extra?.eas) delete expo.extra.eas;
  if (expo.extra && !Object.keys(expo.extra).length) delete expo.extra;
  if (expo.updates) delete expo.updates.url;
  await writeFile(appFile, `${JSON.stringify(app, null, 2)}\n`);

  const config = path.join(root, 'supabase/config.toml');
  if (existsSync(config)) {
    await writeFile(config, (await readFile(config, 'utf8')).replace(/^project_id = ".*"$/m, `project_id = "${name}"`));
  }

  for (const rel of ['package.json', 'package-lock.json']) {
    const file = path.join(root, rel);
    if (!existsSync(file)) continue;
    const json = JSON.parse(await readFile(file, 'utf8'));
    json.name = name;
    if (json.packages?.['']) json.packages[''].name = name;
    await writeFile(file, `${JSON.stringify(json, null, 2)}\n`);
  }

  for (const rel of TEMPLATE_ONLY) {
    await rm(path.join(root, rel), { recursive: true, force: true });
  }
  console.log(`초기화 완료: ${name} (${id})`);
  return true;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = parseArgs(process.argv.slice(2));
  try {
    await initProject(path.resolve(a.dir ?? process.cwd()), {
      name: a.name,
      description: a.description,
      displayName: a['display-name'],
      bundleId: a['bundle-id'],
    });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
