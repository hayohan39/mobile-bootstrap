#!/usr/bin/env node
// EAS 명령의 출력에서 사람이 열어 볼 링크를 뽑는다(PR 프리뷰 코멘트·배포 코멘트용).
//
//   node scripts/eas-links.mjs update <eas update --json 출력 파일>   → update_url, group, runtime_version
//   node scripts/eas-links.mjs web <eas deploy 출력 파일> [별칭]     → web_url
//
// GitHub Actions 에서는 $GITHUB_OUTPUT 에도 쓴다. 출력 형식이 바뀌어도 실패하지 않고 빈 값을 낸다.
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const APP_JSON = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'app.json');

/** app.json 의 expo.owner / slug — expo.dev 대시보드 링크에 쓴다. */
export function project(appJson = readFileSync(APP_JSON, 'utf8')) {
  const expo = JSON.parse(appJson).expo ?? {};
  return { owner: expo.owner ?? null, slug: expo.slug ?? null, projectId: expo.extra?.eas?.projectId ?? null };
}

/** `eas update --json` 결과(플랫폼별 update 배열)에서 그룹 id 와 대시보드 링크. */
export function updateLinks(json, { owner, slug, projectId }) {
  const list = Array.isArray(json) ? json : [];
  const first = list.find((u) => u && typeof u.group === 'string');
  if (!first) return { group: '', runtime_version: '', update_url: '' };
  const url = owner && slug
    ? `https://expo.dev/accounts/${owner}/projects/${slug}/updates/${first.group}`
    : projectId ? `https://expo.dev/projects/${projectId}/updates/${first.group}` : '';
  return { group: first.group, runtime_version: String(first.runtimeVersion ?? ''), update_url: url };
}

/** `eas deploy` 출력 텍스트에서 *.expo.app 주소. 별칭을 줬으면 그 주소를 고른다(PR 프리뷰는 별칭 없이 배포 주소를 쓴다). */
export function webUrl(text, alias = '') {
  const urls = [...String(text).matchAll(/https:\/\/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.expo\.app\/?/g)].map((m) => m[0].replace(/\/$/, ''));
  return { web_url: (alias && urls.find((u) => u.endsWith(`--${alias}.expo.app`))) || urls[0] || '' };
}

function emit(values) {
  for (const [k, v] of Object.entries(values)) {
    console.log(`${k}=${v}`);
    if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`, { flag: 'a' });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [kind, file, alias] = process.argv.slice(2);
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    // 파일이 없으면(명령 실패) 빈 값.
  }
  if (kind === 'update') {
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      json = null;
    }
    emit(updateLinks(json, project()));
  } else if (kind === 'web') {
    emit(webUrl(text, alias));
  } else {
    console.error('사용법: node scripts/eas-links.mjs update <file> | web <file>');
    process.exit(2);
  }
}
