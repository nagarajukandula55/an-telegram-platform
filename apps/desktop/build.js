// Assembles apps/desktop/resources/ — everything the Electron shell spawns
// at runtime (api, worker, web) as self-contained, non-symlinked
// directories, plus a pre-migrated template SQLite db and a bundled
// node.exe. Unlike the sibling an-whatsapp-platform build, there's no
// browser-automation service to bundle here — MTProto (GramJS) is a plain
// TCP/TLS client that runs in-process inside api/worker, no Chromium needed.
//
// Run from the repo root via `pnpm --filter @an-tg/desktop build:resources`,
// or as part of `pnpm --filter @an-tg/desktop dist:win`.
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
const RESOURCES = path.join(__dirname, "resources");

function run(cmd, args, cwd) {
  console.log(`\n> ${cmd} ${args.join(" ")}`);
  try {
    execFileSync(cmd, args, { cwd: cwd ?? ROOT, stdio: "inherit", shell: process.platform === "win32" });
  } catch (err) {
    // The pnpm content-addressable store occasionally serves a package with
    // a missing/truncated file after several builds run back-to-back in a
    // workspace (seen with next's jest-worker files in the sibling repo) —
    // `pnpm install --force` re-verifies and refetches anything with a bad
    // content hash. One retry after that clears it; a second real failure
    // should surface.
    console.warn(`\n! ${cmd} ${args.join(" ")} failed — repairing pnpm store and retrying once`);
    execFileSync("pnpm", ["install", "--force"], { cwd: ROOT, stdio: "inherit", shell: process.platform === "win32" });
    execFileSync(cmd, args, { cwd: cwd ?? ROOT, stdio: "inherit", shell: process.platform === "win32" });
  }
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

// fs.cpSync's dereference:true doesn't reliably resolve symlinks nested
// *inside* an already-dereferenced directory on Windows (pnpm's virtual
// store is a graph of symlinks referencing each other, several levels
// deep) — it silently leaves some as dangling links once the tree is
// copied elsewhere. Walk and copy by hand instead, always following
// symlinks to real content.
function copyDereferenced(src, dest) {
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src)) {
      copyDereferenced(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function findGeneratedPrismaClient() {
  const pnpmDir = path.join(ROOT, "node_modules", ".pnpm");
  const entry = fs.readdirSync(pnpmDir).find((name) => name.startsWith("@prisma+client@"));
  if (!entry) throw new Error("Could not find generated @prisma/client in node_modules/.pnpm");
  return path.join(pnpmDir, entry, "node_modules", ".prisma", "client");
}

// pnpm deploy re-installs each package's own deps fresh, which reinstalls a
// stock @prisma/client without our generated client (schema + query
// engine). Patch it in from the already-generated copy at the repo root
// instead of re-running `prisma generate` inside every deploy target.
function patchPrismaClient(deployDir) {
  const generated = findGeneratedPrismaClient();
  const dest = path.join(deployDir, "node_modules", ".prisma", "client");
  rmrf(dest);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(generated, dest, { recursive: true });
}

function deployApp(pkgName, dirName) {
  const target = path.join(RESOURCES, dirName);
  rmrf(target);
  run("pnpm", ["--filter", pkgName, "deploy", "--prod", "--config.node-linker=hoisted", target]);
  patchPrismaClient(target);
}

console.log("== 1. Building all workspace apps ==");
run("pnpm", ["--filter", "@an-tg/database", "build"]);
run("pnpm", ["--filter", "@an-tg/api", "build"]);
run("pnpm", ["--filter", "@an-tg/worker", "build"]);
run("pnpm", ["--filter", "@an-tg/web", "build"]);

console.log("\n== 2. Deploying backend services (flat, non-symlinked node_modules) ==");
rmrf(RESOURCES);
fs.mkdirSync(RESOURCES, { recursive: true });
deployApp("@an-tg/api", "api");
deployApp("@an-tg/worker", "worker");

console.log("\n== 3. Copying web standalone build ==");
const webOut = path.join(RESOURCES, "web");
fs.mkdirSync(webOut, { recursive: true });
copyDereferenced(path.join(ROOT, "apps", "web", ".next", "standalone"), webOut);
copyDereferenced(path.join(ROOT, "apps", "web", ".next", "static"), path.join(webOut, "apps", "web", ".next", "static"));
if (fs.existsSync(path.join(ROOT, "apps", "web", "public"))) {
  copyDereferenced(path.join(ROOT, "apps", "web", "public"), path.join(webOut, "apps", "web", "public"));
}

// Next's standalone tracer only copies what it can see statically imported;
// packages it `require()`s dynamically at runtime (styled-jsx, @swc/helpers,
// @next/env, ...) end up present deep inside node_modules/.pnpm but without
// the top-level resolution shim pnpm normally symlinks in, so plain
// `require("styled-jsx/...")` fails once the tree is copied off this
// machine (this bit an-whatsapp-platform's first real-machine install).
// Hoist every package pnpm's virtual store holds up to real top-level
// entries to fix that.
function hoistPnpmStore(nodeModulesDir) {
  const pnpmDir = path.join(nodeModulesDir, ".pnpm");
  if (!fs.existsSync(pnpmDir)) return;
  for (const storeEntry of fs.readdirSync(pnpmDir)) {
    const pkgNodeModules = path.join(pnpmDir, storeEntry, "node_modules");
    if (!fs.existsSync(pkgNodeModules)) continue;
    for (const pkgOrScope of fs.readdirSync(pkgNodeModules)) {
      const names = pkgOrScope.startsWith("@")
        ? fs.readdirSync(path.join(pkgNodeModules, pkgOrScope)).map((n) => `${pkgOrScope}/${n}`)
        : [pkgOrScope];
      for (const name of names) {
        const dest = path.join(nodeModulesDir, name);
        if (fs.existsSync(dest)) continue; // already a real top-level entry
        copyDereferenced(path.join(pkgNodeModules, name), dest);
      }
    }
  }
}
hoistPnpmStore(path.join(webOut, "node_modules"));
hoistPnpmStore(path.join(webOut, "apps", "web", "node_modules"));

console.log("\n== 4. Bundling a real node.exe for spawning child services ==");
// Spawning child services via process.execPath (the packaged, renamed
// Electron binary) makes the installed app launch several unsigned copies
// of *itself* — a process-spawns-copy-of-itself pattern Windows Defender's
// behavior heuristics can silently kill (this is exactly what broke the
// first real install of the sibling an-whatsapp-platform desktop app,
// surfaced as a bare `spawn ... ENOENT` with no visible AV message). A
// real, unmodified node.exe has none of that baggage.
const nodeSrc = process.execPath.toLowerCase().endsWith("node.exe")
  ? process.execPath
  : (() => {
      const where = execFileSync("where", ["node"], { encoding: "utf8" }).trim().split(/\r?\n/)[0];
      if (!where) throw new Error("Could not locate a real node.exe on PATH to bundle");
      return where;
    })();
const nodeDest = path.join(RESOURCES, "node", "node.exe");
fs.mkdirSync(path.dirname(nodeDest), { recursive: true });
fs.copyFileSync(nodeSrc, nodeDest);
console.log(`Bundled ${nodeSrc} -> ${nodeDest}`);

console.log("\n== 5. Producing a clean, pre-migrated template SQLite db ==");
const schemaSrc = path.join(ROOT, "packages", "database", "prisma", "schema.prisma");
const templateDbDir = path.join(RESOURCES, "db-template");
fs.mkdirSync(templateDbDir, { recursive: true });
const templateDb = path.join(templateDbDir, "template.db");
rmrf(templateDb);
execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy", "--schema", schemaSrc], {
  cwd: path.join(ROOT, "packages", "database"),
  stdio: "inherit",
  shell: process.platform === "win32",
  env: { ...process.env, DATABASE_URL: `file:${templateDb}` },
});
// The migration engine can leave a stale (already-applied, harmless)
// rollback journal behind on Windows — drop it so only the clean .db ships.
rmrf(`${templateDb}-journal`);
rmrf(`${templateDb}-wal`);
rmrf(`${templateDb}-shm`);
fs.writeFileSync(path.join(templateDbDir, "schema-version.txt"), require("./schema-version.json").version);

console.log("\n== Done. Resources assembled at apps/desktop/resources ==");
