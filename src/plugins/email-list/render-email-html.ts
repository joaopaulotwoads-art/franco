import { marked } from 'marked';
import { createHmac } from 'node:crypto';

marked.setOptions({
    gfm: true,
    breaks: true,
});

const EMAIL_BASE_STYLE = [
    "font-family:'Inter','Segoe UI',Roboto,Arial,Helvetica,sans-serif",
    'font-size:18px',
    'line-height:1.6',
    'color:#0f172a',
].join(';');

function sanitizeEmailHtml(html: string): string {
    // Basic sanitization for email rendering: remove dangerous tags and inline handlers.
    return html
        .replace(/<\s*(script|style|iframe|object|embed|meta|link)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/<\s*(script|style|iframe|object|embed|meta|link)[^>]*\/?\s*>/gi, '')
        .replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\s(href|src)=["']\s*javascript:[^"']*["']/gi, ' $1="#"');
}

export function createUnsubscribeToken(email: string, secret: string): string {
    return createHmac('sha256', secret).update(email.toLowerCase().trim()).digest('hex');
}

type RenderEmailOptions = {
    unsubscribeUrl?: string;
    recipientEmail?: string;
    footerAddress?: string;
};

export function renderEmailHtml(markdown: string, options: RenderEmailOptions = {}): string {
    const input = (markdown || '').trim();
    if (!input) return '';
    const raw = marked.parse(input) as string;
    const safe = sanitizeEmailHtml(raw);

    const footer = options.unsubscribeUrl
        ? `<hr style="margin:28px 0;border:none;border-top:1px solid #e2e8f0;" />
<p style="margin:0 0 8px 0;font-size:13px;color:#64748b;">Enviado para ${options.recipientEmail || 'você'}.</p>
<p style="margin:0 0 12px 0;font-size:13px;"><a href="${options.unsubscribeUrl}" target="_blank" rel="noopener noreferrer" style="color:#334155;">Cancelar inscrição</a></p>
${options.footerAddress ? `<p style="margin:0;font-size:12px;color:#94a3b8;">${options.footerAddress}</p>` : ''}`
        : '';

    return `<div style="${EMAIL_BASE_STYLE}">${safe}${footer}</div>`;
}
