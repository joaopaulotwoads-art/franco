/**
 * Slug de post para URL: minúsculas, apenas [a-z0-9-], sem hífens duplicados ou nas pontas.
 * Ex.: "Galzerano ou Burigotto!!!" → "galzerano-ou-burigotto"
 * Ex.: "Lei da Atração" → "lei-da-atracao" (remove acentos; evita NFD virar "l-e-i-…")
 */
export function normalizePostSlug(raw: string): string {
    return raw
        .trim()
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .normalize('NFC')
        .toLowerCase()
        .replace(/ß/g, 'ss')
        .replace(/æ/g, 'ae')
        .replace(/œ/g, 'oe')
        .replace(/ø/g, 'o')
        .replace(/đ/g, 'd')
        .replace(/ł/g, 'l')
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
