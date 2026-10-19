# MYSPACE

MYSPACE is a compute control plane. An administrator signs in, creates accounts, and assigns each account a workspace. A workspace is its own Docker container: the home directory is `/home/<username>`, and the shell prompt is `<username>@myspace-<slug>~:$`. The administrator sets the container's CPU and memory limits. A GPU is not attached all the time. Someone requests one, a free GPU is attached, and it returns to the pool after the next GPU command finishes.

## Run

```bash
docker compose up --build
```

Open http://localhost:3000.

Compose starts three services:

- `db` is PostgreSQL 16. It stores accounts, workspaces, the GPU pool, and activity.
- `workspace-image` builds `myspace-workspace:latest` and exits. Every workspace container is created from that image.
- `app` is the Next.js control plane. It mounts the host Docker socket so it can create and limit those containers.

The socket is root-equivalent on the host. Run this only where the administrators are trusted. Change `AUTH_SECRET` in `docker-compose.yml`, and the database password, before using it beyond one machine.

## First administrator

Compose does not create an administrator. Insert one after the database is up.

Hash a password:

```bash
docker exec myspace-app-1 node -e 'const bcrypt=require("bcryptjs"); bcrypt.hash(process.argv[1], 10).then((hash) => console.log(hash))' 'choose-a-password'
```

Open the database and insert the row. Paste the hash in place of `<paste-hash>`. The hash contains `$` characters, so keep it inside single quotes.

```bash
docker exec -it myspace-db-1 psql -U myspace -d myspace
```

```sql
INSERT INTO "User" (id, username, name, "passwordHash", "mustChangePassword", role, status, "createdAt", "updatedAt")
VALUES ('admin', 'admin', 'Admin', '<paste-hash>', false, 'ADMIN', 'ACTIVE', NOW(), NOW());
```

Sign in with that username and password. Later accounts are created in the dashboard. MYSPACE generates their password, shows it once, and stores only the hash. That person must replace the password at the next sign-in. An administrator can rotate a password, which issues a new one-time password, and cannot view the current password.

## What people can do

An administrator can create, edit, suspend, and delete accounts, and can create, edit, start, stop, and delete workspaces. Deleting an account requires its workspaces to be reassigned or deleted first.

A member sees only the workspaces assigned to them. On a workspace they can:

- Browse `/home/<username>`, and create, upload, rename, edit, and delete files there.
- Open **Terminal** in a new tab. The workspace user is in the `sudo` group and can run `sudo` without a password.
- Open **code-server** in a new tab, on that same home directory.
- Choose **Request GPU**. A free GPU attaches immediately. If every GPU is busy, the workspace waits in the queue.

## CPU, memory, and GPUs

CPU and memory are Docker limits set on the workspace. Changing them updates the running container.

When the GPU pool is empty, startup runs `nvidia-smi` and registers each GPU it finds, using that GPU's index, name, and memory. An administrator can still add or remove a free GPU from the scheduler.

A command such as `nvidia-smi` does not attach a GPU by itself. The shell answers: "This operation needs a GPU. Please request one." After **Request GPU**, the next command that needs a GPU runs with it attached, and the GPU is released when that command exits. A queued request attaches when a GPU becomes free.

If the NVIDIA runtime is not available, the same queue still runs and the container receives a simulated GPU. `nvidia-smi` then reports the reservation instead of a physical device.

## Configuration

`docker-compose.yml` sets `DATABASE_URL` and `AUTH_SECRET`. The workspace image, its build context, and the Docker socket path are fixed in the app. `.env.example` is only for running the app outside Compose.
