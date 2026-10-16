// 규칙 기반 리스크 스캔(모바일 + Supabase). diff 에서 기계적으로 확인할 수 있는 사실(신호)을 뽑고, factor 별
// 최저 점수(floor)와 최소 등급(hard override)을 정한다. LLM 리뷰는 이 값보다 낮게 매길 수 없다.
//
// 이 파일은 순수 함수만 담는다(git/네트워크 없음). git 을 읽는 쪽은 cli.mjs.
import { FACTORS, bandLevel, maxLevel } from './levels.mjs';

// ---------------------------------------------------------------------------
// 경로 분류

export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (c === '?') {
      re += '[^/]';
    } else {
      re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export function categorize(path, config) {
  const out = new Set();
  for (const [category, globs] of Object.entries(config.paths ?? {})) {
    if (globs.some((g) => globToRegExp(g).test(path))) out.add(category);
  }
  return out;
}

/** 실행 중인 서비스 동작에 영향이 없는 파일인지(문서·테스트·에이전트 설정). */
const isRuntimeFree = (cats) =>
  (cats.has('docs') || cats.has('test') || cats.has('tooling')) && !cats.has('infra') && !cats.has('riskSystem');

// ---------------------------------------------------------------------------
// diff 파싱 (git diff --no-color -U0 -M)

export function parseUnifiedDiff(text) {
  const files = [];
  let file = null;
  let newLine = 0;
  for (const raw of text.split('\n')) {
    if (raw.startsWith('diff --git ')) {
      const m = raw.match(/^diff --git a\/(.+?) b\/(.+)$/);
      file = { path: m?.[2] ?? '', oldPath: m?.[1] ?? '', status: 'M', added: [], removed: [], binary: false };
      files.push(file);
      continue;
    }
    if (!file) continue;
    if (raw.startsWith('new file mode')) file.status = 'A';
    else if (raw.startsWith('deleted file mode')) file.status = 'D';
    else if (raw.startsWith('rename from ')) {
      file.status = 'R';
      file.oldPath = raw.slice('rename from '.length);
    } else if (raw.startsWith('rename to ')) file.path = raw.slice('rename to '.length);
    else if (raw.startsWith('Binary files')) file.binary = true;
    else if (raw.startsWith('--- ') || raw.startsWith('+++ ')) continue;
    else if (raw.startsWith('@@')) {
      const m = raw.match(/\+(\d+)/);
      newLine = m ? Number(m[1]) : 0;
    } else if (raw.startsWith('+')) {
      file.added.push({ line: newLine, text: raw.slice(1) });
      newLine += 1;
    } else if (raw.startsWith('-')) {
      file.removed.push({ text: raw.slice(1) });
    }
  }
  return files;
}

// ---------------------------------------------------------------------------
// SQL 분류

/**
 * SQL 을 문장 단위로 나눈다. 주석은 지우고, 문자열('...')과 달러 인용($$...$$, $tag$...$tag$) 안의 ';' 에서는
 * 나누지 않는다 — 함수 본문(plpgsql 의 begin ... end;)이 별개의 문장으로 오인되지 않게.
 */
export function splitSql(sql) {
  const out = [];
  let current = '';
  for (let i = 0; i < sql.length; ) {
    const rest = sql.slice(i);
    let m;
    if (rest.startsWith('--')) {
      const end = sql.indexOf('\n', i);
      i = end === -1 ? sql.length : end;
      current += ' ';
    } else if (rest.startsWith('/*')) {
      const end = sql.indexOf('*/', i + 2);
      i = end === -1 ? sql.length : end + 2;
      current += ' ';
    } else if (rest[0] === "'") {
      let j = i + 1;
      while (j < sql.length && !(sql[j] === "'" && sql[j + 1] !== "'")) j += sql[j] === "'" ? 2 : 1;
      current += sql.slice(i, j + 1);
      i = j + 1;
    } else if ((m = rest.match(/^\$[A-Za-z_]*\$/))) {
      const end = sql.indexOf(m[0], i + m[0].length);
      const stop = end === -1 ? sql.length : end + m[0].length;
      current += sql.slice(i, stop);
      i = stop;
    } else if (rest[0] === ';') {
      out.push(current);
      current = '';
      i += 1;
    } else {
      current += rest[0];
      i += 1;
    }
  }
  out.push(current);
  return out.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

const ident = (raw) => raw.replace(/"/g, '').split('.').pop().toLowerCase();
const short = (stmt) => (stmt.length > 90 ? `${stmt.slice(0, 87)}...` : stmt);

/** 파일 안에서 새로 만드는 테이블 이름들. */
export function createdTables(sql) {
  const out = new Set();
  for (const stmt of splitSql(sql)) {
    const m = stmt.toLowerCase().match(/^create (?:unlogged |temp(?:orary)? )?table (?:if not exists )?([\w."]+)/);
    if (m) out.add(ident(m[1]));
  }
  return out;
}

/** 파일 안에서 기존 테이블에 새로 더하는 컬럼들("table.column"). 백필 UPDATE 를 구분하는 데 쓴다. */
export function addedColumns(sql) {
  const out = new Set();
  for (const stmt of splitSql(sql)) {
    const m = stmt.toLowerCase().match(/^alter table (?:if exists )?(?:only )?([\w."]+) (.*)$/);
    if (!m) continue;
    for (const c of m[2].matchAll(/(?:^|,)\s*add (?:column )?(?:if not exists )?([\w"]+)/g)) {
      if (!/^(constraint|primary|unique|foreign|check|exclude)$/.test(c[1])) out.add(`${ident(m[1])}.${ident(c[1])}`);
    }
  }
  return out;
}

/** UPDATE ... SET a = .., b = .. 의 대상 컬럼들. */
function updatedColumns(s) {
  const m = s.match(/ set (.*?)(?: where | from | returning |$)/);
  if (!m) return [];
  return m[1]
    .split(/,(?![^()]*\))/)
    .map((part) => part.split('=')[0].trim())
    .filter(Boolean)
    .map((col) => ident(col));
}

function classifyAlter(table, rest, newTable) {
  // 괄호 밖의 쉼표로 action 을 나눈다.
  const actions = [];
  let depth = 0;
  let current = '';
  for (const ch of rest) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      actions.push(current.trim());
      current = '';
    } else current += ch;
  }
  if (current.trim()) actions.push(current.trim());

  return actions.map((a) => {
    let m;
    if (newTable) return { kind: 'additive', table };
    if (/^(enable|disable|force|no force) row level security/.test(a)) return { kind: 'permission', table };
    if ((m = a.match(/^drop (?:column )?(?:if exists )?([\w"]+)/)) && !/^drop (constraint|default|not null|identity|expression)\b/.test(a)) {
      return { kind: 'destructive', table, ident: ident(m[1]), detail: `컬럼 삭제 ${table}.${ident(m[1])}` };
    }
    if (/^rename to /.test(a)) return { kind: 'breaking', table, ident: table, detail: `테이블 이름 변경 ${table}` };
    if ((m = a.match(/^rename (?:column )?([\w"]+) to ([\w"]+)/)) && !/^rename constraint/.test(a)) {
      return { kind: 'breaking', table, ident: ident(m[1]), detail: `컬럼 이름 변경 ${table}.${ident(m[1])} → ${ident(m[2])}` };
    }
    if ((m = a.match(/^alter (?:column )?([\w"]+) (?:set data )?type /))) {
      return { kind: 'breaking', table, ident: ident(m[1]), detail: `컬럼 타입 변경 ${table}.${ident(m[1])} (테이블 재작성)` };
    }
    if ((m = a.match(/^alter (?:column )?([\w"]+) set not null/))) {
      return { kind: 'locking', table, detail: `NOT NULL 추가 ${table}.${ident(m[1])} (전체 스캔, 이전 코드의 NULL 쓰기 실패)` };
    }
    if (/^add (constraint|primary key|unique|foreign key|check|exclude)\b/.test(a)) {
      return / not valid\b/.test(a)
        ? { kind: 'additive', table }
        : { kind: 'locking', table, detail: `제약 추가 ${table} (NOT VALID 없이 전체 검증)` };
    }
    if ((m = a.match(/^add (?:column )?(?:if not exists )?([\w"]+) (.*)$/))) {
      const def = m[2];
      if (/\bnot null\b/.test(def) && !/\bdefault\b/.test(def)) {
        return { kind: 'locking', table, detail: `DEFAULT 없는 NOT NULL 컬럼 ${table}.${ident(m[1])} (기존 행이 있으면 실패)` };
      }
      if (/\bdefault\b/.test(def) && /(now\(\)|random\(\)|gen_random_uuid|uuid_generate|nextval|clock_timestamp)/.test(def)) {
        return { kind: 'locking', table, detail: `휘발성 DEFAULT 컬럼 ${table}.${ident(m[1])} (테이블 재작성)` };
      }
      return { kind: 'additive', table };
    }
    if (/^validate constraint\b/.test(a)) return { kind: 'additive', table };
    if (/^(drop constraint|alter (?:column )?[\w"]+ (drop not null|set default|drop default))/.test(a)) {
      return { kind: 'alter', table, detail: `${table}: ${short(a)}` };
    }
    return { kind: 'locking', table, detail: `${table}: ${short(a)}` };
  });
}

/**
 * 한 문장 → 분류 목록.
 * newTables: 이 PR 에서 새로 만드는 테이블, newColumns: 이 PR 에서 새로 더하는 "table.column".
 */
export function classifyStatement(stmt, newTables = new Set(), newColumns = new Set()) {
  const s = stmt.toLowerCase();
  let m;
  if (/^(begin|commit|rollback|start transaction|end)\b/.test(s)) {
    return [{ kind: 'tx-control', detail: `트랜잭션 제어문 "${short(stmt)}" (러너의 파일 단위 트랜잭션을 깬다)` }];
  }
  if (/^(set|reset) /.test(s) || /^(comment on|analyze)\b/.test(s)) return [];
  if ((m = s.match(/^create (?:unlogged |temp(?:orary)? )?table (?:if not exists )?([\w."]+)/))) {
    return [{ kind: 'additive', table: ident(m[1]) }];
  }
  if ((m = s.match(/^create (?:unique )?index (concurrently )?(?:if not exists )?(?:[\w."]+ )?on (?:only )?([\w."]+)/))) {
    const table = ident(m[2]);
    if (m[1] || newTables.has(table)) return [{ kind: 'additive', table }];
    return [{ kind: 'locking', table, detail: `인덱스 생성 ${table} (CONCURRENTLY 없이 쓰기 잠금)` }];
  }
  if ((m = s.match(/^drop (table|schema|sequence|type|domain)(?: if exists)? ([\w."]+)/))) {
    return [{ kind: 'destructive', table: ident(m[2]), ident: ident(m[2]), detail: `${m[1].toUpperCase()} 삭제 ${ident(m[2])}` }];
  }
  if ((m = s.match(/^drop (materialized view|view|function|procedure|trigger)(?: if exists)? ([\w."]+)/))) {
    return [{ kind: 'breaking', ident: ident(m[2]), detail: `${m[1].toUpperCase()} 삭제 ${ident(m[2])}` }];
  }
  if ((m = s.match(/^drop index (concurrently )?(?:if exists )?([\w."]+)/))) {
    return [m[1] ? { kind: 'alter', detail: `인덱스 삭제 ${ident(m[2])}` } : { kind: 'locking', detail: `인덱스 삭제 ${ident(m[2])} (CONCURRENTLY 없이)` }];
  }
  // 이 PR 이 만든 테이블의 정책·권한은 새 테이블을 쓰기 위해 반드시 필요하다(기존 데이터의 노출 범위는 바뀌지 않음).
  // 정책이 의도대로 막는지는 테스트로 확인해야 하므로 Security floor 만 둔다.
  if ((m = s.match(/^(?:create policy .*? on|grant .*? on(?: table)?) ([\w."]+)/)) && newTables.has(ident(m[1]))) {
    return [{ kind: 'policy-new', table: ident(m[1]) }];
  }
  if (/^(drop (policy|role|owned)|create (policy|role)|alter (policy|role|default privileges)|grant|revoke)\b/.test(s)) {
    return [{ kind: 'permission', detail: short(stmt) }];
  }
  if (/^(create|drop|alter) extension\b/.test(s)) return [{ kind: 'extension', detail: short(stmt) }];
  // 이 PR 이 새로 만든 테이블의 데이터는 아직 프로덕션에 없다.
  if ((m = s.match(/^(?:truncate (?:table )?(?:only )?|delete from (?:only )?|update (?:only )?)([\w."]+)/)) && newTables.has(ident(m[1]))) {
    return [{ kind: 'additive', table: ident(m[1]) }];
  }
  if ((m = s.match(/^truncate (?:table )?(?:only )?([\w."]+)/))) {
    return [{ kind: 'destructive', table: ident(m[1]), detail: `TRUNCATE ${ident(m[1])}` }];
  }
  if ((m = s.match(/^delete from (?:only )?([\w."]+)/))) {
    const table = ident(m[1]);
    return / where /.test(s)
      ? [{ kind: 'data', table, detail: `데이터 삭제 ${table}` }]
      : [{ kind: 'destructive', table, detail: `WHERE 없는 DELETE ${table}` }];
  }
  if ((m = s.match(/^update (?:only )?([\w."]+) /))) {
    const table = ident(m[1]);
    const columns = updatedColumns(s);
    // 이 PR 이 더한 컬럼만 채우는 백필: 기존 값을 덮어쓰지 않지만 전체 행을 건드린다(잠금·시간).
    if (columns.length && columns.every((c) => newColumns.has(`${table}.${c}`))) {
      return [{ kind: 'data', table, detail: `새 컬럼 백필 ${table}(${columns.join(', ')}) — 전체 행` }];
    }
    return / where /.test(s)
      ? [{ kind: 'data', table, detail: `데이터 변경 ${table}` }]
      : [{ kind: 'destructive', table, detail: `WHERE 없는 UPDATE ${table} (기존 값을 덮어씀, 되돌릴 수 없음)` }];
  }
  if ((m = s.match(/^insert into ([\w."]+)/))) {
    const table = ident(m[1]);
    return [newTables.has(table) ? { kind: 'additive', table } : { kind: 'seed', table, detail: `데이터 추가 ${table}` }];
  }
  if ((m = s.match(/^alter table (?:if exists )?(?:only )?([\w."]+) (.*)$/))) {
    const table = ident(m[1]);
    return classifyAlter(table, m[2], newTables.has(table));
  }
  if ((m = s.match(/^alter type ([\w."]+) (.*)$/))) {
    return /^add value/.test(m[2])
      ? [{ kind: 'additive' }]
      : [{ kind: 'breaking', ident: ident(m[1]), detail: `타입 변경 ${ident(m[1])}` }];
  }
  if (/^create or replace (function|view|procedure|trigger)\b/.test(s)) return [{ kind: 'replace', detail: short(stmt) }];
  if (/^create (function|view|materialized view|procedure|trigger|type|sequence|schema|domain)\b/.test(s)) return [{ kind: 'additive' }];
  if (/^(vacuum full|cluster|reindex|lock table|refresh materialized view)\b/.test(s)) {
    return [{ kind: 'locking', detail: short(stmt) }];
  }
  if (/^vacuum\b/.test(s)) return [];
  return [{ kind: 'unclassified', detail: short(stmt) }];
}

export function analyzeMigration(sql, newTables, newColumns) {
  return splitSql(sql).flatMap((stmt) => classifyStatement(stmt, newTables, newColumns));
}

// ---------------------------------------------------------------------------
// 코드 패턴

const SECRET_PATTERNS = [
  ['AWS 액세스 키', /AKIA[0-9A-Z]{16}/],
  ['개인 키', /-----BEGIN [A-Z ]*PRIVATE KEY-----/],
  ['GitHub 토큰', /\bgh[pousr]_[A-Za-z0-9]{36,}\b|github_pat_[A-Za-z0-9_]{40,}/],
  ['Stripe 라이브 키', /\b[sr]k_live_[A-Za-z0-9]{16,}/],
  ['Anthropic 키', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['Slack 토큰', /\bxox[baprs]-[A-Za-z0-9-]{10,}/],
  ['Google API 키', /AIza[0-9A-Za-z_-]{35}/],
  ['비밀번호가 든 DB 연결 문자열', /postgres(?:ql)?:\/\/[^\s:@/'"`]+:[^\s@/'"`]+@(?!localhost|127\.0\.0\.1|postgres[:/])[^\s'"`]+/],
];
// env(...) 는 Supabase config.toml 의 환경변수 참조(값이 아님)라 제외한다.
const GENERIC_SECRET = /\b(secret|password|passwd|api[_-]?key|access[_-]?token|private[_-]?key)\b\s*[:=]\s*['"](?!env\()[^'"\s]{12,}['"]/i;
const isComment = (text) => /^\s*(\/\/|\*|\/\*|#|--)/.test(text);

// Supabase 클라이언트는 쿼리 빌더라 SQL 조합이 드물지만, Edge Function 의 postgres 클라이언트·RPC 문자열에 남는다.
const SQL_INTERPOLATION = [
  /\b(query|execute|sql|raw)\s*(?:<[^>]*>)?\s*\(\s*`[^`]*\$\{/,
  /`[^`]*\b(select|insert into|update|delete from)\b[^`]*\$\{/i,
  /['"]\s*(select|insert into|update|delete from)\b[^'"]*['"]\s*\+/i,
];
const DANGEROUS_API = /\beval\s*\(|\bnew Function\s*\(|\bchild_process\b|\bexecSync\s*\(|\bspawnSync?\s*\(/;
const AUTH_CODE = /supabase\.auth\.|\bauth\.admin\b|\b(signInWith\w*|signOut|setSession|verifyOtp|exchangeCodeForSession|getClaims|jwt|isAdmin|hasRole|hasPermission|requireUser)\b/;
// 앱 번들은 누구나 꺼내 볼 수 있다. service_role 키나 비밀 이름이 앱 코드에 들어가면 그 자체로 유출이다.
const CLIENT_SECRET = /service_role|SERVICE_ROLE|sb_secret_/;
const PUBLIC_SECRET_NAME = /^EXPO_PUBLIC_\w*(SECRET|SERVICE_ROLE|PRIVATE|PASSWORD)/;
const WEBVIEW_RISK = /originWhitelist=\{\s*\[\s*['"]\*['"]|injectedJavaScript|injectJavaScript\(|mixedContentMode=["']always|allowFileAccess(FromFileURLs)?|allowUniversalAccessFromFileURLs/;
// 기기에 남는 데이터. 이미 설치된 구버전 앱이 남긴 값과 새 코드가 만나는 곳이다.
const DEVICE_STORAGE = /AsyncStorage\.(setItem|getItem|removeItem|mergeItem|multiSet|multiGet)|SecureStore\.\w+|openDatabase(Sync|Async)?\(|PRAGMA user_version|execAsync\(\s*[`'"]\s*(create|alter|drop) /i;
const SUPPRESSION = /eslint-disable|@ts-ignore|@ts-expect-error|@ts-nocheck/;
const TEST_SKIP = /\b(it|test|describe)\.(skip|only|todo)\s*\(|\bx(it|describe)\s*\(/;
const TEST_CASE = /\b(it|test)\s*\(/;
const ENV_REF = /process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]|(?:requireEnv|optionalEnv)\(\s*['"]([A-Z][A-Z0-9_]*)['"]|Deno\.env\.get\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g;

// 네이티브 코드가 들어 있을 가능성이 높은 패키지(추가·버전 변경·제거 = 새 빌드 필요).
// 이름으로만 추정한다. 정확한 판단은 CI 의 fingerprint 비교(native.fingerprint 신호)가 한다.
const JS_ONLY = new Set(['react-native-web', 'react-native-url-polyfill', '@testing-library/react-native', '@expo/vector-icons']);
export const isNativePackage = (name) =>
  !JS_ONLY.has(name) && (name === 'expo' || name === 'react-native' || name.startsWith('expo-') || name.includes('react-native'));

const major = (range) => {
  const m = String(range ?? '').match(/(\d+)/);
  return m ? Number(m[1]) : null;
};

function where(file, line) {
  return line ? `${file.path}:${line}` : file.path;
}

const isAppCode = (path) => path.startsWith('src/') || path.startsWith('supabase/functions/');

/** 런타임 파일을 "영역" 으로 묶는다(Scope 판단용): 화면 묶음, 기능, Edge Function 하나. */
function area(path) {
  const parts = path.split('/');
  if (parts[0] === 'supabase') return `supabase/functions/${parts[2] ?? ''}`;
  if (parts[0] !== 'src') return parts[0];
  if (parts[1] === 'app') {
    const seg = parts.slice(2).find((p) => !/^\(.*\)$/.test(p));
    if (!seg || /\.(tsx?|css)$/.test(seg)) return 'src/app(root)';
    return `src/app/${seg}`;
  }
  if (parts.length > 3) return `src/${parts[1]}/${parts[2]}`;
  return `src/${parts[1]}/${(parts[2] ?? '').replace(/\.[^.]+$/, '')}`;
}

const parseJson = (text) => {
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return {};
  }
};
const get = (obj, keys) => keys.reduce((o, k) => (o && typeof o === 'object' ? o[k] : undefined), obj);
const same = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
const pluginName = (p) => (Array.isArray(p) ? p[0] : p);

/** app.json(Expo 설정) base → head 비교. 네이티브 설정은 OTA 로 바꿀 수 없다. */
export function analyzeAppConfig(baseText, headText) {
  const b = parseJson(baseText).expo ?? {};
  const h = parseJson(headText).expo ?? {};
  const out = [];
  const ids = [
    ['ios', 'bundleIdentifier'],
    ['android', 'package'],
  ];
  for (const keys of ids) {
    const before = get(b, keys);
    if (before && !same(before, get(h, keys))) out.push({ kind: 'identity', detail: `${keys.join('.')} ${before} → ${get(h, keys) ?? '(삭제)'}` });
  }
  if (b.scheme && !same(b.scheme, h.scheme)) out.push({ kind: 'scheme', detail: `scheme ${b.scheme} → ${h.scheme ?? '(삭제)'}` });
  if (!same(b.runtimeVersion, h.runtimeVersion) || !same(b.updates, h.updates)) out.push({ kind: 'updates', detail: 'runtimeVersion / updates 설정' });

  const usage = (cfg) => Object.keys(get(cfg, ['ios', 'infoPlist']) ?? {}).filter((k) => /UsageDescription$/.test(k));
  const perms = (cfg) => get(cfg, ['android', 'permissions']) ?? [];
  const added = [...usage(h).filter((k) => !usage(b).includes(k)), ...perms(h).filter((p) => !perms(b).includes(p))];
  if (added.length) out.push({ kind: 'permission', detail: added.join(', ') });
  const plugins = (cfg) => (cfg.plugins ?? []).map(pluginName);
  const newPlugins = plugins(h).filter((p) => !plugins(b).includes(p));
  if (newPlugins.length) out.push({ kind: 'plugin', detail: newPlugins.join(', ') });

  const insecure = (cfg) =>
    Boolean(get(cfg, ['ios', 'infoPlist', 'NSAppTransportSecurity', 'NSAllowsArbitraryLoads'])) || get(cfg, ['android', 'usesCleartextTraffic']) === true;
  if (insecure(h) && !insecure(b)) out.push({ kind: 'cleartext', detail: '평문 HTTP 허용(NSAllowsArbitraryLoads / usesCleartextTraffic)' });
  if (!same(b, h)) out.push({ kind: 'native', detail: 'app.json 변경' });
  return out;
}

/** 새로 만드는 public 테이블 중 같은 PR 에서 RLS 를 켜지 않은 것. */
export function tablesWithoutRls(sqls) {
  const created = new Set();
  const enabled = new Set();
  for (const sql of sqls) {
    for (const stmt of splitSql(sql)) {
      const s = stmt.toLowerCase();
      let m = s.match(/^create (?:unlogged )?table (?:if not exists )?([\w."]+)/);
      if (m && (!m[1].includes('.') || m[1].replace(/"/g, '').startsWith('public.'))) created.add(ident(m[1]));
      m = s.match(/^alter table (?:if exists )?(?:only )?([\w."]+) enable row level security/);
      if (m) enabled.add(ident(m[1]));
    }
  }
  return [...created].filter((t) => !enabled.has(t));
}

// ---------------------------------------------------------------------------

/**
 * @param {object} input
 * @param {Array} input.files          parseUnifiedDiff 결과 (lockfile 내용은 빼도 된다)
 * @param {Array} [input.changedPaths] 이름만 바뀐 것 포함 전체 경로 목록 [{path, status}]
 * @param {(path:string)=>string|null} input.readBase  base 의 파일 내용
 * @param {(path:string)=>string|null} input.readHead  head 의 파일 내용
 * @param {(word:string)=>boolean} input.baseReferences base 의 src/ 에 이 단어가 쓰이는지
 * @param {object} input.config        .github/risk/config.json
 * @param {{changed:boolean, sources?:string[]}|null} [input.fingerprint]  CI 의 fingerprint 비교 결과(있으면)
 */
export function scanChanges({ files, changedPaths, readBase, readHead, baseReferences, config, fingerprint = null }) {
  const signals = [];
  const add = (id, floors, level, message, places = []) => {
    const existing = signals.find((s) => s.id === id && s.message === message);
    if (existing) {
      for (const p of places) if (!existing.where.includes(p)) existing.where.push(p);
      return;
    }
    signals.push({ id, floors, level: level ?? null, message, where: [...new Set(places)] });
  };

  const byPath = new Map(files.map((f) => [f.path, f]));
  for (const { path, status } of changedPaths ?? []) {
    if (!byPath.has(path)) byPath.set(path, { path, oldPath: path, status, added: [], removed: [], binary: false });
  }
  const all = [...byPath.values()];
  const entries = all.map((file) => ({ file, cats: categorize(file.path, config) }));

  const runtime = entries.filter(({ cats }) => !isRuntimeFree(cats));
  const srcRuntime = runtime.filter(({ file, cats }) => isAppCode(file.path) && !cats.has('test'));
  const testsTouched = entries.some(({ file, cats }) => cats.has('test') && file.status !== 'D');

  // --- 비밀값 (모든 파일, 추가된 줄만, 값은 절대 출력하지 않는다)
  for (const { file, cats } of entries) {
    if (file.path === 'package-lock.json') continue;
    if (/\.(jks|keystore|p8|p12|mobileprovision)$/.test(file.path) || /service-account.*\.json$|google-services.*\.json$/.test(file.path)) {
      add('secret.suspect', { security: 20 }, 'CRITICAL', '서명 키·서비스 계정 파일을 커밋 (EAS·GitHub 시크릿에 보관할 것)', [file.path]);
    }
    for (const { line, text } of file.added) {
      for (const [label, re] of SECRET_PATTERNS) {
        if (re.test(text)) add('secret.suspect', { security: 20 }, 'CRITICAL', `비밀값으로 보이는 문자열 (${label})`, [where(file, line)]);
      }
      if (!cats.has('test') && !cats.has('docs') && GENERIC_SECRET.test(text)) {
        add('secret.suspect', { security: 20 }, 'CRITICAL', '하드코딩된 비밀값으로 보이는 대입', [where(file, line)]);
      }
    }
  }

  // --- 범위(Scope)
  const riskSystem = entries.filter(({ cats }) => cats.has('riskSystem')).map(({ file }) => file.path);
  if (riskSystem.length) {
    add('scope.risk-system', { scope: 20 }, 'VERY_HIGH', '리스크 평가·게이트 자체를 바꾼다 (이 PR 은 main 의 규칙으로 평가됨)', riskSystem);
  }
  const infra = entries.filter(({ cats }) => cats.has('infra') && !cats.has('riskSystem')).map(({ file }) => file.path);
  if (infra.length) add('scope.infra', { scope: 20 }, 'HIGH', '배포·CI·런타임 설정(프로덕션 인프라) 변경', infra);
  const core = entries.filter(({ cats }) => cats.has('sharedCore')).map(({ file }) => file.path);
  if (core.length) add('scope.shared-core', { scope: 15 }, 'HIGH', '모든 요청이 거치는 공통 모듈 변경', core);

  const areas = new Set(srcRuntime.map(({ file }) => area(file.path)));
  if (srcRuntime.length === 1) add('scope.areas', { scope: 5 }, null, `런타임 파일 1개 (${[...areas][0]})`, [srcRuntime[0].file.path]);
  else if (areas.size >= 3) add('scope.areas', { scope: 15 }, null, `런타임 영역 ${areas.size}곳: ${[...areas].join(', ')}`);
  else if (srcRuntime.length > 1) add('scope.areas', { scope: 10 }, null, `런타임 영역 ${areas.size}곳: ${[...areas].join(', ')}`);

  // --- 보안 / 호환성 (코드)
  for (const { file, cats } of entries) {
    const isSrc = isAppCode(file.path) && !cats.has('test');
    if (cats.has('auth')) add('security.auth-path', { security: 15 }, 'HIGH', '인증·세션·권한 관련 파일 변경', [file.path]);

    // Edge Function 은 출시된 모든 앱 버전이 부르는 서버 API 다.
    if (cats.has('api')) {
      const fn = file.path.split('/')[2];
      if ((file.status === 'D' || file.status === 'R') && /\/index\.ts$/.test(file.oldPath)) {
        add('compat.endpoint-removed', { compatibility: 15 }, 'HIGH', `Edge Function ${fn} 삭제/이름 변경 (구버전 앱이 계속 호출함)`, [file.oldPath]);
      } else if (file.status === 'A' && /\/index\.ts$/.test(file.path)) {
        add('security.write-endpoint', { security: 10 }, null, `Edge Function ${fn} 추가 (인증·입력 검증 확인)`, [file.path]);
      }
    }
    if (cats.has('page') && (file.status === 'D' || file.status === 'R') && !/(_layout|\+not-found|\+html)\.tsx$/.test(file.oldPath)) {
      add('compat.route-removed', { compatibility: 10 }, null, '화면 경로 삭제/변경 (딥링크·푸시 알림·공유 링크가 깨짐)', [file.oldPath]);
    }

    for (const { line, text } of file.added) {
      if ((isSrc || file.path.startsWith('scripts/')) && SQL_INTERPOLATION.some((re) => re.test(text))) {
        add('security.sql-interpolation', { security: 15 }, 'HIGH', 'SQL 을 문자열로 조합하는 코드 (파라미터 바인딩 확인)', [where(file, line)]);
      }
      if (isSrc && DANGEROUS_API.test(text)) {
        add('security.dangerous-api', { security: 15 }, 'HIGH', 'eval / 동적 코드 실행 API 사용', [where(file, line)]);
      }
      if (file.path.startsWith('src/') && !cats.has('test') && !isComment(text) && CLIENT_SECRET.test(text)) {
        add('secret.client', { security: 20 }, 'CRITICAL', '앱 코드에 service_role/secret 키 참조 (앱 번들은 누구나 꺼내 볼 수 있다 → Edge Function 으로)', [where(file, line)]);
      }
      if (isSrc && WEBVIEW_RISK.test(text)) {
        add('security.webview', { security: 10 }, null, 'WebView 의 출처 제한 해제·스크립트 주입·파일 접근 (외부 페이지가 앱 권한을 쓰지 않는지 확인)', [where(file, line)]);
      }
      if (isSrc && AUTH_CODE.test(text)) {
        add('security.auth-code', { security: 15 }, 'HIGH', '인증·세션·권한 판단 코드 변경', [where(file, line)]);
      }
      if (file.path.startsWith('src/') && !cats.has('test') && DEVICE_STORAGE.test(text)) {
        add('compat.device-storage', { compatibility: 5, migration: 10 }, null, '기기 저장 데이터(키·로컬 DB 스키마) 변경 — 구버전 앱이 남긴 값과 호환되는지 확인', [where(file, line)]);
      }
      if (/\.(m?[jt]sx?)$/.test(file.path) && SUPPRESSION.test(text)) {
        add('testing.suppression', { testing: 10 }, null, 'lint/타입 검사 억제 주석 추가', [where(file, line)]);
      }
      if (cats.has('test') && TEST_SKIP.test(text)) {
        add('testing.suppression', { testing: 10 }, null, '테스트 skip/only 추가', [where(file, line)]);
      }
    }

    if (cats.has('test')) {
      const removedCases = file.removed.filter((r) => TEST_CASE.test(r.text)).length;
      const addedCases = file.added.filter((a) => TEST_CASE.test(a.text)).length;
      if (file.status === 'D' || removedCases > addedCases) {
        add('testing.tests-removed', { testing: 15 }, null, '테스트 케이스가 줄었다', [file.path]);
      }
    }
  }

  // --- 네이티브 (새 바이너리가 필요한 변경: OTA 불가, 스토어 심사, 설치된 앱은 되돌릴 수 없음)
  const NATIVE_RULES = {
    identity: ['native.identity', { compatibility: 20, migration: 20 }, 'CRITICAL', '앱 식별자 변경 — 스토어에서 다른 앱이 되고 기존 사용자가 업데이트를 받지 못함'],
    scheme: ['compat.scheme', { compatibility: 15 }, 'HIGH', '딥링크 scheme 변경 — 기존 링크·로그인 리디렉트가 깨짐'],
    updates: ['native.updates', { migration: 15 }, 'HIGH', 'OTA 업데이트 설정 변경 — 잘못되면 이후 업데이트가 앱에 닿지 않음'],
    permission: ['native.permission', { security: 10 }, null, '새 권한 요청 — 스토어 개인정보 라벨/Data safety·권한 문구 갱신 필요'],
    plugin: ['native.plugin', { migration: 15 }, 'HIGH', 'config plugin 추가 — 새 빌드 필요'],
    cleartext: ['security.cleartext', { security: 15 }, 'HIGH', '평문 HTTP 허용'],
    native: ['native.config', { migration: 15 }, 'HIGH', '네이티브 설정 변경 — 새 빌드·스토어 심사 필요, OTA 로 되돌릴 수 없음'],
  };
  for (const { file, cats } of entries) {
    if (!cats.has('native')) continue;
    if (file.path === 'app.json') {
      for (const item of analyzeAppConfig(readBase('app.json'), readHead('app.json'))) {
        const [id, floors, level, message] = NATIVE_RULES[item.kind];
        add(id, floors, level, message, [`app.json — ${item.detail}`]);
      }
    } else {
      add(...NATIVE_RULES.native, [file.path]);
    }
  }
  if (fingerprint?.changed) {
    add(
      'native.fingerprint',
      { migration: 15 },
      'HIGH',
      'fingerprint(runtimeVersion) 가 바뀜 — 이 변경은 OTA 로 나갈 수 없고 새 빌드·스토어 심사가 필요하며, 설치된 앱은 되돌릴 수 없다',
      (fingerprint.sources ?? []).slice(0, 10),
    );
  }

  // --- 새 환경변수
  const ignoreEnv = new Set(config.ignoreEnv ?? []);
  const newEnv = new Map();
  for (const { file, cats } of entries) {
    if (!isAppCode(file.path) || cats.has('test')) continue;
    for (const { line, text } of file.added) {
      for (const m of text.matchAll(ENV_REF)) {
        const name = m[1] ?? m[2] ?? m[3] ?? m[4];
        if (!name || ignoreEnv.has(name)) continue;
        if (PUBLIC_SECRET_NAME.test(name)) {
          add('secret.public-env', { security: 20 }, 'CRITICAL', `비밀값 이름의 공개 변수 ${name} (EXPO_PUBLIC_ 은 앱 번들에 박힌다)`, [where(file, line)]);
        }
        if (file.path.startsWith('src/') && !name.startsWith('EXPO_PUBLIC_')) {
          add('config.non-public-env', { compatibility: 10, testing: 10 }, null, `앱 코드가 ${name} 를 읽는다 — EXPO_PUBLIC_ 이 아니면 앱에서는 항상 undefined`, [where(file, line)]);
        }
        if (!newEnv.has(name)) newEnv.set(name, { place: where(file, line), fn: file.path.startsWith('supabase/') });
      }
    }
  }
  for (const [name, { place, fn }] of newEnv) {
    if (!baseReferences(name)) {
      const where_ = fn ? 'Supabase secret(supabase secrets set)' : 'EAS 환경변수(production·preview)';
      add('config.new-env', { compatibility: 10, migration: 10 }, null, `새 환경변수 ${name} (빌드·배포 전에 ${where_} 에 있어야 함)`, [place]);
    }
  }

  // --- 의존성
  const pkgFile = byPath.get('package.json');
  if (pkgFile) {
    const base = parseJson(readBase('package.json'));
    const head = parseJson(readHead('package.json'));
    for (const [section, isProd] of [
      ['dependencies', true],
      ['devDependencies', false],
    ]) {
      const b = base[section] ?? {};
      const h = head[section] ?? {};
      for (const [name, range] of Object.entries(h)) {
        if (isProd && isNativePackage(name) && b[name] !== range) {
          add('native.dependency', { migration: 15 }, 'HIGH', `네이티브 의존성 ${name in b ? `변경 ${name} ${b[name]} → ${range}` : `추가 ${name}@${range}`} — 새 빌드 필요(OTA 불가)`, ['package.json']);
        }
        if (!(name in b)) {
          add(isProd ? 'deps.added' : 'deps.dev', { security: 5 }, null, `${isProd ? '' : '개발 '}의존성 추가 ${name}@${range}`, ['package.json']);
        } else if (major(b[name]) !== null && major(range) !== null && major(range) > major(b[name])) {
          add('deps.major', { compatibility: isProd ? 10 : 5 }, null, `메이저 업그레이드 ${name} ${b[name]} → ${range}`, ['package.json']);
        } else if (b[name] !== range) {
          // 마이너·패치도 새 코드가 들어온다(공급망). 낮은 floor 로 기록만 한다.
          add('deps.updated', { security: 5 }, null, `버전 변경 ${name} ${b[name]} → ${range}`, ['package.json']);
        }
      }
      for (const name of Object.keys(b)) {
        if (!(name in h) && isProd) {
          add('deps.removed', { compatibility: 5 }, null, `의존성 제거 ${name}`, ['package.json']);
          if (isNativePackage(name)) add('native.dependency', { migration: 15 }, 'HIGH', `네이티브 의존성 제거 ${name} — 새 빌드 필요(OTA 불가)`, ['package.json']);
        }
      }
    }
    for (const key of ['scripts', 'engines', 'type', 'overrides']) {
      if (JSON.stringify(base[key] ?? null) !== JSON.stringify(head[key] ?? null)) {
        add('config.package', { scope: 10 }, null, `package.json "${key}" 변경 (빌드·실행 방식)`, ['package.json']);
      }
    }
  } else if (byPath.has('package-lock.json')) {
    add('deps.lockfile', { security: 5 }, null, 'lockfile 만 변경 (간접 의존성 버전 변경)', ['package-lock.json']);
  }

  // --- 마이그레이션
  const migrations = entries.filter(({ cats }) => cats.has('migration'));
  for (const { file } of migrations) {
    if (file.status !== 'A') {
      add('migration.edited', { migration: 20 }, 'VERY_HIGH', '이미 있는 마이그레이션 파일을 수정/삭제/이름 변경 (프로덕션과 스키마 분기)', [file.oldPath]);
    }
  }
  const newMigrations = migrations.filter(({ file }) => file.status === 'A');
  const newTables = new Set();
  const newColumns = new Set();
  const sqlByFile = new Map();
  for (const { file } of newMigrations) {
    const sql = readHead(file.path) ?? file.added.map((a) => a.text).join('\n');
    sqlByFile.set(file.path, sql);
    for (const t of createdTables(sql)) newTables.add(t);
    for (const c of addedColumns(sql)) newColumns.add(c);
  }
  const MIGRATION_RULES = {
    destructive: ['migration.destructive', { migration: 20 }, 'VERY_HIGH', '파괴적 마이그레이션 (데이터 손실, 되돌릴 수 없음)'],
    breaking: ['migration.breaking', { migration: 15, compatibility: 15 }, 'VERY_HIGH', '이전 버전 코드와 호환되지 않는 스키마 변경 (배포 중·롤백 시 장애)'],
    locking: ['migration.locking', { migration: 15 }, 'HIGH', '기존 테이블 잠금·재작성이 필요한 변경'],
    data: ['migration.data', { migration: 15 }, 'HIGH', '기존 데이터 변경 (되돌리는 방법 필요)'],
    'tx-control': ['migration.tx-control', { migration: 15 }, 'HIGH', '파일 안의 트랜잭션 제어문'],
    permission: ['security.db-permission', { security: 15 }, 'HIGH', '기존 테이블의 DB 권한·RLS 정책 변경'],
    'policy-new': ['security.rls-policy', { security: 10 }, null, '새 테이블의 RLS 정책·권한 (남의 행을 못 읽고 못 쓰는지 test/db 로 확인)'],
    extension: ['security.db-extension', { security: 10 }, null, 'Postgres 확장 추가/변경'],
    replace: ['migration.replace', { migration: 10, compatibility: 10 }, null, '함수/뷰 교체 (동작 변경)'],
    seed: ['migration.seed', { migration: 10 }, null, '기존 테이블에 데이터 추가'],
    alter: ['migration.alter', { migration: 10, compatibility: 5 }, null, '제약·기본값 완화 등 비파괴 변경'],
    additive: ['migration.additive', { migration: 10, compatibility: 5 }, null, '추가형 스키마 변경 (새 테이블·nullable 컬럼·인덱스)'],
    unclassified: ['migration.unclassified', { migration: 10 }, null, '자동 분류하지 못한 문장 (사람이 확인)'],
  };
  for (const table of tablesWithoutRls(sqlByFile.values())) {
    add('security.rls-missing', { security: 20 }, 'VERY_HIGH', `RLS 를 켜지 않은 public 테이블 ${table} — 공개 키로 누구나 읽고 쓸 수 있다`, [table]);
  }
  for (const [path, sql] of sqlByFile) {
    for (const stmt of splitSql(sql)) {
      const s = stmt.toLowerCase();
      if (/^(create|alter) policy\b/.test(s) && /(using|with check)\s*\(\s*true\s*\)/.test(s) && !/\bfor select\b/.test(s)) {
        add('security.rls-open', { security: 15 }, 'HIGH', '쓰기를 모두에게 여는 RLS 정책 (using/with check (true))', [`${path} — ${short(stmt)}`]);
      }
      if (/\bsecurity definer\b/.test(s) && !/\bsearch_path\b/.test(s)) {
        add('security.definer', { security: 15 }, 'HIGH', 'search_path 없는 security definer 함수 (권한 상승 위험)', [`${path} — ${short(stmt)}`]);
      }
    }
    for (const item of analyzeMigration(sql, newTables, newColumns)) {
      const [id, floors, level, message] = MIGRATION_RULES[item.kind];
      add(id, floors, level, message, [item.detail ? `${path} — ${item.detail}` : path]);
      if ((item.kind === 'destructive' || item.kind === 'breaking') && item.ident && item.ident.length > 1 && baseReferences(item.ident)) {
        add(
          'migration.referenced',
          { migration: 20, compatibility: 20 },
          'CRITICAL',
          '현재 출시된 앱(main 의 코드)이 아직 쓰는 이름을 지우거나 바꾼다 — merge 즉시 설치된 앱이 깨진다 (expand → contract, 최소 지원 버전을 올린 뒤에)',
          [`${path} — ${item.detail} (main 의 src/·supabase/functions 에서 "${item.ident}" 참조)`],
        );
      }
    }
  }

  // --- 테스트
  if (srcRuntime.length && !testsTouched) {
    add('testing.untested', { testing: 10 }, null, '런타임 코드가 바뀌었는데 테스트 변경이 없다', srcRuntime.map(({ file }) => file.path));
  }

  const runtimeChanged = runtime.length > 0;
  if (!runtimeChanged) add('scope.no-runtime', {}, null, '런타임 영향 없음 (문서·테스트·에이전트 설정만)');
  const nativeChanged = signals.some((sig) => sig.id.startsWith('native.'));

  // --- 집계
  const floors = Object.fromEntries(FACTORS.map((f) => [f, 0]));
  for (const s of signals) for (const [f, v] of Object.entries(s.floors)) floors[f] = Math.max(floors[f], v);
  const overrideLevel = maxLevel(...signals.map((s) => s.level));
  const floorTotal = FACTORS.reduce((sum, f) => sum + floors[f], 0);

  return {
    files: entries.map(({ file, cats }) => ({
      path: file.path,
      status: file.status,
      categories: [...cats],
      added: file.added.length,
      removed: file.removed.length,
    })),
    runtimeChanged,
    nativeChanged,
    signals,
    floors,
    floorTotal,
    overrideLevel,
    preliminaryLevel: maxLevel(bandLevel(floorTotal), overrideLevel),
  };
}
