import { createServer } from "http";
import { existsSync } from "fs";
import next from "next";
import httpProxy from "http-proxy";
import { PrismaClient } from "@prisma/client";
import Docker from "dockerode";
import { jwtVerify } from "jose";

const port = Number(process.env.PORT || 3000);
const hostname = process.env.HOSTNAME || "0.0.0.0";
const dev = process.env.NODE_ENV !== "production";
const SESSION_COOKIE = "crems_session";
const CODE_PATH = /^\/view\/code\/([^/]+)(?:\/(.*))?$/;

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();
const upgradeHandler = app.getUpgradeHandler();
const prisma = new PrismaClient();
const docker = new Docker({ socketPath: "/var/run/docker.sock" });
const proxy = httpProxy.createProxyServer({
  ws: true,
  xfwd: true,
  changeOrigin: true,
});

proxy.on("error", (error, _req, res) => {
  console.error("[code-proxy]", error.message);
  if (res && !res.headersSent && typeof res.writeHead === "function") {
    res.writeHead(502, { "Content-Type": "text/plain" });
    res.end("code-server proxy error");
  } else if (res && typeof res.destroy === "function") {
    res.destroy();
  }
});

function authSecret() {
  return new TextEncoder().encode(process.env.AUTH_SECRET || "dev-only-crems-auth-secret-change");
}

function readCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

async function readSession(req) {
  const token = readCookies(req)[SESSION_COOKIE];
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, authSecret());
    if (!payload.sub || payload.mcp === true) return null;
    const user = await prisma.user.findUnique({ where: { id: String(payload.sub) } });
    if (!user || user.status !== "ACTIVE" || user.mustChangePassword) return null;
    return user;
  } catch {
    return null;
  }
}

async function inspectCodePort(containerId) {
  try {
    const info = await docker.getContainer(containerId).inspect();
    const binding = info.NetworkSettings.Ports?.["8080/tcp"]?.[0];
    return binding?.HostPort ? Number(binding.HostPort) : null;
  } catch {
    return null;
  }
}

async function resolveCodeTarget(req, workspaceId) {
  const user = await readSession(req);
  if (!user) return { error: 401, message: "Sign in required" };
  const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId } });
  if (!workspace) return { error: 404, message: "Workspace not found" };
  if (user.role !== "ADMIN" && workspace.ownerId !== user.id) {
    return { error: 403, message: "This workspace is assigned to another account" };
  }
  if (workspace.status !== "RUNNING" || !workspace.containerId) {
    return { error: 409, message: "Workspace is not running" };
  }
  const codePort = await inspectCodePort(workspace.containerId);
  if (!codePort) return { error: 503, message: "code-server is unavailable" };
  // In Docker on crems_default use container DNS; on the host use the published loopback port.
  const inDocker = existsSync("/.dockerenv") || process.env.CODE_PROXY_DOCKER === "1";
  if (inDocker) {
    if (!workspace.containerName) return { error: 503, message: "code-server is unavailable" };
    return { target: `http://${workspace.containerName}:8080` };
  }
  return { target: `http://127.0.0.1:${codePort}` };
}

function sendText(res, status, message) {
  res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
  res.end(message);
}

await app.prepare();

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const match = url.pathname.match(CODE_PATH);
    if (!match) {
      await handle(req, res);
      return;
    }
    const resolved = await resolveCodeTarget(req, match[1]);
    if (resolved.error) {
      sendText(res, resolved.error, resolved.message);
      return;
    }
    proxy.web(req, res, { target: resolved.target });
  } catch (error) {
    console.error(error);
    if (!res.headersSent) sendText(res, 500, "Internal error");
  }
});

server.on("upgrade", async (req, socket, head) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);
    const match = url.pathname.match(CODE_PATH);
    if (!match) {
      await upgradeHandler(req, socket, head);
      return;
    }
    const resolved = await resolveCodeTarget(req, match[1]);
    if (resolved.error) {
      socket.write(`HTTP/1.1 ${resolved.error} ${resolved.message}\r\nConnection: close\r\n\r\n`);
      socket.destroy();
      return;
    }
    proxy.ws(req, socket, head, { target: resolved.target });
  } catch (error) {
    console.error(error);
    socket.destroy();
  }
});

server.listen(port, hostname, () => {
  console.log(`CReMS listening on http://${hostname}:${port}`);
});
