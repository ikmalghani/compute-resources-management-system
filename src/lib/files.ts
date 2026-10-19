import { execCommand, execStdin } from "@/lib/docker";
import { logActivity } from "@/lib/activity";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/errors";
import type { Actor } from "@/lib/queries";

const TEXT_LIMIT = 512 * 1024;
const UPLOAD_LIMIT = 8 * 1024 * 1024;

export type WorkspaceFile = {
  name: string;
  path: string;
  type: "dir" | "file";
  size: number;
};

function shQuote(value: string) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function relativePath(input: string | null) {
  const value = (input || "").replace(/\\/g, "/").trim();
  if (!value || value === ".") return "";
  if (value.startsWith("/") || value.includes("\0")) {
    throw new HttpError(400, "That path is outside the workspace home");
  }
  const parts = value.split("/");
  if (parts.some((part) => !part || part === "." || part === "..")) {
    throw new HttpError(400, "That path is outside the workspace home");
  }
  return parts.join("/");
}

function entryName(input: string) {
  const value = input.trim();
  if (
    !value ||
    value.length > 255 ||
    value === "." ||
    value === ".." ||
    /[/\\\u0000-\u001f]/.test(value)
  ) {
    throw new HttpError(400, "Use a name without slashes");
  }
  return value;
}

function parentOf(relative: string) {
  const index = relative.lastIndexOf("/");
  if (index === -1) return { parent: "", name: relative };
  return { parent: relative.slice(0, index), name: relative.slice(index + 1) };
}

function joinPath(parent: string, name: string) {
  return parent ? `${parent}/${name}` : name;
}

async function workspaceHome(actor: Actor, workspaceId: string) {
  const workspace = await prisma.workspace.findUnique({
    where: { id: workspaceId },
    include: { owner: true },
  });
  if (!workspace) throw new HttpError(404, "Workspace not found");
  if (actor.role !== "ADMIN" && workspace.ownerId !== actor.id) {
    throw new HttpError(403, "This workspace is assigned to another account");
  }
  if (!workspace.owner || !workspace.containerId || workspace.status !== "RUNNING") {
    throw new HttpError(400, "The workspace container is not running");
  }
  return {
    containerId: workspace.containerId,
    username: workspace.owner.username,
    home: `/home/${workspace.owner.username}`,
    workspaceName: workspace.name,
  };
}

async function record(actor: Actor, workspaceName: string, action: string, detail: string) {
  await logActivity({
    actorId: actor.id,
    actorName: actor.name,
    action,
    targetType: "workspace",
    targetLabel: workspaceName,
    detail,
  });
}

function place(home: string, parent: string, name: string) {
  const parentPath = parent ? `${home}/${parent}` : home;
  return `
home=$(realpath -- ${shQuote(home)}) || { printf '%s\\n' NOTDIR; exit 0; }
parent=$(realpath -- ${shQuote(parentPath)}) || { printf '%s\\n' NOTDIR; exit 0; }
case "$parent" in
  "$home"|"$home"/*) ;;
  *) printf '%s\\n' OUTSIDE; exit 0 ;;
esac
name=${shQuote(name)}
dest="$parent/$name"
`;
}

function statusMessage(line: string) {
  const messages: Record<string, string> = {
    OUTSIDE: "That path is outside the workspace home",
    NOTDIR: "That folder is not in the workspace home",
    ISDIR: "That path is a folder",
    MISSING: "That item is not in the workspace home",
    EXISTS: "That name is already in use",
    SYMLINK: "That path is a link, so it was left unchanged",
  };
  return messages[line.trim()] || "";
}

async function runScript(
  containerId: string,
  username: string,
  home: string,
  script: string,
  input?: Buffer,
) {
  const result = input
    ? await execStdin(containerId, script, username, input, 20000, home)
    : await execCommand(containerId, script, username, 8000, home, 16000, true);
  const line = (result.stdout.split("\n")[0] || "").trim();
  const known = statusMessage(line);
  if (known) throw new HttpError(400, known);
  if (!line.startsWith("OK")) {
    throw new HttpError(400, result.stderr.trim() || "Could not update that item");
  }
  return line;
}

function guard(home: string, relative: string) {
  const target = relative ? `${home}/${relative}` : home;
  return `
home=$(realpath -- ${shQuote(home)})
target=$(realpath -- ${shQuote(target)})
case "$target" in
  "$home"|"$home"/*) ;;
  *) printf '%s\\n' OUTSIDE; exit 0 ;;
esac
`;
}

export async function listWorkspaceFiles(actor: Actor, workspaceId: string, rawPath: string | null) {
  const relative = relativePath(rawPath);
  const { containerId, username, home } = await workspaceHome(actor, workspaceId);
  const result = await execCommand(
    containerId,
    `${guard(home, relative)}
if [ ! -d "$target" ]; then printf '%s\\n' NOTDIR; exit 0; fi
find "$target" -mindepth 1 -maxdepth 1 -printf '%y\\t%Y\\t%s\\t%f\\n' || true
`,
    username,
    8000,
    home,
    200000,
    true,
  );
  if (result.stdout.startsWith("OUTSIDE") || result.stdout.startsWith("NOTDIR")) {
    throw new HttpError(400, "That path is outside the workspace home");
  }
  if (result.exitCode !== 0 && !result.stdout.trim()) {
    throw new HttpError(400, result.stderr.trim() || "Could not list that folder");
  }

  const entries: WorkspaceFile[] = [];
  for (const line of result.stdout.split("\n")) {
    if (!line.trim()) continue;
    const [kind, followed, sizeText, ...nameParts] = line.split("\t");
    const name = nameParts.join("\t");
    if (!name || name === "." || name === "..") continue;
    const followedDir = kind === "d" || (kind === "l" && followed === "d");
    entries.push({
      name,
      path: relative ? `${relative}/${name}` : name,
      type: followedDir ? "dir" : "file",
      size: Number(sizeText) || 0,
    });
  }
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === "dir" ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return { path: relative, home, entries: entries.slice(0, 500) };
}

export async function readWorkspaceFile(actor: Actor, workspaceId: string, rawPath: string | null) {
  const relative = relativePath(rawPath);
  if (!relative) throw new HttpError(400, "Choose a file");
  const { containerId, username, home } = await workspaceHome(actor, workspaceId);
  const result = await execCommand(
    containerId,
    `${guard(home, relative)}
if [ -d "$target" ]; then printf '%s\\n' ISDIR; exit 0; fi
if [ ! -f "$target" ]; then printf '%s\\n' MISSING; exit 0; fi
size=$(wc -c < "$target" | tr -d ' ')
raw=$(head -c 8192 "$target" | wc -c | tr -d ' ')
plain=$(head -c 8192 "$target" | tr -d '\\0' | wc -c | tr -d ' ')
if [ "$raw" != "$plain" ]; then
  printf 'BIN %s\\n' "$size"
  exit 0
fi
if [ "$size" -gt ${TEXT_LIMIT} ]; then
  printf 'PART %s\\n' "$size"
  head -c 8192 "$target" | base64 -w 0
  printf '\\n'
  exit 0
fi
printf 'FULL %s\\n' "$size"
base64 -w 0 "$target"
printf '\\n'
`,
    username,
    8000,
    home,
    900000,
    true,
  );
  const stdout = result.stdout;
  const newline = stdout.indexOf("\n");
  const header = (newline === -1 ? stdout : stdout.slice(0, newline)).trim();
  const payload = newline === -1 ? "" : stdout.slice(newline + 1).replace(/\s/g, "");
  if (header === "OUTSIDE" || header === "ISDIR" || header === "MISSING") {
    throw new HttpError(400, "That file is not in the workspace home");
  }
  const [kind, sizeText] = header.split(" ");
  const size = Number(sizeText) || 0;
  if (kind === "BIN") {
    return { path: relative, size, text: "", binary: true, truncated: false };
  }
  const bytes = Buffer.from(payload, "base64");
  let text = "";
  let binary = false;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    binary = true;
  }
  if (text.includes("\0")) binary = true;
  return {
    path: relative,
    size,
    text: binary ? "" : text,
    binary,
    truncated: kind === "PART",
  };
}

export async function createWorkspaceFolder(actor: Actor, workspaceId: string, rawParent: string | null, rawName: string) {
  const parent = relativePath(rawParent);
  const name = entryName(rawName);
  const located = await workspaceHome(actor, workspaceId);
  await runScript(
    located.containerId,
    located.username,
    located.home,
    `${place(located.home, parent, name)}
if [ -e "$dest" ] || [ -L "$dest" ]; then printf '%s\\n' EXISTS; exit 0; fi
mkdir -- "$dest"
printf '%s\\n' OK
`,
  );
  const path = joinPath(parent, name);
  await record(actor, located.workspaceName, "file.mkdir", `Created folder ${path || name} in ${located.workspaceName}.`);
  return { path };
}

export async function createWorkspaceFile(actor: Actor, workspaceId: string, rawParent: string | null, rawName: string) {
  const parent = relativePath(rawParent);
  const name = entryName(rawName);
  const located = await workspaceHome(actor, workspaceId);
  await runScript(
    located.containerId,
    located.username,
    located.home,
    `${place(located.home, parent, name)}
if [ -e "$dest" ] || [ -L "$dest" ]; then printf '%s\\n' EXISTS; exit 0; fi
: > "$dest"
printf '%s\\n' OK
`,
  );
  const path = joinPath(parent, name);
  await record(actor, located.workspaceName, "file.create", `Created file ${path} in ${located.workspaceName}.`);
  return { path };
}

export async function writeWorkspaceFile(actor: Actor, workspaceId: string, rawPath: string | null, content: string) {
  const relative = relativePath(rawPath);
  if (!relative) throw new HttpError(400, "Choose a file");
  if (Buffer.byteLength(content) > TEXT_LIMIT) {
    throw new HttpError(400, "That file is larger than 512 KB");
  }
  const { parent, name } = parentOf(relative);
  const located = await workspaceHome(actor, workspaceId);
  const line = await runScript(
    located.containerId,
    located.username,
    located.home,
    `${place(located.home, parent, name)}
if [ -L "$dest" ]; then printf '%s\\n' SYMLINK; exit 0; fi
if [ -d "$dest" ]; then printf '%s\\n' ISDIR; exit 0; fi
tmp=$(mktemp "$parent/.myspace.XXXXXX") || { printf '%s\\n' FAIL; exit 0; }
cat > "$tmp" || { rm -f -- "$tmp"; printf '%s\\n' FAIL; exit 0; }
mv -f -- "$tmp" "$dest"
size=$(wc -c < "$dest" | tr -d ' ')
printf 'OK %s\\n' "$size"
`,
    Buffer.from(content, "utf8"),
  );
  await record(actor, located.workspaceName, "file.write", `Saved ${relative} in ${located.workspaceName}.`);
  return { path: relative, size: Number(line.slice(3)) || Buffer.byteLength(content) };
}

export async function uploadWorkspaceFile(
  actor: Actor,
  workspaceId: string,
  rawParent: string | null,
  rawName: string,
  bytes: Buffer,
) {
  if (bytes.length > UPLOAD_LIMIT) throw new HttpError(400, "Upload a file of 8 MB or less");
  const parent = relativePath(rawParent);
  const name = entryName(rawName.split(/[/\\]/).pop() || "");
  const located = await workspaceHome(actor, workspaceId);
  const line = await runScript(
    located.containerId,
    located.username,
    located.home,
    `${place(located.home, parent, name)}
if [ -L "$dest" ]; then printf '%s\\n' SYMLINK; exit 0; fi
if [ -d "$dest" ]; then printf '%s\\n' ISDIR; exit 0; fi
tmp=$(mktemp "$parent/.myspace.XXXXXX") || { printf '%s\\n' FAIL; exit 0; }
cat > "$tmp" || { rm -f -- "$tmp"; printf '%s\\n' FAIL; exit 0; }
mv -f -- "$tmp" "$dest"
size=$(wc -c < "$dest" | tr -d ' ')
printf 'OK %s\\n' "$size"
`,
    bytes,
  );
  const path = joinPath(parent, name);
  await record(actor, located.workspaceName, "file.upload", `Uploaded ${path} in ${located.workspaceName}.`);
  return { path, size: Number(line.slice(3)) || bytes.length };
}

export async function renameWorkspaceEntry(actor: Actor, workspaceId: string, rawPath: string | null, rawName: string) {
  const relative = relativePath(rawPath);
  if (!relative) throw new HttpError(400, "Choose a file or folder");
  const name = entryName(rawName);
  const { parent, name: current } = parentOf(relative);
  if (name === current) return { path: relative };
  const located = await workspaceHome(actor, workspaceId);
  await runScript(
    located.containerId,
    located.username,
    located.home,
    `${place(located.home, parent, current)}
source="$dest"
name=${shQuote(name)}
dest="$parent/$name"
if [ ! -e "$source" ] && [ ! -L "$source" ]; then printf '%s\\n' MISSING; exit 0; fi
if [ -e "$dest" ] || [ -L "$dest" ]; then printf '%s\\n' EXISTS; exit 0; fi
mv -f -- "$source" "$dest"
printf '%s\\n' OK
`,
  );
  const path = joinPath(parent, name);
  await record(actor, located.workspaceName, "file.rename", `Renamed ${relative} to ${path} in ${located.workspaceName}.`);
  return { path };
}

export async function deleteWorkspaceEntry(actor: Actor, workspaceId: string, rawPath: string | null) {
  const relative = relativePath(rawPath);
  if (!relative) throw new HttpError(400, "Choose a file or folder");
  const { parent, name } = parentOf(relative);
  const located = await workspaceHome(actor, workspaceId);
  await runScript(
    located.containerId,
    located.username,
    located.home,
    `${place(located.home, parent, name)}
if [ ! -e "$dest" ] && [ ! -L "$dest" ]; then printf '%s\\n' MISSING; exit 0; fi
if [ -L "$dest" ]; then rm -f -- "$dest"; printf '%s\\n' OK; exit 0; fi
if [ -d "$dest" ]; then
  resolved=$(realpath -- "$dest") || { printf '%s\\n' MISSING; exit 0; }
  case "$resolved" in
    "$home"|"$home"/*) ;;
    *) printf '%s\\n' OUTSIDE; exit 0 ;;
  esac
  if [ "$resolved" = "$home" ]; then printf '%s\\n' OUTSIDE; exit 0; fi
  rm -rf -- "$dest"
  printf '%s\\n' OK
  exit 0
fi
resolved=$(realpath -- "$dest") || { printf '%s\\n' MISSING; exit 0; }
case "$resolved" in
  "$home"|"$home"/*) ;;
  *) printf '%s\\n' OUTSIDE; exit 0 ;;
esac
rm -f -- "$dest"
printf '%s\\n' OK
`,
  );
  await record(actor, located.workspaceName, "file.delete", `Deleted ${relative} from ${located.workspaceName}.`);
  return { path: relative };
}
