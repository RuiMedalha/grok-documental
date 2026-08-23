import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  eslint: {
    // MVP: não bloquear deploy no Coolify por regras no-explicit-any
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Opcional: se o typecheck bloquear o build, descomenta:
    // ignoreBuildErrors: true,
  },
};

export default nextConfig;
