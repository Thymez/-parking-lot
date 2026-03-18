/** @type {import('next').NextConfig} */
const REQUIRED_API_URL = process.env.NEXT_PUBLIC_API_URL;

if (!REQUIRED_API_URL) {
  console.warn('[next.config.js] NEXT_PUBLIC_API_URL is not set. Falling back to http://localhost:8091');
}

const nextConfig = {
  reactStrictMode: true,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'no-cache, no-store, must-revalidate',
          },
          {
            key: 'Pragma',
            value: 'no-cache',
          },
          {
            key: 'Expires',
            value: '0',
          },
        ],
      },
    ];
  },
  async rewrites() {
    const apiUrl = REQUIRED_API_URL || 'http://localhost:8091';
    return [
      {
        source: '/api/:path*',
        destination: `${apiUrl}/api/:path*`,
      },
    ];
  },
}

module.exports = nextConfig
