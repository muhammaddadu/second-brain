import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

/** Default project-Pages URL; override with VITE_SITE_URL for a custom domain. */
const DEFAULT_SITE_URL = 'https://muhammaddadu.github.io/second-brain';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const siteUrl = (env.VITE_SITE_URL || DEFAULT_SITE_URL).replace(/\/$/, '');
  // Project Pages need /<repo>/; local `pnpm dev` keeps `/` unless VITE_BASE is set.
  const base = env.VITE_BASE ?? '/';

  return {
    plugins: [
      react(),
      tailwindcss(),
      {
        name: 'html-site-url',
        transformIndexHtml(html) {
          return html.replaceAll('__SITE_URL__', siteUrl);
        },
      },
    ],
    base,
  };
});
