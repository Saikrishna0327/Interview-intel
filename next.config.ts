import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Treat Prisma as an external server package. This tells Next.js not to try
  // to bundle it, so its query engine loads correctly from node_modules on
  // Vercel. This is the supported way to run Prisma on Vercel.
  serverExternalPackages: ["@prisma/client", ".prisma/client"],
};

export default nextConfig;
