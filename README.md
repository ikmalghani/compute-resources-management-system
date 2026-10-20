# CReMS

CReMS (Compute Resources Management System) is a compute control plane. An administrator signs in, creates accounts, and assigns each account a workspace. A workspace is its own Docker container: the home directory is `/home/<username>`, and the shell prompt is `<username>@crems-<slug>~:$`. The administrator sets the container's CPU and memory limits. A GPU is not attached all the time. Someone requests one, a free GPU is attached, and it returns to the pool after the next GPU command finishes.

## Run

```bash
docker compose up --build
```

Open http://localhost:3000.

Compose starts three services:

- `db` is PostgreSQL 16. It stores accounts, workspaces, the GPU pool, and activity.
- `workspace-image` builds `crems-workspace:latest` and exits. Every workspace container is created from that image.
- `app` is the Next.js control plane. It mounts the host Docker socket so it can create and limit those containers.

The socket is root-equivalent on the host. Run this only where the administrators are trusted. Copy `.env.example` to `.env`, set `AUTH_SECRET` to a long random string, and change the database password before using it beyond one machine. Do not put an administrator password in `.env` or Compose.

## First administrator

The first visit to http://localhost:3000 opens a setup page. Choose a name, username, and password. That password is hashed before it is stored, then you are signed in. The setup page closes after an administrator exists.

Later accounts are created in the dashboard. CReMS generates their password, shows it once, and stores only the hash. That person must replace the password at the next sign-in. An administrator can rotate a password, which issues a new one-time password, and cannot view the current password.

## Publish and deploy

Build and push both images from a machine with Docker Hub access:

```bash
cp .env.example .env
# Set AUTH_SECRET, CREMS_APP_IMAGE=youruser/crems:latest
# and CREMS_WORKSPACE_IMAGE=youruser/crems-workspace:latest
docker compose build
docker compose push
```

On the host, clone this repository, copy `.env.example` to `.env`, set the same image names and a new `AUTH_SECRET`, then pull and run without rebuilding:

```bash
docker compose pull
docker compose up -d --no-build
```

Open the app and create the administrator in the browser.

## What people can do

An administrator can create, edit, suspend, and delete accounts, and can create, edit, start, stop, and delete workspaces. Deleting an account requires its workspaces to be reassigned or deleted first.

A member sees only the workspaces assigned to them. On a workspace they can:

- Browse `/home/<username>`, and create, upload, rename, edit, and delete files there.
- Open **Terminal** in a new tab. The workspace user is in the `sudo` group and can run `sudo` without a password.
- Open **code-server** in a new tab, on that same home directory.
- Choose **Request GPU**. A free GPU attaches immediately. If every GPU is busy, the workspace waits in the queue.

## CPU, memory, and GPUs

CPU and memory are Docker limits set on the workspace. Changing them updates the running container.

An administrator opens **GPU Scheduler** and chooses **Scan available GPUs**. The host is probed with `nvidia-smi`. Each found device can be added to the pool or left out. A free GPU can still be removed from the scheduler.

A command such as `nvidia-smi` does not attach a GPU by itself. The shell answers: "This operation needs a GPU. Please request one." After **Request GPU**, the next command that needs a GPU runs with it attached, and the GPU is released when that command exits. A queued request attaches when a GPU becomes free.

If the NVIDIA runtime is not available, the same queue still runs and the container receives a simulated GPU. `nvidia-smi` then reports the reservation instead of a physical device.

## Configuration

Compose reads `.env` next to `docker-compose.yml` for `AUTH_SECRET`, the database password, and optional Docker Hub image names. The app container receives `DATABASE_URL`, `AUTH_SECRET`, and `WORKSPACE_IMAGE` from Compose. The Docker socket path is fixed in the app. `.env.example` also has a host `DATABASE_URL` for running the app outside Compose.

## Seed data

On startup the app runs `scripts/seed.ts`. That script does not create an administrator and does not add GPUs to the pool.

Demo users (`bob`, `ada`) and sample workspaces are created only when `SEED_DEMO` is `true` and the workspace table is empty. Compose does not set that variable, so demo data is off by default. To enable it, add `SEED_DEMO: "true"` to the `app` service in `docker-compose.yml`.

To skip seeding entirely, comment out these lines in `docker/start.sh`:

```sh
echo "Seeding accounts and GPU pool..."
npx tsx scripts/seed.ts
```

Clearing `SEED_DEMO` does not delete rows that were already inserted. Remove them in Postgres, or reset the database volume with `docker compose down -v`.
