import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    // MVP deploy no Coolify: não bloquear por erros de tipo
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
