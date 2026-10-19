import Docker from "dockerode";
import { PassThrough } from "stream";
import { containerName, promptHost, volumeName } from "@/lib/prompt";

const docker = new Docker({ socketPath: "/var/run/docker.sock" });

export const WORKSPACE_IMAGE = "myspace-workspace:latest";
const WORKSPACE_CONTEXT = "/app/workspace";

export type GpuAttachMode = "none" | "nvidia" | "simulated";

export async function ensureWorkspaceImage() {
  try {
    await docker.getImage(WORKSPACE_IMAGE).inspect();
    return;
  } catch {
    const context = WORKSPACE_CONTEXT;
    const stream = await docker.buildImage(
      { context, src: ["Dockerfile", "entrypoint.sh", "nvidia-smi-sim"] },
      { t: WORKSPACE_IMAGE },
    );
    await new Promise<void>((resolve, reject) => {
      docker.modem.followProgress(stream, (err: Error | null) => {
        if (err) reject(err);
        else resolve();
      });
    });
  }
}

export type DetectedGpu = { index: number; name: string; memoryMb: number };

export async function detectNvidiaGpus(): Promise<DetectedGpu[]> {
  let container: Docker.Container | undefined;
  try {
    container = await docker.createContainer({
      Image: WORKSPACE_IMAGE,
      Entrypoint: ["nvidia-smi"],
      Cmd: ["--query-gpu=index,name,memory.total", "--format=csv,noheader,nounits"],
      Tty: true,
      HostConfig: {
        DeviceRequests: [{ Driver: "nvidia", Count: -1, Capabilities: [["gpu"]] }],
      },
    });
    await container.start();
    const status = await Promise.race([
      container.wait(),
      new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("GPU detection timed out")), 15000);
      }),
    ]);
    const logs = await container.logs({ stdout: true, stderr: true });
    const text = Buffer.isBuffer(logs) ? logs.toString("utf8") : String(logs);
    if (status.StatusCode !== 0) return [];
    return text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(",").map((part) => part.trim());
        const index = Number(parts[0]);
        const memoryMb = Number(parts[parts.length - 1]);
        const name = parts.slice(1, -1).join(", ");
        if (!Number.isInteger(index) || !name || !Number.isFinite(memoryMb)) return null;
        return { index, name, memoryMb: Math.round(memoryMb) };
      })
      .filter((gpu): gpu is DetectedGpu => gpu !== null);
  } catch (error) {
    console.warn(`[gpu] Could not detect host GPUs: ${error instanceof Error ? error.message : error}`);
    return [];
  } finally {
    if (container) {
      try {
        await container.remove({ force: true });
      } catch {
        // The probe container is already gone.
      }
    }
  }
}

async function ensureVolume(name: string) {
  try {
    await docker.getVolume(name).inspect();
  } catch {
    await docker.createVolume({ Name: name });
  }
}

async function removeNamedContainer(name: string) {
  const listed = await docker.listContainers({
    all: true,
    filters: { name: [name] },
  });
  for (const info of listed) {
    const names = info.Names.map((item) => item.replace(/^\//, ""));
    if (!names.includes(name)) continue;
    const container = docker.getContainer(info.Id);
    try {
      await container.stop({ t: 2 });
    } catch {
      // The container is already stopped.
    }
    await container.remove({ force: true });
  }
}

export async function provisionContainer(opts: {
  workspaceId: string;
  slug: string;
  username: string;
  cpu: number;
  memoryMb: number;
  gpuIndex: number | null;
  gpuMode: GpuAttachMode;
}) {
  await ensureWorkspaceImage();
  const name = containerName(opts.slug);
  await ensureVolume(volumeName(opts.slug));
  await removeNamedContainer(name);

  const memory = Math.round(opts.memoryMb * 1024 * 1024);
  const env = [
    `WORKSPACE_USER=${opts.username}`,
    `WORKSPACE_PROMPT_HOST=${promptHost(opts.slug)}`,
    `WORKSPACE_CPU=${opts.cpu}`,
    `WORKSPACE_RAM_MB=${opts.memoryMb}`,
    `MYSPACE_WORKSPACE_ID=${opts.workspaceId}`,
  ];
  if (opts.gpuIndex !== null && opts.gpuMode !== "none") {
    env.push(`MYSPACE_GPU_INDEX=${opts.gpuIndex}`);
    env.push(`MYSPACE_GPU_MODE=${opts.gpuMode}`);
  }

  const hostConfig: Docker.HostConfig = {
    Memory: memory,
    MemorySwap: memory,
    NanoCpus: Math.round(opts.cpu * 1e9),
    Binds: [`${volumeName(opts.slug)}:/home/${opts.username}`],
    RestartPolicy: { Name: "unless-stopped" },
    Init: true,
    PidsLimit: 1024,
    NetworkMode: "myspace_default",
    PortBindings: {
      "8080/tcp": [{ HostIp: "127.0.0.1", HostPort: "" }],
    },
  };

  if (opts.gpuIndex !== null && opts.gpuMode === "nvidia") {
    hostConfig.DeviceRequests = [
      {
        Driver: "nvidia",
        DeviceIDs: [String(opts.gpuIndex)],
        Capabilities: [["gpu"]],
      },
    ];
  }

  const container = await docker.createContainer({
    name,
    Image: WORKSPACE_IMAGE,
    Env: env,
    Hostname: promptHost(opts.slug).slice(0, 63),
    Labels: {
      "myspace.managed": "true",
      "myspace.slug": opts.slug,
      "myspace.user": opts.username,
    },
    ExposedPorts: { "8080/tcp": {} },
    HostConfig: hostConfig,
    User: "root",
  });
  await container.start();
  const info = await container.inspect();
  await waitForWorkspaceUser(info.Id, opts.username);
  return { id: info.Id, name };
}

async function waitForWorkspaceUser(containerId: string, username: string) {
  const deadline = Date.now() + 15000;
  let last = "workspace user was not created";
  while (Date.now() < deadline) {
    try {
      const result = await execCommand(containerId, `id ${username}`, "root", 5000, "/");
      if (result.exitCode === 0) return;
      last = result.stderr || result.stdout || last;
    } catch (error) {
      last = error instanceof Error ? error.message : last;
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(last);
}

export async function updateContainerLimits(containerId: string, cpu: number, memoryMb: number) {
  const memory = Math.round(memoryMb * 1024 * 1024);
  await docker.getContainer(containerId).update({
    Memory: memory,
    MemorySwap: memory,
    NanoCpus: Math.round(cpu * 1e9),
  });
}

export async function stopContainer(containerId: string) {
  try {
    await docker.getContainer(containerId).stop({ t: 3 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/is not running|already stopped|no such container/i.test(message)) throw error;
  }
}

export async function removeWorkspaceRuntime(slug: string) {
  await removeNamedContainer(containerName(slug));
  try {
    await docker.getVolume(volumeName(slug)).remove();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/no such volume|not found/i.test(message)) throw error;
  }
}

export async function inspectCodePort(containerId: string) {
  try {
    const info = await docker.getContainer(containerId).inspect();
    const binding = info.NetworkSettings.Ports?.["8080/tcp"]?.[0];
    return binding?.HostPort ? Number(binding.HostPort) : null;
  } catch {
    return null;
  }
}

export async function inspectLimits(containerId: string) {
  const info = await docker.getContainer(containerId).inspect();
  return {
    running: Boolean(info.State.Running),
    cpu: (info.HostConfig.NanoCpus || 0) / 1e9,
    memoryMb: Math.round((info.HostConfig.Memory || 0) / (1024 * 1024)),
  };
}

export async function execCommand(
  containerId: string,
  command: string,
  username: string,
  timeoutMs = 20000,
  workingDir?: string,
  maxBytes = 12000,
  fromStart = false,
) {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ["bash", "-lc", command],
    User: username,
    WorkingDir: workingDir || (username === "root" ? "/" : `/home/${username}`),
    AttachStdout: true,
    AttachStderr: true,
  });
  const stream = await exec.start({ hijack: true, stdin: false });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(stream, stdout, stderr);

  let out = "";
  let err = "";
  stdout.on("data", (chunk) => {
    out += chunk.toString();
  });
  stderr.on("data", (chunk) => {
    err += chunk.toString();
  });

  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      new Promise<void>((resolve, reject) => {
        stream.on("end", () => resolve());
        stream.on("error", reject);
      }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          stream.destroy();
          reject(new Error("Command timed out"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  const inspected = await exec.inspect();
  return {
    stdout: fromStart ? out.slice(0, maxBytes) : out.slice(-maxBytes),
    stderr: err.slice(-4000),
    exitCode: inspected.ExitCode ?? 1,
  };
}

export async function execStdin(
  containerId: string,
  command: string,
  username: string,
  input: Buffer,
  timeoutMs = 20000,
  workingDir?: string,
) {
  const container = docker.getContainer(containerId);
  const exec = await container.exec({
    Cmd: ["bash", "-lc", command],
    User: username,
    WorkingDir: workingDir || (username === "root" ? "/" : `/home/${username}`),
    AttachStdout: true,
    AttachStderr: true,
    AttachStdin: true,
  });
  const stream = await exec.start({ hijack: true, stdin: true });
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  docker.modem.demuxStream(stream, stdout, stderr);

  let out = "";
  let err = "";
  stdout.on("data", (chunk) => {
    out += chunk.toString();
  });
  stderr.on("data", (chunk) => {
    err += chunk.toString();
  });

  const finished = new Promise<void>((resolve) => {
    stream.on("end", () => resolve());
    stream.on("error", () => resolve());
  });

  await new Promise<void>((resolve) => {
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      resolve();
    };
    stream.on("error", done);
    const wrote = stream.write(input, done);
    if (wrote) done();
    else stream.once("drain", done);
  });
  stream.end();

  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      finished,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          stream.destroy();
          reject(new Error("Command timed out"));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }

  const inspected = await exec.inspect();
  return {
    stdout: out.slice(0, 16000),
    stderr: err.slice(-4000),
    exitCode: inspected.ExitCode ?? 1,
  };
}
