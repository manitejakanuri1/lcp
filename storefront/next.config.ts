import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cloud Run serves the app from a container, and standalone is the build that carries its
  // own server and only the node_modules it actually uses - a few megabytes instead of the
  // whole install.
  output: 'standalone',
  images: {
    remotePatterns: [
      // The shop's own photos. Every saree and colour picture is written here by the POS.
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      // The seeded homepage and policy artwork still points at placeholders; it stays until
      // the real campaign images are uploaded, or those blocks render as broken pictures.
      { protocol: 'https', hostname: 'picsum.photos' },
    ],
  },
};

export default nextConfig;
