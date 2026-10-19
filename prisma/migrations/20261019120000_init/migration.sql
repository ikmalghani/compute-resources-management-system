CREATE TYPE "Role" AS ENUM ('ADMIN', 'USER');
CREATE TYPE "AccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');
CREATE TYPE "WorkspaceStatus" AS ENUM ('PROVISIONING', 'RUNNING', 'STOPPED', 'ERROR');
CREATE TYPE "GpuStatus" AS ENUM ('FREE', 'BUSY');
CREATE TYPE "GpuMode" AS ENUM ('NONE', 'NVIDIA', 'SIMULATED');
CREATE TYPE "JobStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED', 'CANCELLED');

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "status" "AccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GpuDevice" (
    "id" TEXT NOT NULL,
    "index" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "memoryMb" INTEGER NOT NULL,
    "status" "GpuStatus" NOT NULL DEFAULT 'FREE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GpuDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "cpu" DOUBLE PRECISION NOT NULL,
    "memoryMb" INTEGER NOT NULL,
    "status" "WorkspaceStatus" NOT NULL DEFAULT 'PROVISIONING',
    "containerId" TEXT,
    "containerName" TEXT,
    "gpuMode" "GpuMode" NOT NULL DEFAULT 'NONE',
    "lastError" TEXT,
    "ownerId" TEXT,
    "gpuDeviceId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workspace_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "GpuJob" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "command" TEXT NOT NULL DEFAULT '',
    "output" TEXT NOT NULL DEFAULT '',
    "status" "JobStatus" NOT NULL DEFAULT 'QUEUED',
    "error" TEXT,
    "workspaceId" TEXT NOT NULL,
    "gpuDeviceId" TEXT,
    "requestedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "GpuJob_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ActivityLog" (
    "id" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetLabel" TEXT NOT NULL,
    "detail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "GpuDevice_index_key" ON "GpuDevice"("index");
CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");
CREATE UNIQUE INDEX "Workspace_gpuDeviceId_key" ON "Workspace"("gpuDeviceId");
CREATE INDEX "Workspace_ownerId_idx" ON "Workspace"("ownerId");
CREATE INDEX "Workspace_status_idx" ON "Workspace"("status");
CREATE INDEX "GpuJob_status_createdAt_idx" ON "GpuJob"("status", "createdAt");
CREATE INDEX "GpuJob_workspaceId_idx" ON "GpuJob"("workspaceId");
CREATE INDEX "ActivityLog_createdAt_idx" ON "ActivityLog"("createdAt");

ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Workspace" ADD CONSTRAINT "Workspace_gpuDeviceId_fkey" FOREIGN KEY ("gpuDeviceId") REFERENCES "GpuDevice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "GpuJob" ADD CONSTRAINT "GpuJob_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "GpuJob" ADD CONSTRAINT "GpuJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ActivityLog" ADD CONSTRAINT "ActivityLog_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
