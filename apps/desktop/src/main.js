const { app, BrowserWindow, shell, dialog } = require("electron");
const { spawn, execFileSync } = require("node:child_process");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const http = require("node:http");

// A packaged GUI-subsystem exe on Windows has no console attached — nothing
// written to stdout/stderr is visible anywhere, even redirected. Log to a
// file from the very first line instead, before anything else can throw,
// so a silent early failure is actually diagnosable (this cost real time
// to figure out on the sibling an-whatsapp-platform desktop app).
const LOG_PATH = path.join(app.getPath("userData"), "main.log");
fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
const logStream = fs.createWriteStream(LOG_PATH, { flags: "a" });
function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.map((a) => (a instanceof Error ? a.stack : String(a))).join(" ")}\n`;
  logStream.write(line);
}
log("=== main.js starting ===", "isPackaged:", app.isPackaged, "execPath:", process.execPath);
process.on("uncaughtException", (err) => {
  log("UNCAUGHT EXCEPTION:", err);
  try {
    dialog.showErrorBox("AN Telegram Platform crashed", `${err?.stack ?? err}\n\nLog: ${LOG_PATH}`);
  } catch {
    /* dialog module may not be ready this early */
  }
});
process.on("unhandledRejection", (reason) => {
  log("UNHANDLED REJECTION:", reason);
});

const RESOURCES = app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", "resources");
log("RESOURCES:", RESOURCES, "exists:", fs.existsSync(RESOURCES));

const DATA_DIR = path.join(app.getPath("userData"), "data");
const DB_PATH = path.join(DATA_DIR, "dev.db");
const ATTACHMENTS_DIR = path.join(DATA_DIR, "attachments");
const SECRETS_PATH = path.join(DATA_DIR, "secrets.json");

const PORTS = { web: 3000, api: 4000 };

const children = [];
let mainWindow;
let splash;

function ensureDataDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

// First launch only: seed the SQLite file from the pre-migrated template
// bundled with the app (built by build.js via `prisma migrate deploy`),
// so no migration engine has to run on the user's machine on a fresh install.
function ensureDatabase() {
  if (fs.existsSync(DB_PATH)) return;
  const template = path.join(RESOURCES, "db-template", "template.db");
  fs.copyFileSync(template, DB_PATH);
}

// Every launch, on an *existing* db: applies any migrations added since the
// user's last-installed version (a plain "does this file exist" check can't
// tell an up-to-date db from a stale one after an upgrade — this bit a real
// install once, api/worker crash-looping against
// `Invalid prisma.connector.findMany() invocation: column ... does not
// exist`). `migrate deploy` only applies pending migrations and is a no-op
// (fast) when already current, so it's safe/cheap to run unconditionally
// rather than trying to version-detect first. Runs synchronously, before
// api/worker are spawned, since both would otherwise race a mid-migration db.
function runPendingMigrations() {
  const nodeExe = path.join(RESOURCES, "node", "node.exe");
  const prismaCli = path.join(RESOURCES, "migrate", "node_modules", "prisma", "build", "index.js");
  const schema = path.join(RESOURCES, "migrate", "prisma", "schema.prisma");
  if (!fs.existsSync(prismaCli) || !fs.existsSync(schema)) {
    log("runPendingMigrations: bundled prisma CLI/schema not found, skipping (fresh installs are unaffected — only relevant on upgrade)");
    return;
  }
  log("runPendingMigrations: applying any pending migrations to", DB_PATH);
  try {
    const output = execFileSync(nodeExe, [prismaCli, "migrate", "deploy", "--schema", schema], {
      cwd: path.join(RESOURCES, "migrate"),
      env: { ...process.env, DATABASE_URL: `file:${DB_PATH}` },
      windowsHide: true,
      encoding: "utf8",
    });
    log("runPendingMigrations: done\n" + output);
  } catch (err) {
    log("runPendingMigrations FAILED — stdout:\n" + (err.stdout ?? "") + "\nstderr:\n" + (err.stderr ?? ""));
    throw err;
  }
}

// Per-install random secrets, generated once and persisted in userData —
// never shipped in the installer, never the same across installs.
// credentialEncryptionKey encrypts MTProto session strings at rest
// (packages/connectors-core/src/crypto.ts) — losing it means every
// logged-in Telegram user-account connector needs to log in again.
function ensureSecrets() {
  if (fs.existsSync(SECRETS_PATH)) {
    return JSON.parse(fs.readFileSync(SECRETS_PATH, "utf8"));
  }
  const secrets = {
    jwtSecret: crypto.randomBytes(32).toString("hex"),
    attachmentSigningSecret: crypto.randomBytes(32).toString("hex"),
    credentialEncryptionKey: crypto.randomBytes(32).toString("hex"),
  };
  fs.writeFileSync(SECRETS_PATH, JSON.stringify(secrets, null, 2), { mode: 0o600 });
  return secrets;
}

function baseEnv(secrets) {
  return {
    ...process.env,
    NODE_ENV: "production",
    DATABASE_URL: `file:${DB_PATH}`,
    ATTACHMENT_STORAGE_DIR: ATTACHMENTS_DIR,
    ATTACHMENT_SIGNING_SECRET: secrets.attachmentSigningSecret,
    JWT_SECRET: secrets.jwtSecret,
    CREDENTIAL_ENCRYPTION_KEY: secrets.credentialEncryptionKey,
    PUBLIC_API_URL: `http://127.0.0.1:${PORTS.api}`,
    PORT: String(PORTS.api),
  };
}

function spawnService(name, command, args, cwd, env) {
  const child = spawn(command, args, { cwd, env, windowsHide: true });
  child.stdout?.on("data", (d) => log(`[${name}]`, d.toString().trimEnd()));
  child.stderr?.on("data", (d) => log(`[${name}]`, d.toString().trimEnd()));
  child.on("error", (err) => log(`[${name}] spawn error:`, err));
  child.on("exit", (code) => log(`[${name}] exited with code ${code}`));
  children.push(child);
  return child;
}

function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      const req = http.get(url, (res) => {
        res.resume();
        resolve();
      });
      req.on("error", () => {
        if (Date.now() > deadline) {
          reject(new Error(`Timed out waiting for ${url}`));
        } else {
          setTimeout(attempt, 400);
        }
      });
    };
    attempt();
  });
}

function startServices(secrets) {
  const env = baseEnv(secrets);
  // A real, unmodified node.exe (bundled by build.js) — not
  // process.execPath (the packaged, renamed Electron binary). Spawning
  // several unsigned copies of the app's own renamed Electron.exe as
  // "children" looks like process self-replication to Windows Defender's
  // behavior heuristics and got silently killed on a real install of the
  // sibling an-whatsapp-platform desktop app (surfaced as a bare
  // `spawn ... ENOENT`, no antivirus message). Plain node.exe avoids that.
  const nodeExe = path.join(RESOURCES, "node", "node.exe");

  // connectors-bootstrap enables Bot API long-polling only in the worker
  // process, so exactly one process owns getUpdates() per bot even though
  // both api and worker hydrate the connector registry at startup.
  spawnService(
    "api",
    nodeExe,
    [path.join(RESOURCES, "api", "dist", "main.js")],
    path.join(RESOURCES, "api"),
    { ...env, AN_TG_PROCESS: "api" },
  );
  spawnService(
    "worker",
    nodeExe,
    [path.join(RESOURCES, "worker", "dist", "index.js")],
    path.join(RESOURCES, "worker"),
    { ...env, AN_TG_PROCESS: "worker" },
  );
  spawnService(
    "web",
    nodeExe,
    [path.join(RESOURCES, "web", "apps", "web", "server.js")],
    path.join(RESOURCES, "web", "apps", "web"),
    { ...env, PORT: String(PORTS.web), HOSTNAME: "127.0.0.1" },
  );
}

function createSplash() {
  splash = new BrowserWindow({
    width: 420,
    height: 260,
    frame: false,
    resizable: false,
    center: true,
    webPreferences: { contextIsolation: true },
  });
  splash.loadURL(
    "data:text/html,<body style='margin:0;display:flex;align-items:center;justify-content:center;height:100vh;" +
      "font-family:Segoe UI,sans-serif;background:#111827;color:#f3f4f6'>" +
      "<div style='text-align:center'><h2>AN Telegram Platform</h2><p>Starting local services…</p></div></body>",
  );
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false },
  });
  mainWindow.loadURL(`http://127.0.0.1:${PORTS.web}`);
  mainWindow.once("ready-to-show", () => {
    splash?.close();
    mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

function stopServices() {
  for (const child of children) {
    if (!child.killed) child.kill();
  }
}

log("registering app.whenReady handler");
app
  .whenReady()
  .then(async () => {
    log("app ready — creating splash");
    createSplash();
    try {
      log("ensureDataDir");
      ensureDataDir();
      log("ensureDatabase");
      ensureDatabase();
      log("runPendingMigrations");
      runPendingMigrations();
      log("ensureSecrets");
      const secrets = ensureSecrets();
      log("startServices");
      startServices(secrets);
      log("waiting for web on port", PORTS.web);
      await waitForHttp(`http://127.0.0.1:${PORTS.web}`, 60_000);
      log("web is up — creating main window");
      createMainWindow();
      log("main window created");
    } catch (err) {
      log("startup failed:", err);
      dialog.showErrorBox("AN Telegram Platform failed to start", `${err?.stack ?? err}\n\nLog: ${LOG_PATH}`);
      app.quit();
    }
  })
  .catch((err) => {
    log("whenReady() itself rejected:", err);
  });

app.on("window-all-closed", () => {
  stopServices();
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", stopServices);
