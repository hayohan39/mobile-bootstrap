// Claude 클라우드 세션용 GitHub 헬퍼 (REST 만 사용).
//
// 클라우드 세션의 GitHub 프록시는 GraphQL 을 막는다. `gh pr create`, `gh pr list`,
// `gh pr checks`, `gh workflow run` 은 GraphQL 을 쓰므로 403 이 난다.
// 이 스크립트는 같은 일을 `gh api`(REST)로 한다. 로컬에서도 그대로 동작한다.
//
//   node scripts/gh.mjs pr-create --title "feat: ..." --body-file /tmp/body.md [--draft]
//   node scripts/gh.mjs pr-list                       열린 PR + 각 PR 의 CI 상태
//   node scripts/gh.mjs pr-status [<번호>]             체크 결과 + 네이티브 변경 여부 + 프리뷰 (번호 없으면 현재 브랜치)
//   node scripts/gh.mjs pr-watch [<번호>]              체크가 끝날 때까지 기다린 뒤 pr-status
//   node scripts/gh.mjs deploys                       최근 스테이징 배포·출시·롤백 실행 결과
//   node scripts/gh.mjs dispatch <workflow.yml> [key=value ...]
//       스테이징 올리기: dispatch deploy.yml [e2e=auto|always|skip] [force=true]
//       브랜치에서 e2e 만: dispatch e2e.yml --ref <브랜치>
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';

import { MARKER as PREVIEW_MARKER, parsePreview } from './preview-comment.mjs';

function gh(args, { input } = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'] });
}
const api = (path, ...rest) => JSON.parse(gh(['api', path, ...rest]) || 'null');
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

function repo() {
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  const url = git('remote', 'get-url', 'origin');
  const match = url.match(/[/:]([^/:]+\/[^/]+?)(?:\.git)?$/);
  if (!match) throw new Error(`origin 에서 owner/repo 를 알 수 없습니다: ${url}`);
  return match[1];
}

function currentPr(R) {
  const branch = git('rev-parse', '--abbrev-ref', 'HEAD');
  const [owner] = R.split('/');
  const prs = api(`repos/${R}/pulls?state=open&head=${owner}:${encodeURIComponent(branch)}`);
  if (!prs.length) throw new Error(`브랜치 ${branch} 에 열린 PR 이 없습니다.`);
  return prs[0].number;
}

function checks(R, sha) {
  const { check_runs: runs } = api(`repos/${R}/commits/${sha}/check-runs?per_page=100`);
  return runs.map((r) => ({ name: r.name, status: r.status, conclusion: r.conclusion, url: r.html_url }));
}

const icon = (c) =>
  c.status !== 'completed' ? '⏳' : ({ success: '✅', skipped: '⏭️', neutral: '➖' })[c.conclusion] ?? '❌';

function summarizeChecks(list) {
  if (!list.length) return '체크 없음';
  return list.map((c) => `${icon(c)} ${c.name}`).join('  ');
}

function statuses(R, sha) {
  const { statuses: list = [] } = api(`repos/${R}/commits/${sha}/status`) ?? {};
  return list.map((s) => ({ name: s.context, status: s.state === 'pending' ? 'in_progress' : 'completed', conclusion: s.state, description: s.description }));
}

function previewComment(R, number) {
  const comments = api(`repos/${R}/issues/${number}/comments?per_page=100`);
  const c = comments.findLast((x) => x.user?.login === 'github-actions[bot]' && x.body.startsWith(PREVIEW_MARKER));
  return c ? { url: c.html_url, ...parsePreview(c.body) } : null;
}

function prStatus(R, number) {
  const pr = api(`repos/${R}/pulls/${number}`);
  console.log(`#${pr.number} ${pr.title}${pr.draft ? ' (draft)' : ''}\n${pr.html_url}`);
  console.log(`브랜치 ${pr.head.ref} @ ${pr.head.sha.slice(0, 7)} · mergeable: ${pr.mergeable_state}`);
  for (const c of [...checks(R, pr.head.sha), ...statuses(R, pr.head.sha)]) {
    console.log(`  ${icon(c)} ${c.name} — ${c.description ?? c.conclusion ?? c.status}`);
  }
  const preview = previewComment(R, number);
  if (!preview) {
    console.log('\n프리뷰 코멘트 없음 — 앱에 영향이 없는 PR(문서·도구·테스트·DB)이거나 preview job 이 아직 돌지 않았습니다.');
    return;
  }
  if (preview.sha && !pr.head.sha.startsWith(preview.sha)) console.log(`\n(주의: 프리뷰는 ${preview.sha} 기준 — 최신 커밋은 아직)`);
  if (preview.native) console.log(`\n네이티브 변경: ${preview.native === 'true' ? '있음 — 새 빌드 필요' : '없음 — OTA 가능'}`);
  if (preview.webUrl) console.log(`웹 프리뷰: ${preview.webUrl}`);
  if (preview.updateUrl) console.log(`앱 프리뷰(개발 빌드 QR): ${preview.updateUrl}`);
  if (preview.pending) console.log('프리뷰 준비 중');
  console.log(preview.url);
}

const [command, ...rest] = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < rest.length; i++) {
  if (rest[i].startsWith('--')) {
    const key = rest[i].slice(2);
    const next = rest[i + 1];
    if (next === undefined || next.startsWith('--')) flags[key] = true;
    else flags[key] = rest[++i];
  } else positional.push(rest[i]);
}

try {
  const R = repo();
  switch (command) {
    case 'pr-create': {
      const head = git('rev-parse', '--abbrev-ref', 'HEAD');
      if (head === 'main') throw new Error('main 에서는 PR 을 만들 수 없습니다. 브랜치를 먼저 만드세요.');
      if (!flags.title) throw new Error('--title 이 필요합니다.');
      const body = flags['body-file'] ? readFileSync(flags['body-file'], 'utf8') : (flags.body ?? '');
      const payload = JSON.stringify({ title: flags.title, head, base: flags.base ?? 'main', body, draft: Boolean(flags.draft) });
      const pr = JSON.parse(gh(['api', '-X', 'POST', `repos/${R}/pulls`, '--input', '-'], { input: payload }));
      console.log(`PR #${pr.number} 생성: ${pr.html_url}`);
      break;
    }
    case 'pr-list': {
      const prs = api(`repos/${R}/pulls?state=open&per_page=50`);
      if (!prs.length) console.log('열린 PR 없음');
      for (const pr of prs) {
        console.log(`#${pr.number} ${pr.title}${pr.draft ? ' (draft)' : ''} — ${summarizeChecks([...checks(R, pr.head.sha), ...statuses(R, pr.head.sha)])}`);
        console.log(`   ${pr.html_url}`);
      }
      break;
    }
    case 'pr-status':
      prStatus(R, positional[0] ?? currentPr(R));
      break;
    case 'pr-watch': {
      const number = positional[0] ?? currentPr(R);
      const deadline = Date.now() + 30 * 60_000;
      for (;;) {
        const { head } = api(`repos/${R}/pulls/${number}`);
        const list = [...checks(R, head.sha), ...statuses(R, head.sha)];
        const pending = list.filter((c) => c.status !== 'completed').map((c) => c.name);
        if (list.length && !pending.length) break;
        if (Date.now() > deadline) {
          console.log('30분이 지나 기다리기를 멈춥니다.');
          break;
        }
        process.stdout.write(`대기 중: ${pending.join(', ') || '체크 시작 전'}\n`);
        await new Promise((r) => setTimeout(r, 20_000));
      }
      prStatus(R, number);
      break;
    }
    case 'deploys': {
      // merge → deploy.yml(스테이징), 사용자 요청 → release.yml(출시), 장애 → rollback.yml. 최근 것부터 섞어서 본다.
      const LABEL = { 'deploy.yml': '스테이징', 'release.yml': '출시', 'rollback.yml': '롤백' };
      const all = [];
      for (const workflow of Object.keys(LABEL)) {
        try {
          const { workflow_runs: runs } = api(`repos/${R}/actions/workflows/${workflow}/runs?per_page=5`);
          for (const run of runs) all.push({ ...run, label: LABEL[workflow] });
        } catch {
          // 워크플로가 아직 없거나 권한이 없으면 건너뛴다.
        }
      }
      all.sort((a, b) => b.created_at.localeCompare(a.created_at));
      for (const run of all.slice(0, 10)) {
        const mark = run.status !== 'completed' ? '⏳' : run.conclusion === 'success' ? '✅' : run.conclusion === 'skipped' ? '⏭️' : '❌';
        // 배포한 커밋은 deploy.yml 의 실행 이름(run-name)에 있다. 이름에 커밋이 없는 옛 실행은 head_sha 를 쓴다.
        const sha = run.display_title.match(/\b[0-9a-f]{40}\b/)?.[0] ?? run.head_sha;
        console.log(`${mark} ${run.created_at.slice(0, 16).replace('T', ' ')} [${run.label}] ${sha.slice(0, 7)} ${run.display_title}\n   ${run.html_url}`);
      }
      if (!all.length) console.log('배포 기록 없음');
      break;
    }
    case 'dispatch': {
      const [workflow, ...pairs] = positional;
      if (!workflow) throw new Error('usage: dispatch <workflow.yml> [key=value ...]');
      const inputs = Object.fromEntries(pairs.map((p) => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]));
      const payload = JSON.stringify({ ref: flags.ref ?? 'main', inputs });
      gh(['api', '-X', 'POST', `repos/${R}/actions/workflows/${workflow}/dispatches`, '--input', '-'], { input: payload });
      console.log(`${workflow} 실행 요청됨. 진행: gh run list --workflow ${workflow} --limit 1`);
      break;
    }
    default:
      console.log('명령: pr-create | pr-list | pr-status | pr-watch | deploys | dispatch');
      process.exitCode = command ? 1 : 0;
  }
} catch (error) {
  console.error(error.stderr?.toString() || error.message);
  process.exitCode = 1;
}
