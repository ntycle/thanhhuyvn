/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        // Áp dụng cho tất cả các routes
        source: '/(.*)',
        headers: [
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          {
            key: 'Content-Security-Policy',
            value: "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval' www.gstatic.com; connect-src 'self' *.googleapis.com *.firebaseapp.com oauth.zaloapp.com graph.zalo.me *.zalo.me; img-src 'self' data: *.googleapis.com *.zalo.me *.zadn.vn"
          }
        ],
      },
    ];
  },
};

export default nextConfig;
