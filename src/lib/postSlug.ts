/**
 * Slug de post para URL: minúsculas, apenas [a-z0-9-], sem hífens duplicados ou nas pontas.
 * Ex.: "Galzerano ou Burigotto!!!" → "galzerano-ou-burigotto"
 */
export function normalizePostSlug(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '');
}

/** Slug seguro para publicação (evita URLs curtas demais ou inválidas). */
export function isValidPostSlug(slug: string): boolean {
    if (!slug) return false;
    if (slug.length < 3 || slug.length > 120) return false;
    return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

/**
 * Slugs que não podem ser página de post em /[slug] porque colidem com rotas do site.
 */
export const RESERVED_ROOT_SEGMENTS = new Set([
    'blog',
    'categoria',
    'contato',
    'sobre',
    'termos',
    'privacidade',
    'admin',
    'api',
    'favicon.ico',
    'robots.txt',
    'sitemap.xml',
]);
