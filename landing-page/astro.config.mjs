import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es']
  },
  output: 'static',
  adapter: vercel()
});