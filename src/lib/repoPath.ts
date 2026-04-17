/** Caminho de ficheiro no repositório GitHub (sem barra inicial, só `/`). */
export function normalizeRepoPath(raw: unknown): string {
    return String(raw ?? '')
        .trim()
        .replace(/^\/+/, '')
        .replace(/\\/g, '/')
        .replace(/\/+/g, '/')
        .replace(/^\/+|\/+$/g, '');
}
