import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  // This app lives in frontend/ of the TerraShift repository; pin its root so
  // Next.js does not pick up unrelated lockfiles in parent directories.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),
};

export default nextConfig;
