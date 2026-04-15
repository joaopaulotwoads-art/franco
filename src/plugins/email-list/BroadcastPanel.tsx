import { useEffect, useState } from 'react';
import { Send, Loader2, AlertCircle, CheckCircle, Megaphone, Users, Link2, Image as ImageIcon, RectangleHorizontal, Type, List, Quote, Minus } from 'lucide-react';
import { marked } from 'marked';

marked.setOptions({ gfm: true, breaks: true });

function sanitizePreviewHtml(html: string): string {
    return html
        .replace(/<\s*(script|style|iframe|object|embed|meta|link)[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, '')
        .replace(/<\s*(script|style|iframe|object|embed|meta|link)[^>]*\/?\s*>/gi, '')
        .replace(/\son\w+=(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\s(href|src)=["']\s*javascript:[^"']*["']/gi, ' $1="#"');
}

function renderPreviewHtml(markdown: string): string {
    const raw = marked.parse((markdown || '').trim()) as string;
    return sanitizePreviewHtml(raw);
}

export default function BroadcastPanel() {
    const [subject, setSubject] = useState('');
    const [bodyMarkdown, setBodyMarkdown] = useState('');
    const [testEmail, setTestEmail] = useState('');
    const [subscribersCount, setSubscribersCount] = useState(0);
    const [loadingCount, setLoadingCount] = useState(true);
    const [sending, setSending] = useState(false);
    const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
    const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');

    function insertSnippet(snippet: string) {
        setBodyMarkdown(prev => {
            const base = (prev || '').trimEnd();
            const join = base ? '\n\n' : '';
            return `${base}${join}${snippet}`;
        });
    }

    function addHeading(level: 1 | 2) {
        const text = window.prompt(level === 1 ? 'Texto do título:' : 'Texto do subtítulo:', level === 1 ? 'Título principal' : 'Subtítulo');
        if (!text?.trim()) return;
        insertSnippet(`${'#'.repeat(level)} ${text.trim()}`);
    }

    function addParagraph() {
        const text = window.prompt('Texto do parágrafo:', 'Escreva aqui sua mensagem...');
        if (!text?.trim()) return;
        insertSnippet(text.trim());
    }

    function addList() {
        insertSnippet('- Benefício 1\n- Benefício 2\n- Benefício 3');
    }

    function addLink() {
        const url = window.prompt('URL do link:', 'https://');
        if (!url) return;
        const text = window.prompt('Texto do link:', 'Clique aqui') || 'Clique aqui';
        insertSnippet(`[${text}](${url.trim()})`);
    }

    function addImage() {
        const url = window.prompt('URL da imagem:', 'https://');
        if (!url) return;
        const alt = window.prompt('Texto alternativo da imagem:', 'Imagem') || 'Imagem';
        insertSnippet(`![${alt}](${url.trim()})`);
    }

    function addButton() {
        const url = window.prompt('URL do botão:', 'https://');
        if (!url) return;
        const text = window.prompt('Texto do botão:', 'Quero acessar') || 'Quero acessar';
        insertSnippet(
            `<p style="margin: 20px 0;">\n  <a href="${url.trim()}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 18px;background:#7c3aed;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;">${text}</a>\n</p>`,
        );
    }

    function addQuote() {
        const text = window.prompt('Texto do destaque:', 'Uma frase forte para destacar no email.');
        if (!text?.trim()) return;
        insertSnippet(`> ${text.trim()}`);
    }

    function addDivider() {
        insertSnippet('---');
    }

    useEffect(() => {
        fetch('/api/admin/plugins/email-list/leads')
            .then(r => r.ok ? r.json() : { subscribers: [] })
            .then(data => setSubscribersCount((data.subscribers || []).length))
            .catch(() => setSubscribersCount(0))
            .finally(() => setLoadingCount(false));
    }, []);

    async function send(mode: 'test' | 'broadcast') {
        if (!subject.trim() || !bodyMarkdown.trim()) {
            setResult({ ok: false, message: 'Preencha assunto e conteúdo.' });
            return;
        }
        if (mode === 'broadcast') {
            const ok = window.confirm(`Enviar broadcast para até ${subscribersCount} inscrito(s)?`);
            if (!ok) return;
        }

        setSending(true);
        setResult(null);
        try {
            const res = await fetch('/api/admin/plugins/email-list/send-broadcast', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ subject, bodyMarkdown, testEmail, mode }),
            });
            const data = await res.json();
            setResult({ ok: !!data.success, message: data.message || 'Sem resposta.' });
        } catch {
            setResult({ ok: false, message: 'Erro de rede.' });
        } finally {
            setSending(false);
        }
    }

    const inputClass = 'w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all';
    const labelClass = 'block text-xs font-bold text-slate-400 uppercase tracking-wider mb-1.5';

    return (
        <div className="space-y-5">
            <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex items-start gap-3">
                <Megaphone className="w-5 h-5 text-violet-600 mt-0.5" />
                <div>
                    <p className="text-sm font-bold text-violet-800">Broadcast (campanha avulsa)</p>
                    <p className="text-xs text-violet-700 mt-1">
                        Use para envio pontual para toda sua base. Sequências automáticas continuam na aba "Sequências".
                    </p>
                </div>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <Users className="w-4 h-4 text-violet-600" />
                    {loadingCount ? 'Carregando base...' : `${subscribersCount} inscrito(s) disponível(is)`}
                </div>

                <div>
                    <label className={labelClass}>Assunto</label>
                    <input value={subject} onChange={e => setSubject(e.target.value)} className={inputClass} placeholder="Assunto da campanha" />
                </div>

                <div>
                    <label className={labelClass}>Email de teste</label>
                    <input value={testEmail} onChange={e => setTestEmail(e.target.value)} className={inputClass} placeholder="seu@email.com" />
                </div>

                <div>
                    <label className={labelClass}>Conteúdo (markdown/html)</label>
                    <div className="mb-2 flex flex-wrap gap-2">
                        <button type="button" onClick={() => addHeading(1)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"><Type className="w-3.5 h-3.5" />Título</button>
                        <button type="button" onClick={() => addHeading(2)} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"><Type className="w-3.5 h-3.5" />Subtítulo</button>
                        <button type="button" onClick={addParagraph} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"><Type className="w-3.5 h-3.5" />Texto</button>
                        <button type="button" onClick={addList} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"><List className="w-3.5 h-3.5" />Lista</button>
                        <button type="button" onClick={addLink} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"><Link2 className="w-3.5 h-3.5" />Link</button>
                        <button type="button" onClick={addImage} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"><ImageIcon className="w-3.5 h-3.5" />Imagem</button>
                        <button type="button" onClick={addButton} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"><RectangleHorizontal className="w-3.5 h-3.5" />Botão CTA</button>
                        <button type="button" onClick={addQuote} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"><Quote className="w-3.5 h-3.5" />Destaque</button>
                        <button type="button" onClick={addDivider} className="inline-flex items-center gap-1.5 px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50"><Minus className="w-3.5 h-3.5" />Divisor</button>
                    </div>
                    <textarea
                        rows={8}
                        value={bodyMarkdown}
                        onChange={e => setBodyMarkdown(e.target.value)}
                        className={`${inputClass} resize-y font-mono text-xs`}
                        placeholder="Escreva sua campanha aqui..."
                    />
                </div>

                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Preview</p>
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
                            className="prose prose-sm max-w-none prose-a:text-violet-700 prose-img:rounded-md prose-img:max-h-56"
                            dangerouslySetInnerHTML={{ __html: renderPreviewHtml(bodyMarkdown) }}
                        />
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        type="button"
                        onClick={() => send('test')}
                        disabled={sending}
                        className="inline-flex items-center gap-2 px-4 py-2.5 border border-slate-200 rounded-xl text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                        Enviar teste
                    </button>
                    <button
                        type="button"
                        onClick={() => send('broadcast')}
                        disabled={sending || subscribersCount === 0}
                        className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                    >
                        {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Megaphone className="w-4 h-4" />}
                        Enviar broadcast
                    </button>
                </div>

                {result && (
                    <div className={`flex items-center gap-2 text-sm font-medium ${result.ok ? 'text-green-700' : 'text-red-700'}`}>
                        {result.ok ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {result.message}
                    </div>
                )}
            </div>
        </div>
    );
}

