/** Codificação opcional de links extras no shortcode [affiliate:slug links="base64url"] */

export function encodeAffiliateLinksParam(links: { label: string; url: string }[] | undefined | null): string | null {
  if (!links?.length) return null;
  const filtered = links.filter(l => l.label?.trim() && l.url?.trim());
  if (!filtered.length) return null;
  const json = JSON.stringify(
    filtered.map(l => ({ label: l.label.trim(), url: l.url.trim() }))
  );
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function buildAffiliateShortcode(slug: string, links?: { label: string; url: string }[] | null): string {
  const s = slug.trim();
  const enc = encodeAffiliateLinksParam(links || []);
  if (enc) return `[affiliate:${s} links="${enc}"]`;
  return `[affiliate:${s}]`;
}
