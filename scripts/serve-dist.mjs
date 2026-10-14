#!/usr/bin/env node
// `expo export --platform web` 결과(dist/)를 정적으로 띄운다. Playwright 웹 스모크 테스트용.
// /foo → foo.html → foo/index.html 순서로 찾고, 없으면 +not-found.html 을 404 로 준다.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(process.argv[3] ?? "dist");
const port = Number(process.argv[2] ?? 4173);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};

async function isFile(file) {
  try {
    return (await stat(file)).isFile();
  } catch {
    return false;
  }
}

export async function resolveFile(urlPath, dir = root) {
  const clean = path.normalize(decodeURIComponent(urlPath.split("?")[0])).replace(/^(\.\.[/\\])+/, "");
  const base = path.join(dir, clean);
  if (!base.startsWith(dir)) return null;
  for (const candidate of [base, `${base}.html`, path.join(base, "index.html")]) {
    if (await isFile(candidate)) return candidate;
  }
  return null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  createServer(async (req, res) => {
    const file = await resolveFile(req.url ?? "/");
    const target = file ?? path.join(root, "+not-found.html");
    try {
      const body = await readFile(target);
      res.writeHead(file ? 200 : 404, { "content-type": TYPES[path.extname(target)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  }).listen(port, "127.0.0.1", () => console.log(`serving ${root} on http://127.0.0.1:${port}`));
}
