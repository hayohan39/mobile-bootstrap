// PR 프리뷰 코멘트. 이 PR 을 폰·브라우저에서 바로 볼 수 있는 곳과, 네이티브 변경 여부(OTA 로 나갈 수 있나)를
// 한 줄 표로 보여 준다. PR 당 코멘트 하나를 계속 갱신한다.
//
//   node scripts/preview-comment.mjs pending   시작 전 "⏳ 준비 중"
//   node scripts/preview-comment.mjs result    결과
//
// 환경변수(ci.yml 의 preview job 이 넣는다):
//   GITHUB_TOKEN, GITHUB_REPOSITORY, PR, SHA, RUN_URL
//   NATIVE(true/false), NATIVE_SOURCES(쉼표 목록), WEB_URL, WEB(결과), UPDATE_URL, UPDATE(결과), BUILD_URL
//
// 리뷰·Risk Score 는 CI 가 끝난 뒤 PR 종합 코멘트로 따로 붙는다.
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

export const MARKER = '<!-- preview-comment -->';

/** 2026-10-06T03:06Z → "10/6 12:06 KST" */
export function kst(date) {
  const d = new Date(date.getTime() + 9 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())} KST`;
}

const result = (step, link, label) => {
  if (step === 'success') return link ? `✅ [${label}](${link})` : '✅';
  if (step === 'failure') return '❌ 실패';
  return '⏭️ 건너뜀';
};

export function nativeCell(native, sources = []) {
  if (native === 'true') {
    const what = sources.length ? ` — ${sources.slice(0, 5).map((s) => `\`${s}\``).join(', ')}${sources.length > 5 ? ' 외' : ''}` : '';
    return `🧱 **새 빌드 필요** (OTA 불가)${what}`;
  }
  if (native === 'false') return '⚡ 없음 — OTA 로 배포 가능';
  return '—';
}

export function renderPreview(input) {
  const { pending = false, project, sha, native, sources = [], web, webUrl, update, updateUrl, runUrl, now = new Date() } = input;
  const lines = [
    MARKER,
    `### 📱 프리뷰 · ${project} · \`${String(sha ?? '').slice(0, 7)}\``,
    '',
    '| 네이티브 변경 | 웹 미리보기 | 앱 미리보기 (개발 빌드) | 갱신 |',
    '| --- | --- | --- | --- |',
    pending
      ? `| ${nativeCell(native, sources)} | ⏳ 준비 중 | ⏳ 준비 중 | ${kst(now)} |`
      : `| ${nativeCell(native, sources)} | ${result(web, webUrl, '열기')} | ${native === 'true' && update !== 'success' ? '🧱 새 빌드 필요' : result(update, updateUrl, 'QR·열기')} | ${kst(now)} |`,
    '',
  ];
  if (!pending && native === 'true') {
    lines.push('이 PR 은 네이티브 변경이라 merge 하면 **스테이징 빌드를 새로 만들고**, 출시는 스토어 심사를 거칩니다. 설치된 앱은 OTA 로 되돌릴 수 없습니다.');
    lines.push('');
  } else if (!pending && update === 'success') {
    lines.push('앱 미리보기는 **개발 빌드**(development profile)를 설치한 폰에서 QR 로 엽니다. 웹 미리보기는 아무 브라우저에서 열립니다.');
    lines.push('');
  }
  lines.push([runUrl ? `[실행 로그](${runUrl})` : null, '리뷰·Risk Score 는 CI 가 끝나면 종합 코멘트로 붙습니다'].filter(Boolean).join(' · '));
  return lines.join('\n');
}

async function github(apiPath, { method = 'GET', body } = {}) {
  const res = await fetch(`${process.env.GITHUB_API_URL ?? 'https://api.github.com'}${apiPath}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
      Accept: 'application/vnd.github+json',
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!res.ok) throw new Error(`GitHub ${method} ${apiPath} → HTTP ${res.status}`);
  return res.json();
}

async function upsert(pr, body) {
  const repo = process.env.GITHUB_REPOSITORY;
  for (let page = 1; page <= 10; page++) {
    const comments = await github(`/repos/${repo}/issues/${pr}/comments?per_page=100&page=${page}`);
    const mine = comments.find((c) => c.user?.login === 'github-actions[bot]' && c.body?.startsWith(MARKER));
    if (mine) return github(`/repos/${repo}/issues/comments/${mine.id}`, { method: 'PATCH', body: { body } });
    if (comments.length < 100) break;
  }
  return github(`/repos/${repo}/issues/${pr}/comments`, { method: 'POST', body: { body } });
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const e = process.env;
  try {
    const body = renderPreview({
      pending: process.argv[2] === 'pending',
      project: e.GITHUB_REPOSITORY?.split('/')[1] ?? '',
      sha: e.SHA,
      native: e.NATIVE,
      sources: (e.NATIVE_SOURCES ?? '').split(',').filter(Boolean),
      web: e.WEB,
      webUrl: /^https:\/\/[a-z0-9.-]+\.expo\.app\/?$/.test(e.WEB_URL ?? '') ? e.WEB_URL : '',
      update: e.UPDATE,
      updateUrl: /^https:\/\/expo\.dev\//.test(e.UPDATE_URL ?? '') ? e.UPDATE_URL : '',
      runUrl: e.RUN_URL,
    });
    await upsert(e.PR, body);
  } catch (error) {
    // 코멘트 실패가 CI 결과를 바꾸지는 않는다.
    console.log(`::warning::프리뷰 코멘트를 남기지 못했습니다: ${error.message}`);
  }
}
