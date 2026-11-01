import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Cloud Run serves the app from a container, and standalone is the build that carries its
  // own server and only the node_modules it actually uses - a few megabytes instead of the
  // whole install.
  output: 'standalone',
  images: {
    // Saree photographs already exist at 400, 800 and 2000 in the bucket, so this app points
    // at the right one instead of making its own copy. See lib/image-loader.ts.
    loaderFile: './lib/image-loader.ts',
    // Next 16 refuses any quality not listed here. A saree is judged on its weave and its
    // zari, and the default 75 smears both; 92 is the figure the POS already keeps its own
    // copies at.
    qualities: [75, 92],
    remotePatterns: [
      // The shop's own name for the photo bucket, through a Cloudflare worker, so the
      // photographs are cached on the shop's plan rather than Google's.
      { protocol: 'https', hostname: 'img.lakshmisarees.in' },
      // The shop's own photos. Every saree and colour picture is written here by the POS.
      { protocol: 'https', hostname: 'storage.googleapis.com' },
      // The seeded homepage and policy artwork still points at placeholders; it stays until
      // the real campaign images are uploaded, or those blocks render as broken pictures.
      { protocol: 'https', hostname: 'picsum.photos' },
    ],
  },
};

export default nextConfig;
