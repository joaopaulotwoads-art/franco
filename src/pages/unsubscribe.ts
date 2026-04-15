import type { APIRoute } from 'astro';
import { readFileFromRepo, writeFileToRepo, readDataFile } from '../plugins/_server';
import { createUnsubscribeToken } from '../plugins/email-list/render-email-html';

export const prerender = false;

function pageHtml(title: string, message: string): string {
    return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: Inter, Segoe UI, Arial, sans-serif; background:#f8fafc; color:#0f172a; margin:0; }
    .wrap { max-width:560px; margin:48px auto; background:#fff; border:1px solid #e2e8f0; border-radius:16px; padding:28px; }
    h1 { margin:0 0 10px 0; font-size:24px; }
    p { margin:0; color:#334155; line-height:1.6; }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${title}</h1>
    <p>${message}</p>
  </div>
</body>
</html>`;
}

export const GET: APIRoute = async ({ url }) => {
    const email = (url.searchParams.get('e') || '').trim().toLowerCase();
    const token = (url.searchParams.get('t') || '').trim();
    const secret = import.meta.env.ADMIN_SECRET || process.env.ADMIN_SECRET || '';

    if (!email || !token || !secret) {
        return new Response(pageHtml('Link inválido', 'Este link de cancelamento está incompleto ou expirado.'), {
            status: 400,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }

    const expected = createUnsubscribeToken(email, secret);
    if (expected !== token) {
        return new Response(pageHtml('Token inválido', 'Não foi possível validar o pedido de cancelamento.'), {
            status: 403,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }

    const raw = await readFileFromRepo('src/data/subscribers.json');
    const subscribers: any[] = raw ? JSON.parse(raw) : [];
    const idx = subscribers.findIndex(s => (s.email || '').trim().toLowerCase() === email);

    if (idx === -1) {
        return new Response(pageHtml('Inscrição não encontrada', 'Este email não está cadastrado na lista.'), {
            status: 404,
            headers: { 'Content-Type': 'text/html; charset=utf-8' },
        });
    }

    subscribers[idx] = {
        ...subscribers[idx],
        unsubscribed: true,
        unsubscribedAt: new Date().toISOString(),
    };

    await writeFileToRepo(
        'src/data/subscribers.json',
        JSON.stringify(subscribers, null, 2),
        { message: `Newsletter: unsubscribe ${email}` },
    );

    const siteConfig = readDataFile<any>('siteConfig.json', {});
    const title = siteConfig?.name || 'Newsletter';

    return new Response(
        pageHtml('Inscrição cancelada', `Você não receberá mais emails de ${title}.`),
        { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
};

