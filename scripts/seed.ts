import bcrypt from "bcryptjs";
import { detectNvidiaGpus } from "../src/lib/docker";
import { prisma } from "../src/lib/db";
import { createWorkspace } from "../src/lib/control";

async function main() {
  const administrators = await prisma.user.count({ where: { role: "ADMIN" } });
  if (administrators === 0) {
    console.log("No administrator yet. Insert one in the database before signing in.");
  }

  if ((await prisma.gpuDevice.count()) === 0) {
    const found = await detectNvidiaGpus();
    for (const gpu of found) {
      await prisma.gpuDevice.create({
        data: { index: gpu.index, name: gpu.name, memoryMb: gpu.memoryMb, status: "FREE" },
      });
    }
    console.log(found.length ? `Registered ${found.length} GPU(s) reported by nvidia-smi` : "No NVIDIA GPU detected");
  }

  if (process.env.SEED_DEMO === "true" && (await prisma.workspace.count()) === 0) {
    const admin = await prisma.user.findFirst({ where: { role: "ADMIN", status: "ACTIVE" } });
    if (!admin) {
      console.log("Skipping demo workspaces because no administrator exists yet");
      return;
    }
    const bob = await ensureUser("bob", "Bob Lane", "bobpass1");
    const ada = await ensureUser("ada", "Ada Morales", "adapass1");
    const samples = [
        {
          name: "Workspace 1",
          ownerId: bob.id,
          cpu: 2,
          memoryMb: 4096,
          description: "Complete compute workspace for notebooks, builds, and scheduled GPU jobs, with a private home directory.",
        },
        {
          name: "Workspace 2",
          ownerId: ada.id,
          cpu: 1,
          memoryMb: 2048,
          description: "Lightweight container for scripts and reviews, limited to one CPU and 2 GB of memory.",
        },
        {
          name: "Training Desk",
          ownerId: bob.id,
          cpu: 4,
          memoryMb: 8192,
          description: "Higher-capacity workspace for training runs. GPU access is attached only while a job holds the scheduler.",
        },
      ];
      for (const sample of samples) {
        try {
          await createWorkspace(admin, sample);
          console.log(`Created demo workspace ${sample.name}`);
        } catch (error) {
          console.warn(`Demo workspace ${sample.name} was not created`, error);
        }
      }
  }
}

async function ensureUser(username: string, name: string, password: string) {
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) return existing;
  return prisma.user.create({
    data: {
      username,
      name,
      passwordHash: await bcrypt.hash(password, 10),
      mustChangePassword: false,
      role: "USER",
      status: "ACTIVE",
    },
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(process.exitCode ?? 0);
  });
