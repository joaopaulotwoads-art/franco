import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { readData } from '../lib/readData';
import { postUrl } from '../lib/blogRoutes';

export const prerender = true;

export const GET: APIRoute = async () => {
    const siteConfig = readData('siteConfig.json');
    const siteUrl = (siteConfig.url || 'https://meublog.com.br').replace(/\/$/, '');

    const posts = (await getCollection('blog'))
        .filter(p => !p.data.draft)
        .sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());

    const categoriesData = readData('categories.json', []);
    const categoriesFromPosts = [...new Set(posts.map(p => p.data.category).filter(Boolean))];
    const allCategories: string[] = (Array.isArray(categoriesData) && categoriesData.length > 0)
        ? categoriesData
        : categoriesFromPosts;

    const now = new Date().toISOString().split('T')[0];

    const staticPages = [
        { url: '/', priority: '1.0', changefreq: 'daily' },
        { url: '/blog', priority: '0.8', changefreq: 'daily' },
        { url: '/sobre', priority: '0.5', changefreq: 'monthly' },
        { url: '/contato', priority: '0.5', changefreq: 'monthly' },
        { url: '/privacidade', priority: '0.3', changefreq: 'yearly' },
        { url: '/termos', priority: '0.3', changefreq: 'yearly' },
    ];

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${staticPages.map(p => `  <url>
    <loc>${siteUrl}${p.url}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`).join('\n')}
${posts.map(post => {
    const lastmod = (post.data.updatedDate || post.data.pubDate).toISOString().split('T')[0];
    return `  <url>
    <loc>${siteUrl}${postUrl(post.slug)}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
}).join('\n')}
${allCategories.map(cat => {
    const slug = cat.toLowerCase().replace(/[^a-z0-9]/g, '-');
    return `  <url>
    <loc>${siteUrl}/categoria/${slug}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.6</priority>
  </url>`;
}).join('\n')}
</urlset>`;

    return new Response(xml.trim(), {
        headers: { 'Content-Type': 'application/xml; charset=utf-8' },
    });
};
