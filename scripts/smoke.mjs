const base = process.env.BASE_URL || "http://127.0.0.1:3000";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function login(username, password) {
  const response = await fetch(`${base}/api/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  const data = await response.json();
  const cookie = (response.headers.getSetCookie?.() || []).map((item) => item.split(";")[0]).join("; ");
  return { status: response.status, cookie, data };
}

async function call(cookie, path, init = {}) {
  const response = await fetch(`${base}${path}`, {
    ...init,
    headers: { "content-type": "application/json", cookie, ...(init.headers || {}) },
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const admin = await login("admin", "admin123");
  assert(admin.status === 200, `admin login failed ${admin.status}`);
  const bob = await login("bob", "bobpass1");
  assert(bob.status === 200, `bob login failed ${bob.status}`);

  const forbiddenUser = await call(bob.cookie, "/api/users", {
    method: "POST",
    body: JSON.stringify({ name: "Nope", username: "nopeuser", role: "USER" }),
  });
  assert(forbiddenUser.status === 403, `member created a user (${forbiddenUser.status})`);

  const forbiddenWorkspace = await call(bob.cookie, "/api/workspaces", {
    method: "POST",
    body: JSON.stringify({ name: "Nope", ownerId: bob.data.user.id, cpu: 1, memoryMb: 512 }),
  });
  assert(forbiddenWorkspace.status === 403, `member created a workspace (${forbiddenWorkspace.status})`);

  const created = await call(admin.cookie, "/api/users", {
    method: "POST",
    body: JSON.stringify({ name: "Charlie Quinn", username: "charlie", role: "USER" }),
  });
  assert(created.status === 201, `create user failed ${created.status} ${JSON.stringify(created.data)}`);

  const revoked = await call(admin.cookie, `/api/users/${created.data.user.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "SUSPENDED" }),
  });
  assert(revoked.status === 200 && revoked.data.user.status === "SUSPENDED", "revoke failed");
  const temporaryPassword = created.data.temporaryPassword;
  assert(typeof temporaryPassword === "string" && temporaryPassword.length >= 8, "temporary password was not issued");
  const lockedOut = await login("charlie", temporaryPassword);
  assert(lockedOut.status === 401, "suspended user signed in");

  const granted = await call(admin.cookie, `/api/users/${created.data.user.id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: "ACTIVE" }),
  });
  assert(granted.status === 200 && granted.data.user.status === "ACTIVE", "grant failed");

  const workspace = await call(admin.cookie, "/api/workspaces", {
    method: "POST",
    body: JSON.stringify({
      name: "Limit Lab",
      description: "Used to verify CPU and memory enforcement.",
      ownerId: created.data.user.id,
      cpu: 1.5,
      memoryMb: 1024,
    }),
  });
  assert(workspace.status === 201, `workspace create failed ${workspace.status} ${JSON.stringify(workspace.data)}`);
  const ws = workspace.data.workspace;
  assert(ws.prompt === "charlie@myspace-limitlab~:$", `prompt was ${ws.prompt}`);
  assert(Math.abs(ws.enforced.cpu - 1.5) < 0.01, `cpu enforced ${ws.enforced?.cpu}`);
  assert(ws.enforced.memoryMb === 1024, `memory enforced ${ws.enforced?.memoryMb}`);

  const updated = await call(admin.cookie, `/api/workspaces/${ws.id}`, {
    method: "PATCH",
    body: JSON.stringify({ cpu: 0.5, memoryMb: 512 }),
  });
  assert(updated.status === 200, `update failed ${updated.status} ${JSON.stringify(updated.data)}`);
  assert(Math.abs(updated.data.workspace.enforced.cpu - 0.5) < 0.01, `updated cpu ${updated.data.workspace.enforced?.cpu}`);
  assert(updated.data.workspace.enforced.memoryMb === 512, `updated memory ${updated.data.workspace.enforced?.memoryMb}`);

  const charlie = await login("charlie", temporaryPassword);
  assert(charlie.status === 200 && charlie.data.user.mustChangePassword === true, "new user was not asked to change password");
  const blocked = await call(charlie.cookie, "/api/workspaces");
  assert(blocked.status === 403, "temporary session could use the dashboard");
  const changed = await call(charlie.cookie, "/api/auth/password", {
    method: "POST",
    body: JSON.stringify({ currentPassword: temporaryPassword, newPassword: "charliepass1" }),
  });
  assert(changed.status === 200 && changed.data.user.mustChangePassword === false, `password change failed ${changed.status}`);
  const charlieSession = await login("charlie", "charliepass1");
  assert(charlieSession.status === 200, "login with the new password failed");
  const exec = await call(charlie.cookie, `/api/workspaces/${ws.id}/exec`, {
    method: "POST",
    body: JSON.stringify({ command: 'printf %s "$PS1"; echo; whoami; pwd' }),
  });
  assert(exec.status === 200, `exec failed ${exec.status} ${JSON.stringify(exec.data)}`);
  assert(exec.data.stdout.includes("charlie@myspace-limitlab~:$"), `stdout prompt ${exec.data.stdout}`);
  assert(exec.data.stdout.includes("charlie"), `stdout user ${exec.data.stdout}`);
  assert(exec.data.stdout.includes("/home/charlie"), `stdout pwd ${exec.data.stdout}`);
  const needsGpu = await call(charlie.cookie, `/api/workspaces/${ws.id}/exec`, {
    method: "POST",
    body: JSON.stringify({ command: "nvidia-smi" }),
  });
  assert(needsGpu.status === 200 && String(needsGpu.data.stderr).includes("This operation needs a GPU"), `gpu command was not blocked ${JSON.stringify(needsGpu.data)}`);
  const beforeRequest = await call(admin.cookie, `/api/workspaces/${ws.id}`);
  assert(!beforeRequest.data.workspace.gpu, "GPU attached before it was requested");

  const otherExec = await call(bob.cookie, `/api/workspaces/${ws.id}/exec`, {
    method: "POST",
    body: JSON.stringify({ command: "whoami" }),
  });
  assert(otherExec.status === 403, "bob executed in charlie workspace");

  const spaces = await call(admin.cookie, "/api/workspaces");
  const byName = Object.fromEntries(spaces.data.workspaces.map((item) => [item.name, item]));
  const pool = await call(admin.cookie, "/api/gpu");
  const originalGpuIds = new Set(pool.data.gpus.map((gpu) => gpu.id));
  for (const index of [1, 2]) {
    if (!pool.data.gpus.some((gpu) => gpu.index === index)) {
      const added = await call(admin.cookie, "/api/gpu", {
        method: "POST",
        body: JSON.stringify({ name: `GPU ${index}`, memoryMb: 8192, index }),
      });
      assert(added.status === 201, `add gpu failed ${added.status} ${JSON.stringify(added.data)}`);
    }
  }
  for (const job of pool.data.jobs) {
    if (job.status === "QUEUED" || job.status === "RUNNING") {
      await call(admin.cookie, `/api/gpu/jobs/${job.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "cancel" }),
      });
    }
  }

  const stamp = Date.now();
  const titles = {
    bob: `Bob primary ${stamp}`,
    ada: `Ada primary ${stamp}`,
    follow: `Bob followup ${stamp}`,
    train: `Training primary ${stamp}`,
  };
  const hold = "sleep 25 && nvidia-smi";
  const first = await call(admin.cookie, "/api/gpu/jobs", {
    method: "POST",
    body: JSON.stringify({ workspaceId: byName["Workspace 1"].id, title: titles.bob, command: hold }),
  });
  const second = await call(admin.cookie, "/api/gpu/jobs", {
    method: "POST",
    body: JSON.stringify({ workspaceId: byName["Workspace 2"].id, title: titles.ada, command: hold }),
  });
  assert(first.status === 201 && second.status === 201, "primary jobs failed");

  let snapshot = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    snapshot = await call(admin.cookie, "/api/gpu");
    const running = snapshot.data.jobs.filter((job) => [titles.bob, titles.ada].includes(job.title) && job.status === "RUNNING");
    if (running.length === 2) break;
    await sleep(1000);
  }
  const runningTitles = snapshot.data.jobs.filter((job) => job.status === "RUNNING").map((job) => job.title);
  assert(runningTitles.includes(titles.bob) && runningTitles.includes(titles.ada), `primaries not running: ${JSON.stringify(snapshot.data.jobs.map((job) => [job.title, job.status, job.error]))}`);

  const queuedSame = await call(admin.cookie, "/api/gpu/jobs", {
    method: "POST",
    body: JSON.stringify({ workspaceId: byName["Workspace 1"].id, title: titles.follow, command: hold }),
  });
  assert(queuedSame.status === 201, "followup create failed");
  const afterFollow = await call(admin.cookie, "/api/gpu");
  const follow = afterFollow.data.jobs.find((job) => job.title === titles.follow);
  const free = afterFollow.data.gpus.filter((gpu) => gpu.status === "FREE");
  assert(follow.status === "QUEUED", `followup status ${follow.status}`);
  assert(free.length >= 1, "expected a free GPU while the same workspace was already running a job");

  const third = await call(admin.cookie, "/api/gpu/jobs", {
    method: "POST",
    body: JSON.stringify({ workspaceId: byName["Training Desk"].id, title: titles.train, command: hold }),
  });
  assert(third.status === 201, "training job failed");
  let training = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = await call(admin.cookie, "/api/gpu");
    training = current.data.jobs.find((job) => job.title === titles.train);
    const stillQueued = current.data.jobs.find((job) => job.title === titles.follow);
    if (training?.status === "RUNNING" && stillQueued?.status === "QUEUED") break;
    await sleep(1000);
  }
  assert(training?.status === "RUNNING", `training status ${training?.status} ${training?.error || ""}`);

  const bobJob = snapshot.data.jobs.find((job) => job.title === titles.bob);
  const released = await call(admin.cookie, `/api/gpu/jobs/${bobJob.id}`, {
    method: "POST",
    body: JSON.stringify({ action: "complete" }),
  });
  assert(released.status === 200, `release failed ${released.status} ${JSON.stringify(released.data)}`);

  let followup = null;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const current = await call(admin.cookie, "/api/gpu");
    followup = current.data.jobs.find((job) => job.title === titles.follow);
    if (followup && followup.status !== "QUEUED") break;
    await sleep(1000);
  }
  assert(followup?.status === "RUNNING" || followup?.status === "COMPLETED", `followup did not start (${followup?.status})`);

  const cleanup = await call(admin.cookie, "/api/gpu");
  for (const job of cleanup.data.jobs) {
    if (job.status === "QUEUED" || job.status === "RUNNING") {
      await call(admin.cookie, `/api/gpu/jobs/${job.id}`, {
        method: "POST",
        body: JSON.stringify({ action: "cancel" }),
      });
    }
  }
  const afterJobs = await call(admin.cookie, "/api/gpu");
  for (const gpu of afterJobs.data.gpus) {
    if (!originalGpuIds.has(gpu.id)) {
      const removed = await call(admin.cookie, `/api/gpu/${gpu.id}`, { method: "DELETE" });
      assert(removed.status === 200, `remove temporary gpu failed ${removed.status} ${JSON.stringify(removed.data)}`);
    }
  }
  await call(admin.cookie, `/api/workspaces/${ws.id}`, { method: "DELETE" });
  const rotated = await call(admin.cookie, `/api/users/${created.data.user.id}/password`, { method: "POST" });
  assert(rotated.status === 200 && typeof rotated.data.temporaryPassword === "string", "rotate did not issue a password");
  assert(rotated.data.temporaryPassword !== "charliepass1", "rotated password matched the previous one");
  const listed = await call(admin.cookie, "/api/users");
  const listedUser = listed.data.users.find((user) => user.id === created.data.user.id);
  assert(listedUser && !("password" in listedUser) && !("passwordHash" in listedUser), "account list exposed a password");
  const stale = await login("charlie", "charliepass1");
  assert(stale.status === 401, "old password still worked after rotation");
  await call(admin.cookie, `/api/users/${created.data.user.id}`, { method: "DELETE" });
  console.log("smoke ok");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
