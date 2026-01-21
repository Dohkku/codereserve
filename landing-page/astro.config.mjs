import { defineConfig } from 'astro/config';

import netlify from '@astrojs/netlify';

export default defineConfig({
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'es']
  },

  adapter: netlify()
});