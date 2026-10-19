import path from "path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(process.cwd()),
  serverExternalPackages: ["dockerode", "docker-modem", "ssh2", "cpu-features", "bcryptjs", "@prisma/client"],
  outputFileTracingIncludes: {
    "/api/**": ["./workspace/**"],
  },
};

export default nextConfig;
