// Shared by the tests: starts the real server as a child process.

const { spawn } = require("child_process");
const fs = require("fs");
const net = require("net");
const os = require("os");
const path = require("path");

const ROOT = path.join(__dirname, "..");

function freePort() {
    return new Promise((resolve, reject) => {
        const srv = net.createServer();

        srv.listen(0, "127.0.0.1", () => {
            const { port } = srv.address();
            srv.close(() => resolve(port));
        });

        srv.on("error", reject);
    });
}

// Starts `node server.js` with its own port and its own data folder.
// Pass `env` to change settings (set DEV_FAKE to undefined for real mode).
async function startServer(env = {}) {
    const port = await freePort();
    const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "jukenuke-test-"));

    const fullEnv = {
        ...process.env,
        PORT: String(port),
        JUKENUKE_PIN: "1234",
        JUKENUKE_DATA_DIR: dataDir,
        JUKENUKE_ADD_COOLDOWN_MS: "0",
        DEV_FAKE: "1",
        ...env,
    };

    Object.keys(fullEnv).forEach(
        (k) => fullEnv[k] === undefined && delete fullEnv[k],
    );

    const child = spawn(process.execPath, ["server.js"], {
        cwd: ROOT,
        env: fullEnv,
    });

    let output = "";

    child.stdout.on("data", (d) => (output += d));
    child.stderr.on("data", (d) => (output += d));

    await new Promise((resolve, reject) => {
        const timer = setTimeout(
            () => reject(new Error("server did not start:\n" + output)),
            8000,
        );

        const check = () => {
            if (output.includes("Jukenuke running")) {
                clearTimeout(timer);
                resolve();
            }
        };

        child.stdout.on("data", check);
        child.on("exit", (code) => {
            clearTimeout(timer);
            reject(new Error(`server exited early (${code}):\n${output}`));
        });
    });

    const url = `http://127.0.0.1:${port}`;

    return {
        url,
        dataDir,
        output: () => output,
        stop: () => {
            child.kill();
            fs.rmSync(dataDir, { recursive: true, force: true });
        },
        get: (p) => fetch(url + p).then((r) => r.json()),
        post: async (p, body) => {
            const res = await fetch(url + p, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body || {}),
            });

            return {
                status: res.status,
                body: await res.json().catch(() => ({})),
            };
        },
    };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitFor(fn, timeoutMs = 5000, stepMs = 50) {
    const end = Date.now() + timeoutMs;

    while (Date.now() < end) {
        const value = await fn();
        if (value) return value;
        await sleep(stepMs);
    }

    throw new Error("waitFor timed out");
}

module.exports = { startServer, sleep, waitFor, ROOT };
