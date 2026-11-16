import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// .maestro/*.yaml(스테이징 때 Android 에뮬레이터에서 도는 e2e)이 찾는 testID 가 앱 코드에 실제로 있는지.
// e2e 는 PR 에서 돌지 않으므로, 화면을 바꾸다 이 ID 를 지우면 스테이징에서야 실패한다 — 그걸 PR 에서 미리 잡는다.
const root = path.join(__dirname, "..");

function filesUnder(dir: string, ext: RegExp): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return filesUnder(p, ext);
    return ext.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}

describe("maestro testIDs", () => {
  // 한계: testID 는 소스 글자로 찾으므로 주석·문자열 안의 testID 도 "있다" 로 본다(잘못 통과하는 쪽). 실제 화면 확인은 스테이징 e2e 가 한다.
  it("e2e 흐름이 찾는 id 는 모두 앱 코드의 testID 다", () => {
    const flows = filesUnder(path.join(root, ".maestro"), /\.ya?ml$/);
    // id: "x" · id: 'x' · id: x · { id: "x" } 모두(따옴표 없는 값은 공백·쉼표·} ·주석 전까지)
    const ID = /(?:^|[\s{,])id:\s*(?:"([^"]+)"|'([^']+)'|([^\s#"',}]+))/gm;
    const ids = new Set(flows.flatMap((f) => [...readFileSync(f, "utf8").matchAll(ID)].map((m) => (m[1] ?? m[2] ?? m[3])!)));
    expect(ids.size).toBeGreaterThan(0);
    const source = filesUnder(path.join(root, "src"), /\.tsx?$/).map((f) => readFileSync(f, "utf8")).join("\n");
    const missing = [...ids].filter((id) => !source.includes(`testID="${id}"`) && !source.includes(`testID={\`${id}`));
    expect(missing).toEqual([]);
  });
});
