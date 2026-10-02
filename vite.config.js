import { defineConfig } from 'vite';

// Public URL for canonical / Open Graph / sitemap. Netlify sets URL at build time;
// SITE_URL overrides it (e.g. for a custom domain).
const SITE = (process.env.SITE_URL || process.env.URL || 'https://k2-savage-mountain.netlify.app').replace(/\/$/, '');

function siteUrl() {
  return {
    name: 'k2-site-url',
    transformIndexHtml: (html) => html.replaceAll('__SITE__', SITE),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'robots.txt', source: `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n` });
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>${SITE}/</loc><changefreq>monthly</changefreq></url>\n</urlset>\n`,
      });
    },
  };
}

export default defineConfig({
  base: '/',
  plugins: [siteUrl()],
  build: {
    target: 'es2022',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 900,
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/three')) return 'three';
          if (id.includes('node_modules/gsap') || id.includes('node_modules/lenis')) return 'scroll';
        },
      },
    },
  },
  server: { host: true },
});
