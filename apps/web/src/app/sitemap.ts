import { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    {
      url: 'https://app.codereserve.org',
      lastModified: new Date(),
    },
  ];
}
