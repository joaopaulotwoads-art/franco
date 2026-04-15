/**
 * EmailSequenceEditor.tsx — Editor de sequência de emails automáticos
 *
 * UI para criar/editar emails enviados via Brevo após inscrição.
 * v1: envio manual individual (sem cron). Salva em pluginsConfig.json.
 */

import { useState, useEffect } from 'react';
import {
    Plus, Trash2, Send, Loader2, CheckCircle, AlertCircle, Save,
    Mail, Calendar, Clock, Link2, Image as ImageIcon, RectangleHorizontal, List, Type, Quote, Minus
} from 'lucide-react';
import { githubApi } from '../../lib/adminApi';
import { triggerToast } from '../../components/admin/CmsToaster';
import { marked } from 'marked';

const CONFIG_PATH = 'src/data/pluginsConfig.json';

interface EmailItem {
    id: string;
    subject: string;
    body: string;
    delayDays: number;
}

marked.setOptions({
    gfm: true,
    breaks: true,
});

export default function EmailSequenceEditor() {
    const [emails, setEmails] = useState<EmailItem[]>([]);
    const [fileSha, setFileSha] = useState('');
    const [fullConfig, setFullConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [error, setError] = useState('');
    const [sendingId, setSendingId] = useState<string | null>(null);
    const [testEmail, setTestEmail] = useState('');
    const [sendResults, setSendResults] = useState<Record<string, { ok: boolean; msg: string }>>({});
    const [sequenceStats, setSequenceStats] = useState<Array<{ sequenceIndex: number; sent: number; failed: number; lastSentAt: string }>>([]);
    const [lastRunAt, setLastRunAt] = useState<string | null>(null);
    const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

    function sanitizePreviewHtml(html: string): string {
        return html
            .replace(/<\s*(script|style|iframe|object|embed|meta|link)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
            .replace(/<\s*(script|style|iframe|object|embed|meta|link)[^>]*\/?\s*>/gi, '')
            .replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
            .replace(/\s(href|src)=["']\s*javascript:[^"']*["']/gi, ' $1="#"');
    }

    function renderPreviewHtml(markdown: string): string {
        const input = (markdown || '').trim();
        if (!input) return '';
        const raw = marked.parse(input) as string;
        return sanitizePreviewHtml(raw);
    }

    useEffect(() => {
        Promise.all([
            githubApi('read', CONFIG_PATH),
            fetch('/api/admin/plugins/email-list/sequence-status').then(r => r.ok ? r.json() : null).catch(() => null),
        ])
            .then(([data, stats]) => {
                const config = JSON.parse(data.content);
                setFullConfig(config);
                setFileSha(data.sha);
                const sequences = config?.emailList?.sequences ?? [];
                setEmails(sequences.map((s: any, i: number) => ({
                    id: `seq_${i}_${Date.now()}`,
                    subject: s.subject ?? '',
                    body: s.body ?? '',
                    delayDays: s.delayDays ?? 1,
                })));
                if (stats) {
                    setSequenceStats(stats.stats ?? []);
                    setLastRunAt(stats.lastRunAt ?? null);
                }
            })
            .catch(err => setError(err.message))
            .finally(() => setLoading(false));
    }, []);

    function addEmail() {
        setEmails(prev => [...prev, {
            id: `new_${Date.now()}`,
            subject: '',
            body: '',
            delayDays: prev.length === 0 ? 1 : prev[prev.length - 1].delayDays + 1,
        }]);
    }

    function removeEmail(id: string) {
        setEmails(prev => prev.filter(e => e.id !== id));
    }

    function updateEmail(id: string, field: keyof Omit<EmailItem, 'id'>, value: string | number) {
        setEmails(prev => prev.map(e => e.id === id ? { ...e, [field]: value } : e));
    }

    function insertSnippet(id: string, snippet: string) {
        setEmails(prev => prev.map(e => {
            if (e.id !== id) return e;
            const base = e.body?.trimEnd() || '';
            const join = base ? '\n\n' : '';
            return { ...e, body: `${base}${join}${snippet}` };
        }));
    }

    function addLinkSnippet(id: string) {
        const url = window.prompt('URL do link (ex.: https://seusite.com):', 'https://');
        if (!url) return;
        const text = window.prompt('Texto do link:', 'Clique aqui') || 'Clique aqui';
        insertSnippet(id, `[${text}](${url.trim()})`);
    }

    function addImageSnippet(id: string) {
        const url = window.prompt('URL da imagem (https://...):', 'https://');
        if (!url) return;
        const alt = window.prompt('Texto alternativo da imagem:', 'Imagem') || 'Imagem';
        insertSnippet(id, `![${alt}](${url.trim()})`);
    }

    function addButtonSnippet(id: string) {
        const url = window.prompt('URL do botão (https://...):', 'https://');
        if (!url) return;
        const text = window.prompt('Texto do botão:', 'Quero acessar') || 'Quero acessar';
        insertSnippet(
            id,
            `<p style="margin: 20px 0;">\n  <a href="${url.trim()}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 18px;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">${text}</a>\n</p>`,
        );
    }

    function addHeadingSnippet(id: string, level: 1 | 2 | 3) {
        const title = window.prompt(`Texto do título H${level}:`, level === 1 ? 'Título principal' : 'Subtítulo') || '';
        if (!title.trim()) return;
        insertSnippet(id, `${'#'.repeat(level)} ${title.trim()}`);
    }

    function addParagraphSnippet(id: string) {
        const text = window.prompt('Texto do parágrafo:', 'Escreva aqui sua mensagem...') || '';
        if (!text.trim()) return;
        insertSnippet(id, text.trim());
    }

    function addListSnippet(id: string) {
        insertSnippet(id, `- Benefício 1\n- Benefício 2\n- Benefício 3`);
    }

    function addQuoteSnippet(id: string) {
        const quote = window.prompt('Texto da citação/destaque:', 'Uma frase forte para destacar no email.') || '';
        if (!quote.trim()) return;
        insertSnippet(id, `> ${quote.trim()}`);
    }

    function addDividerSnippet(id: string) {
        insertSnippet(id, '---');
    }

    function addSignatureSnippet(id: string) {
        insertSnippet(id, `Um grande abraço,\n\nPaula Franco\nSoberania Quântica`);
    }

    function applyTemplate(id: string, template: 'boasvindas' | 'conteudo' | 'oferta') {
        const templates: Record<typeof template, string> = {
            boasvindas: `# Bem-vindo(a) à nossa comunidade!\n\nOlá {{nome}},\n\nQue alegria ter você com a gente. A partir de agora, você vai receber conteúdos para transformar sua vida com consciência e direção.\n\n## O que você vai receber\n\n- Reflexões práticas\n- Conteúdos exclusivos\n- Convites especiais\n\n[Conhecer o conteúdo especial](https://seusite.com/oferta)\n\nUm grande abraço,\n\nPaula Franco\nSoberania Quântica`,
            conteudo: `# Novo conteúdo para você\n\nOlá {{nome}},\n\nSaiu um conteúdo novo que pode te ajudar muito:\n\n[Ver conteúdo agora](https://seusite.com/blog/post)\n\n> Dica: reserve 10 minutos sem distrações para absorver melhor.\n\nUm grande abraço,\n\nPaula Franco\nSoberania Quântica`,
            oferta: `# Convite especial para você\n\nOlá {{nome}},\n\nPreparei uma condição especial por tempo limitado.\n\n## O que você recebe\n\n- Acesso imediato\n- Material complementar\n- Suporte exclusivo\n\n<p style="margin: 20px 0;">\n  <a href="https://seusite.com/oferta" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 18px;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">Quero aproveitar agora</a>\n</p>\n\nNos vemos do outro lado,\n\nPaula Franco`,
        };

        setEmails(prev => prev.map(e => {
            if (e.id !== id) return e;
            const hasContent = !!e.body?.trim();
            if (hasContent) {
                const ok = window.confirm('Substituir o conteúdo atual pelo template?');
                if (!ok) return e;
            }
            return { ...e, body: templates[template] };
        }));
    }

    async function handleSave() {
        setSaving(true); setSaved(false); setError('');
        triggerToast('Salvando sequência...', 'progress', 30);
        try {
            const sequences = emails.map(e => ({
                subject: e.subject.trim(),
                body: e.body.trim(),
                delayDays: Number(e.delayDays),
            }));
            const updated = {
                ...fullConfig,
                emailList: {
                    ...fullConfig?.emailList,
                    sequences,
                },
            };
            const res = await githubApi('write', CONFIG_PATH, {
                content: JSON.stringify(updated, null, 4),
                sha: fileSha,
                message: 'CMS: Update email sequences',
            });
            setFileSha(res.sha ?? fileSha);
            setFullConfig(updated);
            setSaved(true);
            triggerToast('Sequência salva!', 'success', 100);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: any) {
            setError(err.message);
            triggerToast(`Erro: ${err.message}`, 'error');
        } finally {
            setSaving(false);
        }
    }

    async function sendTest(emailItem: EmailItem) {
        if (!testEmail.trim()) {
            setSendResults(prev => ({
                ...prev,
                [emailItem.id]: { ok: false, msg: 'Informe um email de destino acima.' },
            }));
            return;
        }
        setSendingId(emailItem.id);
        setSendResults(prev => ({ ...prev, [emailItem.id]: undefined as any }));
        try {
            const res = await fetch('/api/admin/plugins/email-list/send-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    to: testEmail.trim(),
                    subject: emailItem.subject,
                    bodyMarkdown: emailItem.body,
                }),
            });
            const data = await res.json();
            setSendResults(prev => ({
                ...prev,
                [emailItem.id]: { ok: data.success, msg: data.message },
            }));
        } catch {
            setSendResults(prev => ({
                ...prev,
                [emailItem.id]: { ok: false, msg: 'Erro de rede.' },
            }));
        } finally {
            setSendingId(null);
        }
    }

    const inputClass = 'w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all';
    const labelClass = 'block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5';

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-16 text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin mb-3 text-violet-500" />
            <p className="text-sm animate-pulse">Carregando sequências...</p>
        </div>
    );

    if (error && !fullConfig) return (
        <div className="bg-red-50 text-red-700 p-6 rounded-2xl border border-red-200 flex gap-3">
            <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
            <p className="text-sm">{error}</p>
        </div>
    );

    return (
        <div className="space-y-6">
            {/* Banner sequência automática */}
            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex gap-3">
                <Clock className="w-5 h-5 text-violet-500 shrink-0 mt-0.5" />
                <div>
                    <p className="font-bold text-violet-800 text-sm">Sequência automática</p>
                    <p className="text-violet-700 text-xs mt-0.5 leading-relaxed">
                        Emails processados diariamente às 08:00 UTC via Vercel Cron.
                        {lastRunAt && (
                            <> Última execução: <span className="font-semibold">{new Date(lastRunAt).toLocaleString('pt-BR')}</span>.</>
                        )}
                    </p>
                </div>
            </div>

            {/* Email de teste global */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                <label className="block text-sm font-bold text-slate-700 mb-2">Email para testes</label>
                <input
                    type="email"
                    value={testEmail}
                    onChange={e => setTestEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className={inputClass}
                />
                <p className="text-xs text-slate-400 mt-1">Usado pelo botão "Enviar teste" em cada email.</p>
            </div>

            {/* Lista de emails */}
            {emails.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-white rounded-2xl border border-dashed border-slate-300">
                    <Mail className="w-10 h-10 mx-auto mb-3 opacity-40" />
                    <p className="text-sm font-medium mb-1">Nenhum email na sequência</p>
                    <p className="text-xs">Adicione o primeiro email abaixo.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    {emails.map((emailItem, idx) => {
                        const stat = sequenceStats.find(s => s.sequenceIndex === idx);
                        return (
                        <div key={emailItem.id} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
                            {/* Header do email */}
                            <div className="flex items-center justify-between mb-4">
                                <div className="flex items-center gap-2 flex-wrap">
                                    <span className="w-7 h-7 bg-violet-100 text-violet-700 rounded-full flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                                    <span className="text-sm font-bold text-slate-700">Email #{idx + 1}</span>
                                    {stat && (
                                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700">
                                            Enviado para {stat.sent} inscritos{stat.failed > 0 ? ` (${stat.failed} falha${stat.failed > 1 ? 's' : ''})` : ''}
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeEmail(emailItem.id)}
                                    className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </div>

                            <div className="space-y-3">
                                {/* Delay + Assunto */}
                                <div className="grid grid-cols-3 gap-3">
                                    <div>
                                        <label className={labelClass}>
                                            <Calendar className="w-3 h-3 inline mr-1" />
                                            Dias após inscrição
                                        </label>
                                        <input
                                            type="number"
                                            min={0}
                                            value={emailItem.delayDays}
                                            onChange={e => updateEmail(emailItem.id, 'delayDays', Number(e.target.value))}
                                            className={inputClass}
                                        />
                                    </div>
                                    <div className="col-span-2">
                                        <label className={labelClass}>Assunto</label>
                                        <input
                                            type="text"
                                            value={emailItem.subject}
                                            onChange={e => updateEmail(emailItem.id, 'subject', e.target.value)}
                                            placeholder="Assunto do email"
                                            className={inputClass}
                                        />
                                    </div>
                                </div>

                                {/* Corpo */}
                                <div>
                                    <label className={labelClass}>Conteúdo (texto simples / markdown)</label>
                                    <div className="mb-2 flex flex-wrap gap-2">
                                        <button
                                            type="button"
                                            onClick={() => addHeadingSnippet(emailItem.id, 1)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <Type className="w-3.5 h-3.5" />
                                            Título
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => addHeadingSnippet(emailItem.id, 2)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <Type className="w-3.5 h-3.5" />
                                            Subtítulo
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => addParagraphSnippet(emailItem.id)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <Type className="w-3.5 h-3.5" />
                                            Texto
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => addListSnippet(emailItem.id)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <List className="w-3.5 h-3.5" />
                                            Lista
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => addLinkSnippet(emailItem.id)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <Link2 className="w-3.5 h-3.5" />
                                            Link
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => addImageSnippet(emailItem.id)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <ImageIcon className="w-3.5 h-3.5" />
                                            Imagem
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => addButtonSnippet(emailItem.id)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <RectangleHorizontal className="w-3.5 h-3.5" />
                                            Botão CTA
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => addQuoteSnippet(emailItem.id)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <Quote className="w-3.5 h-3.5" />
                                            Destaque
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => addDividerSnippet(emailItem.id)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            <Minus className="w-3.5 h-3.5" />
                                            Divisor
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => addSignatureSnippet(emailItem.id)}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                                        >
                                            Assinatura
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => applyTemplate(emailItem.id, 'boasvindas')}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-violet-200 bg-violet-50 rounded-lg text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
                                        >
                                            Template boas-vindas
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => applyTemplate(emailItem.id, 'conteudo')}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-violet-200 bg-violet-50 rounded-lg text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
                                        >
                                            Template conteúdo
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => applyTemplate(emailItem.id, 'oferta')}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-violet-200 bg-violet-50 rounded-lg text-xs font-semibold text-violet-700 hover:bg-violet-100 transition-colors"
                                        >
                                            Template oferta
                                        </button>
                                    </div>
                                    <textarea
                                        rows={5}
                                        value={emailItem.body}
                                        onChange={e => updateEmail(emailItem.id, 'body', e.target.value)}
                                        placeholder="Olá {{nome}},&#10;&#10;Escreva aqui o conteúdo do email..."
                                        className={`${inputClass} resize-none font-mono text-xs`}
                                    />
                                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Preview do email</p>
                                            <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewMode('desktop')}
                                                    className={`px-2.5 py-1 text-xs font-semibold ${previewMode === 'desktop' ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                                                >
                                                    Desktop
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewMode('mobile')}
                                                    className={`px-2.5 py-1 text-xs font-semibold ${previewMode === 'mobile' ? 'bg-violet-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                                                >
                                                    Celular
                                                </button>
                                            </div>
                                        </div>
                                        <div className={`mx-auto rounded-lg border border-slate-200 bg-white p-3 ${previewMode === 'mobile' ? 'max-w-[390px]' : 'max-w-none'}`}>
                                            <div
                                                className="prose prose-sm max-w-none prose-a:text-violet-700 prose-img:rounded-md prose-img:max-h-56 prose-p:my-2 prose-ul:my-2"
                                                dangerouslySetInnerHTML={{ __html: renderPreviewHtml(emailItem.body) }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Enviar teste */}
                                <div className="flex items-center gap-3 pt-1">
                                    <button
                                        type="button"
                                        onClick={() => sendTest(emailItem)}
                                        disabled={sendingId === emailItem.id || !emailItem.subject || !emailItem.body}
                                        className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                    >
                                        {sendingId === emailItem.id
                                            ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                            : <Send className="w-3.5 h-3.5" />}
                                        {sendingId === emailItem.id ? 'Enviando...' : 'Enviar teste'}
                                    </button>

                                    {sendResults[emailItem.id] && (
                                        <div className={`flex items-center gap-1.5 text-xs font-semibold ${sendResults[emailItem.id].ok ? 'text-green-600' : 'text-red-600'}`}>
                                            {sendResults[emailItem.id].ok
                                                ? <CheckCircle className="w-3.5 h-3.5" />
                                                : <AlertCircle className="w-3.5 h-3.5" />}
                                            {sendResults[emailItem.id].msg}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                        );
                    })}
                </div>
            )}

            {/* Adicionar + Salvar */}
            <div className="flex gap-3">
                <button
                    type="button"
                    onClick={addEmail}
                    className="flex items-center gap-2 px-4 py-2.5 border border-dashed border-slate-300 rounded-xl text-sm font-medium text-slate-600 hover:border-violet-400 hover:text-violet-700 hover:bg-violet-50 transition-all"
                >
                    <Plus className="w-4 h-4" />
                    Adicionar Email
                </button>
                {emails.length > 0 && (
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving}
                        className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-6 py-2.5 rounded-xl text-sm font-bold flex items-center gap-2 transition-all shadow-sm shadow-violet-600/20"
                    >
                        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : saved ? <CheckCircle className="w-4 h-4" /> : <Save className="w-4 h-4" />}
                        {saving ? 'Salvando...' : saved ? 'Salvo!' : 'Salvar Sequência'}
                    </button>
                )}
            </div>

            {error && (
                <div className="p-4 bg-red-50 text-red-700 border-l-4 border-red-500 text-sm font-medium rounded-r-xl flex gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}
                </div>
            )}
        </div>
    );
}
