import { z } from "zod";

const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z][a-z0-9]{2,20}$/, "Username must be 3–21 characters, start with a letter, and use only lowercase letters or digits");

const password = z.string().min(8, "Password must be at least 8 characters").max(72);

export const loginSchema = z.object({
  username,
  password: z.string().min(1, "Enter a password"),
});

export const createUserSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  username,
  role: z.enum(["ADMIN", "USER"]),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(80).optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED"]).optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "Enter your current password"),
  newPassword: password,
});

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(60),
  description: z.string().trim().max(400).optional(),
  ownerId: z.string().min(1, "Assign the workspace to a user"),
  cpu: z.number().min(0.25, "CPU must be at least 0.25").max(32),
  memoryMb: z.number().int().min(256, "RAM must be at least 256 MB").max(65536),
});

export const updateWorkspaceSchema = createWorkspaceSchema.partial();

export const gpuJobSchema = z.object({
  workspaceId: z.string().min(1),
  title: z.string().trim().min(2).max(120),
  command: z.string().trim().max(2000).optional(),
});

export const execSchema = z.object({
  command: z.string().trim().min(1, "Enter a command").max(2000),
});

export const gpuDeviceSchema = z.object({
  name: z.string().trim().min(2).max(60),
  memoryMb: z.number().int().min(256).max(262144),
  index: z.number().int().min(0).max(32).optional(),
});

export const powerSchema = z.object({
  action: z.enum(["start", "stop", "retry"]),
});

export const finishJobSchema = z.object({
  action: z.enum(["complete", "cancel"]),
});
