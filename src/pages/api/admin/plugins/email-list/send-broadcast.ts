import type { APIRoute } from 'astro';
import { validateSession } from '../../../../../lib/auth';
import { readDataFile, readFileFromRepo } from '../../../../../plugins/_server';
import { sendTransactionalEmail } from '../../../../../plugins/email-list/brevo-api';
import { createUnsubscribeToken, renderEmailHtml } from '../../../../../plugins/email-list/render-email-html';

export const prerender = false;

type Subscriber = {
    email: string;
    name?: string;
    unsubscribed?: boolean;
};

export const POST: APIRoute = async ({ request }) => {
    const json = (data: any, status = 200) =>
        new Response(JSON.stringify(data), {
            status,
            headers: { 'Content-Type': 'application/json' },
        });

    try {
        const cookieHeader = request.headers.get('cookie') || '';
        const cookies = Object.fromEntries(
            cookieHeader.split(';').map(c => {
                const [k, ...v] = c.trim().split('=');
                return [k, decodeURIComponent(v.join('='))];
            }),
        );
        if (!await validateSession(cookies['admin_session'])) {
            return json({ success: false, message: 'Não autorizado.' }, 401);
        }

        const { subject, bodyMarkdown, testEmail, mode } = await request.json();
        if (!subject?.trim() || !bodyMarkdown?.trim()) {
            return json({ success: false, message: 'Assunto e conteúdo são obrigatórios.' }, 400);
        }

        const apiKey = import.meta.env.BREVO_API_KEY || process.env.BREVO_API_KEY;
        if (!apiKey) {
            return json({ success: false, message: 'BREVO_API_KEY não configurada.' }, 400);
        }

        const siteConfig = readDataFile<any>('siteConfig.json', {});
        const senderName = siteConfig?.name || 'Newsletter';
        const senderEmail = siteConfig?.contact?.email;
        if (!senderEmail) {
            return json({ success: false, message: 'Email do remetente não configurado em siteConfig.contact.email.' }, 400);
        }

        if (!bodyMarkdown?.trim()) {
            return json({ success: false, message: 'Conteúdo vazio após renderização.' }, 400);
        }
        const baseUrl = (siteConfig?.url || new URL(request.url).origin || '').replace(/\/$/, '');
        const footerAddress = siteConfig?.address || siteConfig?.contact?.address || '';
        const unsubscribeSecret = import.meta.env.ADMIN_SECRET || process.env.ADMIN_SECRET || '';

        let recipients: string[] = [];
        if (mode === 'test') {
            if (!testEmail?.trim()) {
                return json({ success: false, message: 'Informe o email de teste.' }, 400);
            }
            recipients = [testEmail.trim().toLowerCase()];
        } else {
            const raw = await readFileFromRepo('src/data/subscribers.json');
            const subscribers: Subscriber[] = raw ? JSON.parse(raw) : [];
            recipients = [...new Set(
                subscribers
                    .filter(s => !s.unsubscribed)
                    .map(s => (s.email || '').trim().toLowerCase())
                    .filter(Boolean),
            )];
            if (recipients.length === 0) {
                return json({ success: false, message: 'Nenhum inscrito para enviar.' }, 400);
            }
        }

        let sent = 0;
        let failed = 0;
        const failures: string[] = [];

        // Safety cap to avoid accidental very large sends in one request.
        const batch = recipients.slice(0, 300);
        for (const to of batch) {
            const unsubscribeUrl = (baseUrl && unsubscribeSecret)
                ? `${baseUrl}/unsubscribe?e=${encodeURIComponent(to)}&t=${createUnsubscribeToken(to, unsubscribeSecret)}`
                : undefined;
            const htmlContent = renderEmailHtml(bodyMarkdown, { unsubscribeUrl, recipientEmail: to, footerAddress });
            const result = await sendTransactionalEmail(
                apiKey,
                to,
                subject.trim(),
                htmlContent,
                senderEmail,
                senderName,
            );
            if (result.success) sent++;
            else {
                failed++;
                failures.push(`${to}: ${result.message}`);
            }
        }

        return json({
            success: failed === 0,
            mode: mode === 'test' ? 'test' : 'broadcast',
            total: batch.length,
            sent,
            failed,
            failures: failures.slice(0, 10),
            message: mode === 'test'
                ? (failed ? 'Teste com falha.' : 'Teste enviado com sucesso.')
                : `Broadcast concluído: ${sent} enviado(s), ${failed} falha(s).`,
        });
    } catch (err: any) {
        return json({ success: false, message: err.message }, 500);
    }
};

