/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@sprintos/schemas", "@sprintos/advisory"],
  experimental: {
    // The workspace packages ship TypeScript source rather than built output.
    externalDir: true,
  },
};

export default nextConfig;
