import type { APIRoute } from 'astro';
import fs from 'node:fs/promises';
import nodePath from 'node:path';
import { fileURLToPath } from 'node:url';

export const prerender = false;

// Raiz do projeto (sobe de src/pages/api/admin/ → projeto)
const PROJECT_ROOT = nodePath.resolve(fileURLToPath(import.meta.url), '../../../../../');

/** Path do Contents API: cada segmento URL-encoded (GitHub exige para espaços, unicode, etc.) */
function encodeGithubContentPath(path: string): string {
    return path
        .split('/')
        .filter(Boolean)
        .map((seg) => encodeURIComponent(seg))
        .join('/');
}

/**
 * Na Vercel, segredos costumam existir só em process.env em runtime; import.meta.env pode vir
 * vazio no bundle (substituição em build). Sem token o código caía em handleDev: em serverless
 * o disco é só leitura, unlink falha, e o catch devolvia 200 — o utilizador acha que apagou mas não.
 */
function getGithubEnv(): { token: string; owner: string; repo: string } | null {
    const token = String(process.env.GITHUB_TOKEN ?? import.meta.env.GITHUB_TOKEN ?? '').trim();
    const owner = String(process.env.GITHUB_OWNER ?? import.meta.env.GITHUB_OWNER ?? '').trim();
    const repo = String(process.env.GITHUB_REPO ?? import.meta.env.GITHUB_REPO ?? '').trim();
    if (!token || !owner || !repo) return null;
    return { token, owner, repo };
}

/** Modo dev: lê/escreve arquivos locais sem precisar do GitHub */
async function handleDev(action: string, path: string, content?: string, isBase64?: boolean): Promise<Response> {
    const absPath = nodePath.join(PROJECT_ROOT, path);

    switch (action) {
        case 'list': {
            let entries: any[];
            try {
                const files = await fs.readdir(absPath);
                entries = files.map(name => ({
                    name,
                    path: `${path}/${name}`,
                    sha: `dev-${name}`, // sha fictício para o dev
                    type: 'file',
                }));
            } catch {
                return new Response(JSON.stringify({ error: 'Pasta não encontrada', code: 404 }), { status: 404 });
            }
            return new Response(JSON.stringify({ data: entries }), { status: 200 });
        }

        case 'read': {
            try {
                const raw = await fs.readFile(absPath, 'utf-8');
                // sha fictício mas estável (usamos mtime como proxy)
                const stat = await fs.stat(absPath);
                const sha = `dev-${stat.mtimeMs}`;
                return new Response(JSON.stringify({ content: raw, sha }), { status: 200 });
            } catch {
                return new Response(JSON.stringify({ error: 'Arquivo não encontrado', code: 404 }), { status: 404 });
            }
        }

        case 'write': {
            if (content === undefined) throw new Error("Ação 'write' exige o campo 'content'.");
            await fs.mkdir(nodePath.dirname(absPath), { recursive: true });
            const data = isBase64 ? Buffer.from(content, 'base64') : content;
            await fs.writeFile(absPath, data);
            const stat = await fs.stat(absPath);
            return new Response(JSON.stringify({ success: true, sha: `dev-${stat.mtimeMs}` }), { status: 200 });
        }

        case 'delete': {
            try {
                await fs.unlink(absPath);
            } catch (e: any) {
                const msg = e?.code === 'ENOENT' ? 'Ficheiro já não existia.' : (e?.message || String(e));
                return new Response(JSON.stringify({ error: `Apagar no disco local falhou: ${msg}` }), { status: 500 });
            }
            return new Response(JSON.stringify({ success: true }), { status: 200 });
        }

        default:
            throw new Error("Ação inválida.");
    }
}

export const POST: APIRoute = async ({ request }) => {
    try {
        const body = await request.json();
        const { action, path, content, message, sha, isBase64 } = body;

        const gh = getGithubEnv();

        // Fora do `astro dev`, nunca simular GitHub no disco: em serverless o FS é só leitura e o
        // delete parecia funcionar (200) mas o ficheiro continuava no GitHub.
        if (!gh) {
            if (!action || !path) {
                return new Response(JSON.stringify({ error: 'Faltam parâmetros (action, path)' }), { status: 400 });
            }
            if (!import.meta.env.DEV) {
                return new Response(
                    JSON.stringify({
                        error:
                            'GitHub não configurado no servidor. Defina GITHUB_TOKEN (PAT com Contents: Read e Write no repositório), GITHUB_OWNER e GITHUB_REPO nas variáveis de ambiente (ex.: Vercel → Settings → Environment Variables → Production) e faça redeploy. Sem isso o CMS não altera o repositório.',
                    }),
                    { status: 503, headers: { 'Content-Type': 'application/json' } },
                );
            }
            return handleDev(action, path, content, isBase64);
        }

        const { token: GITHUB_TOKEN, owner: GITHUB_OWNER, repo: GITHUB_REPO } = gh;

        if (!action || !path) {
            return new Response(JSON.stringify({ error: 'Faltam parâmetros obrigatórios (action, path)' }), { status: 400 });
        }

        const repo = `${GITHUB_OWNER}/${GITHUB_REPO}`;
        const githubUrl = `https://api.github.com/repos/${repo}/contents/${encodeGithubContentPath(path)}`;
        const headers: Record<string, string> = {
            Authorization: `Bearer ${GITHUB_TOKEN}`,
            Accept: 'application/vnd.github+json',
            'X-GitHub-Api-Version': '2022-11-28',
        };

        function githubErrorMessage(e: Record<string, unknown>, fallback: string): string {
            const msg = e?.message;
            if (typeof msg === 'string') return msg;
            if (Array.isArray(msg)) return msg.map(String).join('; ');
            return fallback;
        }

        let res: Response;

        switch (action) {
            case 'read':
            case 'list': {
                res = await fetch(githubUrl, { headers });
                if (!res.ok) {
                    if (res.status === 404) return new Response(JSON.stringify({ error: 'Arquivo ou pasta não encontrado', code: 404 }), { status: 404 });
                    const e = await res.json().catch(() => ({}));
                    throw new Error(`Erro ao ler ${path}: ${githubErrorMessage(e, res.statusText)}`);
                }
                const data = await res.json();
                if (Array.isArray(data)) {
                    return new Response(JSON.stringify({ data }), { status: 200 });
                }
                /** Ficheiro: GitHub por vezes omite `content` (>1MB ou binário); o `sha` para DELETE/PUT vem sempre aqui. */
                if (data.type === 'file') {
                    let decoded = '';
                    if (typeof data.content === 'string' && data.content.length > 0) {
                        decoded = Buffer.from(data.content, 'base64').toString('utf-8');
                    }
                    if (!data.sha) {
                        throw new Error(`Resposta GitHub sem sha para ${path} (type=file).`);
                    }
                    return new Response(JSON.stringify({ content: decoded, sha: data.sha }), { status: 200 });
                }
                return new Response(JSON.stringify({ data }), { status: 200 });
            }

            case 'write': {
                if (content === undefined) throw new Error("Ação 'write' exige o campo 'content'.");
                const writeBody: Record<string, any> = {
                    message: message || `Update ${path} via CMS`,
                    content: isBase64 ? content : Buffer.from(content).toString('base64'),
                };
                if (sha) writeBody.sha = sha;
                res = await fetch(githubUrl, {
                    method: 'PUT',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify(writeBody),
                });
                if (!res.ok) {
                    const e = await res.json().catch(() => ({}));
                    throw new Error(`Erro ao salvar ${path}: ${githubErrorMessage(e, res.statusText)}`);
                }
                const responseData = await res.json();
                return new Response(JSON.stringify({ success: true, sha: responseData.content?.sha }), { status: 200 });
            }

            case 'delete': {
                if (!sha || String(sha).trim() === '') {
                    throw new Error("Ação 'delete' exige o campo 'sha' (hash do ficheiro no GitHub).");
                }
                res = await fetch(githubUrl, {
                    method: 'DELETE',
                    headers: { ...headers, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ message: message || `Delete ${path} via CMS`, sha: String(sha).trim() }),
                });
                if (!res.ok) {
                    const e = await res.json().catch(() => ({}));
                    const detail = githubErrorMessage(e, res.statusText);
                    throw new Error(`Erro ao excluir ${path} (${res.status}): ${detail}`);
                }
                return new Response(JSON.stringify({ success: true }), { status: 200 });
            }

            default:
                throw new Error("Ação inválida. Use: 'read', 'list', 'write' ou 'delete'.");
        }
    } catch (err: any) {
        return new Response(
            JSON.stringify({ error: err.message }),
            { status: 500, headers: { 'Content-Type': 'application/json' } }
        );
    }
};
