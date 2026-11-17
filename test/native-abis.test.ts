import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// Expo 는 일부 모듈을 미리 빌드된 AAR(📦)로 받아 쓴다. 그런데 그 AAR 에 앱이 내보내는 ABI 의 .so 가 다 있지는 않다
// (expo-sqlite 57.0.5 는 arm64-v8a 만). 그러면 다른 ABI 기기(32비트 폰·x86 크롬북·에뮬레이터)에서는 앱이 켜지자마자
// 네이티브 라이브러리를 못 찾는다. 이런 모듈은 package.json 의 expo.autolinking.android.buildFromSource 에 넣어
// 소스에서 빌드해야 한다. Expo 업데이트로 새 모듈이 미리 빌드돼 들어와도 이 테스트가 PR 에서 잡는다.
const root = path.join(__dirname, "..");

/** prebuild 가 만드는 android/gradle.properties 의 기본 reactNativeArchitectures(expo/template.tgz) */
const APP_ABIS = ["armeabi-v7a", "arm64-v8a", "x86", "x86_64"];

/** zip(AAR) 의 파일 이름 목록 — 중앙 디렉터리만 읽는다 */
function zipEntries(file: string): string[] {
  const buf = readFileSync(file);
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error(`zip 이 아니다: ${file}`);
  const count = buf.readUInt16LE(eocd + 10);
  let at = buf.readUInt32LE(eocd + 16);
  const names: string[] = [];
  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(at) !== 0x02014b50) throw new Error(`zip 중앙 디렉터리가 깨졌다: ${file}`);
    const nameLength = buf.readUInt16LE(at + 28);
    const extraLength = buf.readUInt16LE(at + 30);
    const commentLength = buf.readUInt16LE(at + 32);
    names.push(buf.toString("utf8", at + 46, at + 46 + nameLength));
    at += 46 + nameLength + extraLength + commentLength;
  }
  return names;
}

function packageDirs(): string[] {
  const nm = path.join(root, "node_modules");
  return readdirSync(nm, { withFileTypes: true }).flatMap((e) => {
    if (!e.isDirectory()) return [];
    const p = path.join(nm, e.name);
    return e.name.startsWith("@") ? readdirSync(p).map((s) => path.join(p, s)) : [p];
  });
}

type Publication = { groupId: string; artifactId: string; version: string; repository: string };

/** 미리 빌드된 AAR 을 쓰는 Expo 모듈과, 그 AAR 안의 .so 가 있는 ABI(네이티브 라이브러리가 없으면 빈 배열) */
function precompiledModules(): { name: string; abis: string[] }[] {
  return packageDirs().flatMap((dir) => {
    const configFile = path.join(dir, "expo-module.config.json");
    if (!existsSync(configFile)) return [];
    const publication = (JSON.parse(readFileSync(configFile, "utf8")) as { android?: { publication?: Publication } }).android?.publication;
    if (!publication) return [];
    const { groupId, artifactId, version, repository } = publication;
    const aar = path.join(dir, repository, ...groupId.split("."), artifactId, version, `${artifactId}-${version}.aar`);
    if (!existsSync(aar)) return [];
    const abis = [...new Set(zipEntries(aar).flatMap((n) => /^jni\/([^/]+)\/[^/]+\.so$/.exec(n)?.[1] ?? []))];
    const name = (JSON.parse(readFileSync(path.join(dir, "package.json"), "utf8")) as { name: string }).name;
    return [{ name, abis }];
  });
}

describe("미리 빌드된 Expo 모듈의 ABI", () => {
  it("앱이 내보내는 모든 ABI 의 .so 가 없으면 buildFromSource 로 소스에서 빌드한다", () => {
    const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8")) as {
      expo?: { autolinking?: { buildFromSource?: string[]; android?: { buildFromSource?: string[] } } };
    };
    const autolinking = pkg.expo?.autolinking;
    // autolinking 은 공통 설정 위에 android 설정을 덮어쓴다(expo-modules-autolinking 의 parsePackageJsonOptions).
    const patterns = (autolinking?.android?.buildFromSource ?? autolinking?.buildFromSource ?? []).map((p) => new RegExp(`^(?:${p})$`));
    const modules = precompiledModules();
    // 하나도 못 찾으면 이 테스트가 헛돈다 — ABI 문제가 아니라 찾는 방법을 고쳐야 한다는 뜻이다.
    expect(
      modules.length,
      "node_modules 에서 미리 빌드된 Expo 모듈 AAR(expo-module.config.json 의 android.publication)을 하나도 못 찾았다. npm ci 를 했는지, Expo 가 배포 방식을 바꿨는지 보고 precompiledModules() 를 고친다.",
    ).toBeGreaterThan(0);
    const broken = modules
      .filter((m) => m.abis.length > 0) // .so 가 없는 AAR 은 ABI 와 상관없다
      .filter((m) => !patterns.some((p) => p.test(m.name)))
      .map((m) => ({ name: m.name, missing: APP_ABIS.filter((a) => !m.abis.includes(a)) }))
      .filter((m) => m.missing.length > 0);
    expect(broken).toEqual([]);
  });
});
