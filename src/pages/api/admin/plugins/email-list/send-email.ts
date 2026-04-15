/**
 * api/admin/plugins/email-list/send-email.ts
 *
 * POST — Envia email individual via Brevo
 * Body: { to, subject, htmlContent }
 */

import type { APIRoute } from 'astro';
import { validateSession } from '../../../../../lib/auth';
import { readPluginsConfig, readDataFile } from '../../../../../plugins/_server';
import { sendTransactionalEmail } from '../../../../../plugins/email-list/brevo-api';
import { createUnsubscribeToken, renderEmailHtml } from '../../../../../plugins/email-list/render-email-html';

export const prerender = false;

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
            })
        );
        if (!await validateSession(cookies['admin_session'])) {
            return json({ success: false, message: 'Não autorizado.' }, 401);
        }

        const { to, subject, htmlContent, bodyMarkdown } = await request.json();
        if (!to || !subject) {
            return json({ success: false, message: 'Campos obrigatórios: to, subject e conteúdo.' }, 400);
        }

        const config = readPluginsConfig();
        const apiKey = import.meta.env.BREVO_API_KEY || process.env.BREVO_API_KEY || config?.emailList?.brevoApiKey;
        if (!apiKey) {
            return json({ success: false, message: 'API Key do Brevo não configurada (defina BREVO_API_KEY no .env local ou na Vercel).' }, 400);
        }

        const siteConfig = readDataFile<any>('siteConfig.json', {});
        const senderName = siteConfig?.name || 'Newsletter';
        const senderEmail = siteConfig?.contact?.email;
        if (!senderEmail) {
            return json({ success: false, message: 'Email do remetente não configurado em siteConfig.contact.email.' }, 400);
        }
        const baseUrl = (siteConfig?.url || new URL(request.url).origin || '').replace(/\/$/, '');
        const footerAddress = siteConfig?.address || siteConfig?.contact?.address || '';
        const unsubscribeSecret = import.meta.env.ADMIN_SECRET || process.env.ADMIN_SECRET || '';
        const unsubscribeUrl = (baseUrl && unsubscribeSecret)
            ? `${baseUrl}/unsubscribe?e=${encodeURIComponent(String(to).trim().toLowerCase())}&t=${createUnsubscribeToken(String(to), unsubscribeSecret)}`
            : undefined;
        const finalHtmlContent = bodyMarkdown
            ? renderEmailHtml(bodyMarkdown, { unsubscribeUrl, recipientEmail: String(to), footerAddress })
            : htmlContent;
        if (!finalHtmlContent) {
            return json({ success: false, message: 'Campos obrigatórios: to, subject e conteúdo.' }, 400);
        }

        const result = await sendTransactionalEmail(
            apiKey,
            to,
            subject,
            finalHtmlContent,
            senderEmail,
            senderName
        );

        return json(result, result.success ? 200 : 400);
    } catch (err: any) {
        return json({ success: false, message: err.message }, 500);
    }
};
