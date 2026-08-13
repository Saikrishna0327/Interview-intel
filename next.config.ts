import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Prisma talks to the database through a small "query engine" file.
  // Our Prisma client lives in a custom folder (app/generated/prisma), so
  // Next.js does not copy that engine file into the server bundle by default.
  // This line forces Next.js to include everything in that folder for every
  // server route, so the engine is present when the app runs on Vercel.
  outputFileTracingIncludes: {
    "/**": ["./app/generated/prisma/**/*"],
  },
};

export default nextConfig;
