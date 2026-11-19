#!/usr/bin/env node
// Android e2e 의 APK 재사용 판정. 빌드(약 23분)가 e2e 한 번(약 30분)의 대부분이라, 흐름(.maestro/)만 고쳐
// 다시 돌릴 때는 앞 실행이 남긴 APK 를 그대로 쓴다(.github/actions/android-e2e 의 apk-from 입력).
//
//   node scripts/e2e-apk.mjs check --from <APK 를 만든 커밋> [--head HEAD]   → reuse=true|false, reason=...
//
// 재사용해도 되는 조건 — 둘 다 맞아야 한다. 아니면 새로 빌드한다(틀린 APK 로 통과하는 것보다 느린 편이 낫다).
//   1. APK 의 커밋이 지금 커밋의 조상(또는 같은 커밋)이다 — 다른 브랜치의 APK 가 아니다.
//   2. 그 사이에 앱(번들·네이티브·앱 설정)에 들어가는 파일이 바뀌지 않았다 — scripts/ci-changes.mjs 의 app 판정.
//      .maestro/·테스트·문서·도구만 바뀌었으면 APK 안의 앱은 지금 코드와 같다.
//      단 APK 를 만드는 방법(.github/actions/android-e2e/)이 바뀌었으면 그 빌드를 확인해야 하므로 새로 빌드한다.
// GitHub Actions 에서는 $GITHUB_OUTPUT 에도 쓴다.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { affectsApp, changedFiles } from './ci-changes.mjs';

const SHA = /^[0-9a-f]{40}$/;

/** @returns {{ reuse: boolean, reason: string }} */
export function canReuse(from, head = 'HEAD', cwd = process.cwd()) {
  if (!SHA.test(from)) return { reuse: false, reason: 'APK 의 커밋을 알 수 없습니다' };
  try {
    execFileSync('git', ['merge-base', '--is-ancestor', from, head], { cwd, stdio: 'ignore' });
  } catch {
    return { reuse: false, reason: `APK 의 커밋 ${from.slice(0, 7)} 이 지금 커밋의 조상이 아닙니다(다른 브랜치이거나 히스토리가 없음)` };
  }
  const app = changedFiles(from, head, cwd).filter((f) => affectsApp(f) || f.startsWith('.github/actions/android-e2e/'));
  if (app.length > 0) {
    const shown = app.slice(0, 5).join(', ') + (app.length > 5 ? ` 외 ${app.length - 5}개` : '');
    return { reuse: false, reason: `APK 이후 앱 파일이 바뀌었습니다: ${shown}` };
  }
  return { reuse: true, reason: `APK(${from.slice(0, 7)}) 이후 앱 파일 변경 없음 — 다시 빌드하지 않습니다` };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const arg = (name) => (argv.includes(`--${name}`) ? argv[argv.indexOf(`--${name}`) + 1] : undefined);
  if (argv[0] !== 'check') {
    console.error('usage: node scripts/e2e-apk.mjs check --from <sha> [--head HEAD]');
    process.exit(2);
  }
  const { reuse, reason } = canReuse((arg('from') ?? '').trim(), arg('head') ?? 'HEAD');
  console.log(reason);
  console.log(`reuse=${reuse}`);
  if (process.env.GITHUB_OUTPUT) writeFileSync(process.env.GITHUB_OUTPUT, `reuse=${reuse}\nreason=${reason}\n`, { flag: 'a' });
}
