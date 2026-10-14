#!/usr/bin/env node
// 네이티브 변경 판정. app.json 의 runtimeVersion 정책이 fingerprint 이므로, 플랫폼별 runtimeVersion 이
// base 와 head 에서 다르면 "새 바이너리가 필요한 변경"(OTA 불가)이다. 네트워크 없이 로컬에서 계산한다.
//
//   node scripts/fingerprint.mjs resolve [--dir .]                     현재 디렉터리의 플랫폼별 runtimeVersion
//   node scripts/fingerprint.mjs compare --base <디렉터리> [--head .] [--out file.json]
//       base(대개 git worktree 에 main 을 체크아웃하고 npm ci 한 곳)와 비교한다.
//       결과: { changed, platforms: { android: {base, head}, ios: {...} }, sources: [바뀐 요소] }
//
// GitHub Actions 에서는 결과를 $GITHUB_OUTPUT(changed, android, ios)에도 쓴다.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const PLATFORMS = ['android', 'ios'];

export function resolve(dir, platform) {
  const bin = path.join(dir, 'node_modules', '.bin', process.platform === 'win32' ? 'expo-updates.cmd' : 'expo-updates');
  try {
    const out = execFileSync(bin, ['runtimeversion:resolve', '--platform', platform], {
      cwd: dir,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      env: { ...process.env, EXPO_OFFLINE: '1', EXPO_NO_TELEMETRY: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const json = JSON.parse(out);
    return { runtimeVersion: json.runtimeVersion ?? null, sources: json.fingerprintSources ?? [] };
  } catch {
    // base 에 expo 가 없거나(첫 도입) 설정이 깨졌으면 비교할 수 없다 → 바뀐 것으로 본다.
    return { runtimeVersion: null, sources: [] };
  }
}

const key = (s) => `${s.type}:${s.filePath ?? s.id ?? ''}`;

/** 바뀐 fingerprint 요소의 사람이 읽을 이름. 해시만 다른 것과 추가·삭제된 것. */
export function diffSources(base, head) {
  const b = new Map(base.map((s) => [key(s), s.hash]));
  const h = new Map(head.map((s) => [key(s), s.hash]));
  const out = new Set();
  for (const [k, hash] of h) if (b.get(k) !== hash) out.add(k.split(':').slice(1).join(':'));
  for (const k of b.keys()) if (!h.has(k)) out.add(`${k.split(':').slice(1).join(':')} (삭제)`);
  return [...out].sort();
}

export function compare(baseDir, headDir) {
  const platforms = {};
  const sources = new Set();
  for (const platform of PLATFORMS) {
    const base = resolve(baseDir, platform);
    const head = resolve(headDir, platform);
    platforms[platform] = { base: base.runtimeVersion, head: head.runtimeVersion };
    if (base.runtimeVersion !== head.runtimeVersion) for (const s of diffSources(base.sources, head.sources)) sources.add(s);
  }
  const changed = PLATFORMS.some((p) => !platforms[p].base || platforms[p].base !== platforms[p].head);
  return { changed, platforms, sources: [...sources] };
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const a = args(rest);
  if (command === 'resolve') {
    const dir = path.resolve(a.dir ?? '.');
    console.log(JSON.stringify(Object.fromEntries(PLATFORMS.map((p) => [p, resolve(dir, p).runtimeVersion])), null, 2));
  } else if (command === 'compare' && a.base) {
    const result = compare(path.resolve(a.base), path.resolve(a.head ?? '.'));
    if (a.out) writeFileSync(a.out, JSON.stringify(result, null, 2));
    if (process.env.GITHUB_OUTPUT) {
      const lines = [`changed=${result.changed}`, ...PLATFORMS.map((p) => `${p}=${result.platforms[p].head ?? ''}`)];
      writeFileSync(process.env.GITHUB_OUTPUT, `${lines.join('\n')}\n`, { flag: 'a' });
    }
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.error('사용법: node scripts/fingerprint.mjs resolve [--dir .] | compare --base <dir> [--head .] [--out f.json]');
    process.exit(2);
  }
}
