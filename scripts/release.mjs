#!/usr/bin/env node
// 스테이징 배포·출시·롤아웃·롤백. GitHub Actions 워크플로(deploy / release / rollout-monitor / rollback)가 부른다.
// EAS CLI(`eas`, expo/expo-github-action 이 설치)와 EXPO_TOKEN 이 필요하다 — 클라우드 세션에서는 돌리지 않는다.
//
//   node scripts/release.mjs staging   --platforms android[,ios]
//       merge 직후. 플랫폼마다 지금 코드의 runtimeVersion(fingerprint)과 같은 스테이징 빌드가 있으면
//       OTA(channel staging), 없으면 스테이징 빌드를 새로 시작한다(iOS 는 TestFlight 로 자동 제출).
//   node scripts/release.mjs ota       --platforms android[,ios] --rollout 10
//       스테이징에서 확인한 최신 업데이트를 production 채널로 다시 게시한다(단계적 롤아웃).
//   node scripts/release.mjs store     --platforms android[,ios]
//       프로덕션 빌드 → 스토어 제출(Play: 프로덕션 트랙 단계적 출시 / iOS: App Store Connect 업로드).
//   node scripts/release.mjs rollout   --platforms android[,ios] --percent 50
//       진행 중인 production OTA 롤아웃 비율을 바꾼다.
//   node scripts/release.mjs rollback  --platforms android[,ios]
//       production OTA 를 직전 상태로 되돌린다(롤아웃 중이면 롤아웃 취소).
//   node scripts/release.mjs monitor   --platforms android[,ios]
//       Sentry 의 production crash-free 비율로 진행 중인 롤아웃을 올리거나(10→50→100) 멈춘다.
//
// 결과는 사람이 읽을 마크다운으로 $GITHUB_STEP_SUMMARY 와 --report 파일(PR 코멘트용)에 쓴다.
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { project } from './eas-links.mjs';
import { resolve as resolveRuntime } from './fingerprint.mjs';

export const PLATFORMS = ['android', 'ios'];
export const ROLLOUT_STEPS = [10, 50, 100];
// 롤아웃 판단 기준(crash-free 세션 비율). 변수로 바꿀 수 있다(rollout-monitor.yml).
export const HEALTH = { halt: 0.99, advance: 0.995, minSessions: 30 };
const LIVE_BUILD = new Set(['finished', 'in-progress', 'in-queue', 'new']);

export function parsePlatforms(value = 'android') {
  const list = String(value)
    .split(',')
    .map((p) => p.trim())
    .filter(Boolean);
  const expanded = list.includes('all') ? PLATFORMS : list;
  const bad = expanded.filter((p) => !PLATFORMS.includes(p));
  if (bad.length || !expanded.length) throw new Error(`플랫폼은 android, ios, all 중에서: ${value}`);
  return [...new Set(expanded)];
}

/** 이 runtimeVersion 의 바이너리가 이미 있거나 만들어지는 중인가. */
export function hasLiveBuild(builds) {
  return (Array.isArray(builds) ? builds : []).some((b) => LIVE_BUILD.has(String(b?.status ?? '').toLowerCase()));
}

/** `eas update:list --branch X --json` 결과의 가장 최근 업데이트 그룹. */
export function latestGroup(list) {
  const page = list?.currentPage ?? [];
  const g = page.find((x) => x && typeof x.group === 'string' && !x.isRollBackToEmbedded) ?? page[0];
  if (!g) return null;
  return {
    group: g.group,
    runtimeVersion: g.runtimeVersion ?? null,
    rolloutPercentage: typeof g.rolloutPercentage === 'number' ? g.rolloutPercentage : null,
    message: g.message ?? '',
    isRollBackToEmbedded: Boolean(g.isRollBackToEmbedded),
  };
}

/**
 * 롤아웃 다음 단계. health = { crashFreeRate: 0~1 | null, sessions: number }.
 * - 오류율이 기준을 넘으면 halt(되돌림). 데이터가 적거나 없으면 hold(사람이 판단).
 */
export function nextRollout(current, health, cfg = HEALTH) {
  if (current === null || current >= 100) return { action: 'done' };
  if (!health || health.crashFreeRate === null || health.crashFreeRate === undefined) return { action: 'hold', reason: '건강 지표 없음(Sentry 미설정)' };
  if (health.sessions >= cfg.minSessions && health.crashFreeRate < cfg.halt) {
    return { action: 'halt', reason: `crash-free ${(health.crashFreeRate * 100).toFixed(2)}% < ${cfg.halt * 100}%` };
  }
  if (health.sessions < cfg.minSessions) return { action: 'hold', reason: `세션 ${health.sessions}개 — 판단하기에 적다(${cfg.minSessions}개 이상 필요)` };
  if (health.crashFreeRate < cfg.advance) return { action: 'hold', reason: `crash-free ${(health.crashFreeRate * 100).toFixed(2)}% — 지켜본다` };
  const to = ROLLOUT_STEPS.find((s) => s > current) ?? 100;
  return { action: 'advance', to, reason: `crash-free ${(health.crashFreeRate * 100).toFixed(2)}%, 세션 ${health.sessions}` };
}

/** Sentry sessions API 응답 → { crashFreeRate, sessions }. */
export function parseSentryHealth(json) {
  const totals = json?.groups?.[0]?.totals ?? {};
  const rate = totals['crash_free_rate(session)'];
  return { crashFreeRate: typeof rate === 'number' ? rate : null, sessions: Number(totals['sum(session)'] ?? 0) };
}

export function buildLink({ owner, slug }, id) {
  return owner && slug ? `https://expo.dev/accounts/${owner}/projects/${slug}/builds/${id}` : '';
}

export function updateLink({ owner, slug }, group) {
  return owner && slug ? `https://expo.dev/accounts/${owner}/projects/${slug}/updates/${group}` : '';
}

// ---------------------------------------------------------------------------
// EAS 호출

function eas(args) {
  const out = execFileSync('eas', [...args, '--json', '--non-interactive'], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  return out.trim() ? JSON.parse(out) : null;
}

const commitMessage = () => {
  // 배포하는 커밋은 워크플로가 DEPLOY_SHA 로 넘긴다(없으면 GITHUB_SHA).
  const sha = (process.env.DEPLOY_SHA || process.env.GITHUB_SHA || '').slice(0, 7);
  const title = (process.env.COMMIT_TITLE ?? '').split('\n')[0].slice(0, 80);
  return [sha, title].filter(Boolean).join(' ') || 'deploy';
};

// OTA 번들의 소스맵을 Sentry 에 올린다(설정돼 있을 때만, 실패해도 배포는 계속).
function uploadSourcemaps() {
  if (!process.env.SENTRY_AUTH_TOKEN || !process.env.SENTRY_ORG || !process.env.SENTRY_PROJECT) return;
  try {
    execFileSync('npx', ['sentry-expo-upload-sourcemaps', 'dist'], { stdio: 'inherit' });
  } catch (error) {
    console.log(`::warning::Sentry 소스맵 업로드 실패: ${error.message}`);
  }
}

function staging(platforms, info) {
  const lines = [];
  for (const platform of platforms) {
    const runtime = resolveRuntime(process.cwd(), platform).runtimeVersion;
    if (!runtime) throw new Error(`${platform} runtimeVersion 을 계산하지 못했습니다`);
    const builds = eas(['build:list', '--platform', platform, '--build-profile', 'staging', '--runtime-version', runtime, '--limit', '5']);
    if (hasLiveBuild(builds)) {
      const out = eas(['update', '--channel', 'staging', '--environment', 'preview', '--platform', platform, '--message', commitMessage()]);
      const group = (Array.isArray(out) ? out : []).find((u) => u?.group)?.group ?? '';
      uploadSourcemaps();
      lines.push({ platform, mode: 'update', icon: '📦', text: `OTA 업데이트 — 설치된 스테이징 앱이 다음 실행 때 받습니다`, link: updateLink(info, group) });
    } else {
      const args = ['build', '--platform', platform, '--profile', 'staging', '--no-wait'];
      if (platform === 'ios') args.push('--auto-submit');
      const out = eas(args);
      const id = (Array.isArray(out) ? out : [out]).find((b) => b?.id)?.id ?? '';
      const where = platform === 'ios' ? 'TestFlight 로 자동 제출' : '완료되면 링크에서 APK 설치';
      lines.push({ platform, mode: 'build', icon: '🧱', text: `새 스테이징 빌드 시작(네이티브 변경) — ${where}`, link: buildLink(info, id) });
    }
  }
  return lines;
}

function releaseOta(platforms, rollout, info) {
  const lines = [];
  for (const platform of platforms) {
    const latest = latestGroup(eas(['update:list', '--branch', 'staging', '--platform', platform, '--limit', '5']));
    if (!latest) throw new Error(`${platform}: 스테이징에 OTA 업데이트가 없습니다. 네이티브 변경이면 kind=store 로 출시하세요.`);
    const builds = eas(['build:list', '--platform', platform, '--build-profile', 'production', '--runtime-version', latest.runtimeVersion, '--limit', '5']);
    if (!hasLiveBuild(builds)) {
      throw new Error(`${platform}: 이 업데이트(runtime ${String(latest.runtimeVersion).slice(0, 10)})를 받을 프로덕션 빌드가 없습니다 — 네이티브가 바뀌었으니 kind=store 로 출시해야 합니다.`);
    }
    const args = ['update:republish', '--group', latest.group, '--destination-channel', 'production', '--platform', platform, '--message', `출시: ${latest.message}`.slice(0, 200)];
    if (rollout < 100) args.push('--rollout-percentage', String(rollout));
    const out = eas(args);
    const group = (Array.isArray(out) ? out : []).find((u) => u?.group)?.group ?? latest.group;
    lines.push({ platform, mode: 'ota', icon: '🚀', text: `production OTA ${rollout}% — ${latest.message}`, link: updateLink(info, group) });
  }
  return lines;
}

function releaseStore(platforms, info) {
  return platforms.map((platform) => {
    const out = eas(['build', '--platform', platform, '--profile', 'production', '--auto-submit', '--no-wait']);
    const id = (Array.isArray(out) ? out : [out]).find((b) => b?.id)?.id ?? '';
    const next =
      platform === 'ios'
        ? '빌드·업로드가 끝나면 App Store Connect 에서 "심사에 제출"(단계적 출시 켜기)을 눌러 주세요'
        : 'Play 프로덕션 트랙에 10% 단계적 출시로 제출됩니다(Play Console 에서 비율 조정)';
    return { platform, mode: 'store', icon: '🏪', text: `프로덕션 빌드 → 스토어 제출. ${next}`, link: buildLink(info, id) };
  });
}

function activeRollout(platform) {
  const latest = latestGroup(eas(['update:list', '--branch', 'production', '--platform', platform, '--limit', '5']));
  return latest && latest.rolloutPercentage !== null && latest.rolloutPercentage < 100 ? latest : null;
}

function rollout(platforms, percent, info) {
  return platforms.map((platform) => {
    const active = activeRollout(platform);
    if (!active) return { platform, mode: 'rollout', icon: '➖', text: '진행 중인 OTA 롤아웃 없음' };
    eas(['update:edit', active.group, '--rollout-percentage', String(percent)]);
    return { platform, mode: 'rollout', icon: '📈', text: `롤아웃 ${active.rolloutPercentage}% → ${percent}%`, link: updateLink(info, active.group) };
  });
}

function rollback(platforms, info) {
  return platforms.map((platform) => {
    const latest = latestGroup(eas(['update:list', '--branch', 'production', '--platform', platform, '--limit', '5']));
    if (!latest) return { platform, mode: 'rollback', icon: '➖', text: 'production 에 OTA 업데이트가 없습니다(스토어 빌드 그대로)' };
    if (latest.rolloutPercentage !== null && latest.rolloutPercentage < 100) {
      eas(['update:revert-update-rollout', '--group', latest.group]);
      return { platform, mode: 'rollback', icon: '↩️', text: `롤아웃 중이던 업데이트(${latest.rolloutPercentage}%)를 취소했습니다`, link: updateLink(info, latest.group) };
    }
    eas(['update:rollback', latest.group, '--platform', platform]);
    return { platform, mode: 'rollback', icon: '↩️', text: `직전 업데이트로 되돌렸습니다(직전이 없으면 앱에 포함된 번들로)`, link: updateLink(info, latest.group) };
  });
}

async function sentryHealth() {
  const { SENTRY_AUTH_TOKEN: token, SENTRY_ORG: org, SENTRY_PROJECT: proj } = process.env;
  if (!token || !org || !proj) return null;
  const api = `${process.env.SENTRY_URL ?? 'https://sentry.io'}/api/0`;
  const headers = { Authorization: `Bearer ${token}` };
  const project = await (await fetch(`${api}/projects/${org}/${proj}/`, { headers })).json();
  const params = new URLSearchParams({ project: String(project.id), environment: 'production', statsPeriod: '24h', interval: '1d' });
  params.append('field', 'crash_free_rate(session)');
  params.append('field', 'sum(session)');
  const res = await fetch(`${api}/organizations/${org}/sessions/?${params}`, { headers });
  if (!res.ok) throw new Error(`Sentry sessions API HTTP ${res.status}`);
  return parseSentryHealth(await res.json());
}

async function monitor(platforms, info, cfg) {
  const health = await sentryHealth();
  const lines = [];
  for (const platform of platforms) {
    const active = activeRollout(platform);
    const decision = nextRollout(active ? active.rolloutPercentage : null, health, cfg);
    if (decision.action === 'done') {
      lines.push({ platform, mode: 'monitor', icon: '➖', idle: true, text: '진행 중인 OTA 롤아웃 없음' });
    } else if (decision.action === 'advance') {
      eas(['update:edit', active.group, '--rollout-percentage', String(decision.to)]);
      lines.push({ platform, mode: 'monitor', icon: '📈', text: `롤아웃 ${active.rolloutPercentage}% → ${decision.to}% (${decision.reason})`, link: updateLink(info, active.group) });
    } else if (decision.action === 'halt') {
      eas(['update:revert-update-rollout', '--group', active.group]);
      lines.push({ platform, mode: 'monitor', icon: '🛑', halted: true, text: `롤아웃을 취소했습니다 — ${decision.reason}`, link: updateLink(info, active.group) });
    } else {
      lines.push({ platform, mode: 'monitor', icon: '⏸️', text: `롤아웃 ${active.rolloutPercentage}% 유지 — ${decision.reason}`, link: updateLink(info, active.group) });
    }
  }
  return lines;
}

/** 모든 플랫폼에 진행 중인 롤아웃이 없나 — 그러면 rollout-monitor 가 매일 도는 것을 멈춘다(release 가 다시 켠다). */
export const monitorIdle = (lines) => lines.length > 0 && lines.every((l) => l.idle);

export function renderReport(title, lines) {
  const out = [`### ${title}`, ''];
  for (const l of lines) out.push(`- ${l.icon} **${l.platform}** ${l.text}${l.link ? ` — [EAS](${l.link})` : ''}`);
  return out.join('\n');
}

// ---------------------------------------------------------------------------

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1]?.startsWith('--') ? true : argv[++i];
  return out;
}

const percent = (v, fallback) => {
  const n = Number(v ?? fallback);
  if (!Number.isInteger(n) || n < 1 || n > 100) throw new Error(`비율은 1~100 정수: ${v}`);
  return n;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [command, ...rest] = process.argv.slice(2);
  const a = args(rest);
  const info = project(readFileSync(path.join(process.cwd(), 'app.json'), 'utf8'));
  const cfg = {
    halt: Number(process.env.ROLLOUT_HALT_BELOW ?? HEALTH.halt),
    advance: Number(process.env.ROLLOUT_ADVANCE_ABOVE ?? HEALTH.advance),
    minSessions: Number(process.env.ROLLOUT_MIN_SESSIONS ?? HEALTH.minSessions),
  };
  const TITLES = {
    staging: '스테이징 배포',
    ota: 'OTA 출시',
    store: '스토어 출시',
    rollout: '롤아웃 비율 변경',
    rollback: 'OTA 롤백',
    monitor: '롤아웃 감시',
  };
  try {
    const platforms = parsePlatforms(a.platforms);
    const run = {
      staging: () => staging(platforms, info),
      ota: () => releaseOta(platforms, percent(a.rollout, 10), info),
      store: () => releaseStore(platforms, info),
      rollout: () => rollout(platforms, percent(a.percent), info),
      rollback: () => rollback(platforms, info),
      monitor: () => monitor(platforms, info, cfg),
    }[command];
    if (!run) throw new Error(`알 수 없는 명령: ${command ?? '(없음)'} — ${Object.keys(TITLES).join(' | ')}`);
    const lines = await run();
    const report = renderReport(TITLES[command], lines);
    console.log(report);
    if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `${report}\n`, { flag: 'a' });
    if (a.report) writeFileSync(a.report, report);
    if (process.env.GITHUB_OUTPUT) {
      const modes = [...new Set(lines.map((l) => l.mode))].join(',');
      writeFileSync(process.env.GITHUB_OUTPUT, `modes=${modes}\nhalted=${lines.some((l) => l.halted)}\nidle=${monitorIdle(lines)}\n`, { flag: 'a' });
    }
  } catch (error) {
    console.error(`::error::${error.message}`);
    if (process.env.GITHUB_STEP_SUMMARY) writeFileSync(process.env.GITHUB_STEP_SUMMARY, `### ❌ ${TITLES[command] ?? command}\n\n${error.message}\n`, { flag: 'a' });
    if (a.report) writeFileSync(a.report, `### ❌ ${TITLES[command] ?? command}\n\n${error.message}`);
    process.exitCode = 1;
  }
}
