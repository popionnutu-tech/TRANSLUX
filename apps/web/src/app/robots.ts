import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

// ION-153. /verificare NU e aici: o pagină blocată în robots nu-și poate arăta noindex-ul.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/'] },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
