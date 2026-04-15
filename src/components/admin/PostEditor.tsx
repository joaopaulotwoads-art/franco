import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Save, AlertCircle, Loader2, ArrowLeft, Image as ImageIcon, Eye, Edit3, Package, Pencil, Table2, Columns3 } from 'lucide-react';
import { marked } from 'marked';
import { triggerToast } from './CmsToaster';
import { githubApi } from '../../lib/adminApi';
import SEOScoreWidget from '../../plugins/seo/SEOScoreWidget';
import AffiliatePostModal, { type AffiliateInsertPayload } from './AffiliatePostModal';
import AffiliateTableModal from './AffiliateTableModal';
import AffiliateComparisonModal from './AffiliateComparisonModal';
import { buildAffiliateShortcode } from '../../lib/affiliateShortcode';
import { normalizePostSlug, isValidPostSlug } from '../../lib/postSlug';

function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Slug do produto só se a seleção/cursor se cruzar com um bloco [affiliate:slug] ou [affiliate:slug links="..."].
 * Permite espaço opcional após os dois pontos (ex.: [affiliate: slug]).
 */
function extractAffiliateSlugFromQuill(quill: any, focusEditor = false): string | null {
    try {
        const range = quill.getSelection(focusEditor);
        if (!range) return null;
        const selStart = range.index;
        const selEnd = range.index + Math.max(range.length, 1);
        const len = quill.getLength();
        const winFrom = Math.max(0, selStart - 6000);
        const winTo = Math.min(len, selEnd + 6000);
        const segment = quill.getText(winFrom, winTo - winFrom);
        const re = /\[affiliate:\s*([a-z0-9_-]+)(?:\s+links="[^"]*")?\]/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(segment)) !== null) {
            const absStart = winFrom + m.index;
            const absEnd = absStart + m[0].length;
            if (selStart < absEnd && selEnd > absStart) return m[1];
        }
        return null;
    } catch {
        return null;
    }
}

type AffiliateEditTarget =
    | { kind: 'product'; slug: string }
    | { kind: 'table'; start: number; end: number; raw: string }
    | { kind: 'comparison'; start: number; end: number; raw: string };

/** Ordem: Top Comparação → tabela → produto único (cada um com regex distinta). */
function extractAffiliateEditTargetFromQuill(quill: any, focusEditor = false): AffiliateEditTarget | null {
    try {
        const range = quill.getSelection(focusEditor);
        if (!range) return null;
        const selStart = range.index;
        const selEnd = range.index + Math.max(range.length, 1);
        const len = quill.getLength();
        const winFrom = Math.max(0, selStart - 8000);
        const winTo = Math.min(len, selEnd + 8000);
        const segment = quill.getText(winFrom, winTo - winFrom);

        const tryOverlap = (re: RegExp) => {
            let m: RegExpExecArray | null;
            re.lastIndex = 0;
            while ((m = re.exec(segment)) !== null) {
                const absStart = winFrom + m.index;
                const absEnd = absStart + m[0].length;
                if (selStart < absEnd && selEnd > absStart) return { raw: m[0], start: absStart, end: absEnd };
            }
            return null;
        };

        const comp = tryOverlap(/\[affiliate_comparison[^\]]*\]/gi);
        if (comp) return { kind: 'comparison', ...comp };

        const tab = tryOverlap(/\[affiliate_table[^\]]*\]/gi);
        if (tab) return { kind: 'table', ...tab };

        const slug = extractAffiliateSlugFromQuill(quill, focusEditor);
        if (slug) return { kind: 'product', slug };

        return null;
    } catch {
        return null;
    }
}

interface PostEditorProps {
    filePath: string | null; // null = novo post
}

export default function PostEditor({ filePath }: PostEditorProps) {
    const isEditing = !!filePath;
    const [loading, setLoading] = useState(isEditing);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [authors, setAuthors] = useState<any[]>([]);
    const [dynamicCategories, setDynamicCategories] = useState<string[]>([]);
    const [fileSha, setFileSha] = useState('');
    const [isPreview, setIsPreview] = useState(false);
    const [pendingUploads, setPendingUploads] = useState<Record<string, File>>({});
    const [QuillEditor, setQuillEditor] = useState<any>(null);
    const quillRef = useRef<any>(null);
    const [affiliateModalOpen, setAffiliateModalOpen] = useState(false);
    const [affiliateInitialSlug, setAffiliateInitialSlug] = useState<string | null>(null);
    const [affiliateFab, setAffiliateFab] = useState<{ slug: string; top: number; left: number } | null>(null);
    const [affiliateTableModalOpen, setAffiliateTableModalOpen] = useState(false);
    const [affiliateComparisonModalOpen, setAffiliateComparisonModalOpen] = useState(false);
    const [affiliateTableInitialShortcode, setAffiliateTableInitialShortcode] = useState<string | null>(null);
    const [affiliateComparisonInitialShortcode, setAffiliateComparisonInitialShortcode] = useState<string | null>(null);
    /** Ao editar bloco existente: substituir este intervalo no Quill (índices em getText). */
    const affiliateReplaceRangeRef = useRef<{ from: number; to: number } | null>(null);

    const openAffiliateModal = (slug: string | null) => {
        setAffiliateInitialSlug(slug);
        setAffiliateModalOpen(true);
    };

    const updateAffiliateFab = useCallback(() => {
        if (isPreview || affiliateModalOpen || affiliateTableModalOpen || affiliateComparisonModalOpen) {
            setAffiliateFab(null);
            return;
        }
        const quill = quillRef.current?.getEditor?.();
        if (!quill) {
            setAffiliateFab(null);
            return;
        }
        const targetFab = extractAffiliateEditTargetFromQuill(quill, false);
        const slug = targetFab?.kind === 'product' ? targetFab.slug : null;
        if (!slug) {
            setAffiliateFab(null);
            return;
        }
        const range = quill.getSelection(false);
        if (!range) {
            setAffiliateFab(null);
            return;
        }
        const b = quill.getBounds(range.index, Math.max(range.length, 1));
        const container = quill.container as HTMLElement;
        const rect = container.getBoundingClientRect();
        const top = rect.top + b.top - 6;
        const left = rect.left + b.left + b.width + 8;
        setAffiliateFab({ slug, top, left });
    }, [isPreview, affiliateModalOpen, affiliateTableModalOpen, affiliateComparisonModalOpen]);

    /** H2 com título do produto (SEO) + parágrafo com shortcode — slug vem do cadastro em affiliateProducts.json */
    const insertAffiliateSeoBlock = (payload: AffiliateInsertPayload) => {
        if (payload.insertIntoEditor === false) return;
        const shortcode = buildAffiliateShortcode(payload.slug, payload.extraLinks);
        const titleHtml = escapeHtml(payload.title.trim() || 'Produto');
        const html = `<h2>${titleHtml}</h2><p>${shortcode}</p>`;
        try {
            const quill = quillRef.current?.getEditor?.();
            if (quill) {
                const range = quill.getSelection(false);
                let index = range ? range.index : quill.getLength();
                if (index < 0 || index > quill.getLength()) index = quill.getLength();
                quill.clipboard.dangerouslyPasteHTML(index, html);
                setPost(p => ({ ...p, content: quill.root.innerHTML }));
                return;
            }
        } catch {
            /* fallback abaixo */
        }
        setPost(p => ({
            ...p,
            content: p.content ? `${p.content}<p><br></p>${html}` : html,
        }));
    };

    const onAffiliateSaved = (payload: AffiliateInsertPayload) => {
        if (payload.insertIntoEditor === false) return;
        insertAffiliateSeoBlock(payload);
    };

    const insertAffiliateTableShortcode = (shortcode: string) => {
        const html = `<p>${shortcode}</p>`;
        try {
            const quill = quillRef.current?.getEditor?.();
            if (quill) {
                const rep = affiliateReplaceRangeRef.current;
                if (rep && rep.to > rep.from) {
                    quill.deleteText(rep.from, rep.to - rep.from);
                    quill.clipboard.dangerouslyPasteHTML(rep.from, html);
                    affiliateReplaceRangeRef.current = null;
                } else {
                    const range = quill.getSelection(false);
                    let index = range ? range.index : quill.getLength();
                    if (index < 0 || index > quill.getLength()) index = quill.getLength();
                    quill.clipboard.dangerouslyPasteHTML(index, html);
                }
                setPost(p => ({ ...p, content: quill.root.innerHTML }));
                return;
            }
        } catch { /* fallback */ }
        setPost(p => ({
            ...p,
            content: p.content ? `${p.content}<p><br></p>${html}` : html,
        }));
    };

    const insertAffiliateComparisonShortcode = (shortcode: string) => {
        insertAffiliateTableShortcode(shortcode);
    };

    useEffect(() => {
        if (!QuillEditor || isPreview) return;
        let detach: (() => void) | undefined;
        const id = window.setTimeout(() => {
            const quill = quillRef.current?.getEditor?.();
            if (!quill) return;
            const onSel = () => {
                requestAnimationFrame(() => updateAffiliateFab());
            };
            quill.on('selection-change', onSel);
            quill.on('text-change', onSel);
            const root = quill.root as HTMLElement;
            root.addEventListener('scroll', onSel);
            onSel();
            detach = () => {
                quill.off('selection-change', onSel);
                quill.off('text-change', onSel);
                root.removeEventListener('scroll', onSel);
            };
        }, 0);
        return () => {
            clearTimeout(id);
            detach?.();
        };
    }, [QuillEditor, isPreview, affiliateModalOpen, affiliateTableModalOpen, affiliateComparisonModalOpen, updateAffiliateFab]);

    const formatDateForInput = (dateStr: string) => {
        try {
            const d = new Date(dateStr);
            if (isNaN(d.getTime())) return new Date().toISOString().split('T')[0];
            return d.toISOString().split('T')[0];
        } catch { return new Date().toISOString().split('T')[0]; }
    };

    const [post, setPost] = useState({
        title: '', slug: '', description: '', pubDate: new Date().toISOString().split('T')[0],
        heroImage: '', category: '', author: '', draft: false, content: ''
    });

    // Load Quill dynamically
    useEffect(() => {
        import('react-quill-new').then(mod => setQuillEditor(() => mod.default));
        import('react-quill-new/dist/quill.snow.css' as any);
    }, []);

    useEffect(() => {
        const loadData = async () => {
            try {
                const [authRes, catRes] = await Promise.allSettled([
                    githubApi('read', 'src/data/authors.json'),
                    githubApi('read', 'src/data/categories.json'),
                ]);
                if (authRes.status === 'fulfilled') { const p = JSON.parse(authRes.value.content); if (Array.isArray(p)) setAuthors(p); }
                if (catRes.status === 'fulfilled') { const p = JSON.parse(catRes.value.content); if (Array.isArray(p)) setDynamicCategories(p); }

                if (isEditing && filePath) {
                    const fileData = await githubApi('read', filePath);
                    setFileSha(fileData.sha);
                    const text = fileData.content;
                    const match = text.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
                    if (match) {
                        const fm = match[1];
                        const body = match[2].trim();
                        const extract = (key: string) => { const m = fm.match(new RegExp(`${key}:\\s*(?:"([^"]*)"|'([^']*)'|(.*))`)); return m ? (m[1] || m[2] || m[3] || '').trim() : ''; };
                        const parsedHtml = await marked.parse(body);
                        setPost({
                            title: extract('title'), slug: filePath.split('/').pop()?.replace('.md', '') || '',
                            description: extract('description'), pubDate: extract('pubDate') ? formatDateForInput(extract('pubDate')) : new Date().toISOString().split('T')[0],
                            heroImage: extract('heroImage'), category: extract('category') || 'Geral', author: extract('author'),
                            draft: extract('draft') === 'true', content: parsedHtml
                        });
                    } else {
                        setPost(p => ({ ...p, content: String(marked.parse(text)), slug: filePath.split('/').pop()?.replace('.md', '') || '' }));
                    }
                }
            } catch (err: any) {
                setError(err.message);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [filePath, isEditing]);

    const handleTitleChange = (val: string) => {
        setPost(p => ({
            ...p,
            title: val,
            slug: isEditing ? p.slug : normalizePostSlug(val),
        }));
    };

    const fileToBase64 = (file: File): Promise<string> => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = error => reject(error);
        reader.readAsDataURL(file);
    });

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>, uiKey: string) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setPendingUploads(prev => ({ ...prev, [uiKey]: file }));
        if (uiKey === 'heroImage') setPost(p => ({ ...p, heroImage: URL.createObjectURL(file) }));
        e.target.value = '';
    };

    const extractAndUploadInlineImages = async (html: string) => {
        const imgRegex = /<img[^>]+src="data:image\/([^;]+);base64,([^"]+)"[^>]*>/g;
        let modifiedHtml = html;
        const matches = [...html.matchAll(imgRegex)];
        for (const m of matches) {
            const ext = m[1]; const base64Content = m[2];
            const ghPath = `public/uploads/${Date.now()}-${Math.random().toString(36).substring(7)}.${ext}`;
            await githubApi('write', ghPath, { content: base64Content, isBase64: true, message: `Upload imagem inline ${ghPath}` });
            modifiedHtml = modifiedHtml.replace(`data:image/${ext};base64,${base64Content}`, ghPath.replace('public', ''));
        }
        return modifiedHtml;
    };

    const handleSave = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        if (!post.title || !post.slug.trim()) { setError('Título e Slug (URL) são obrigatórios.'); return; }
        const slug = normalizePostSlug(post.slug);
        if (!isValidPostSlug(slug)) {
            setError('Slug inválido: use de 3 a 120 caracteres, só letras minúsculas, números e hífens (ex.: galzerano-ou-burigotto-2026).');
            return;
        }
        setSaving(true); setError('');
        triggerToast('Processando e salvando artigo...', 'progress', 20);
        try {
            let finalHeroImage = post.heroImage;
            if (pendingUploads['heroImage']) {
                const fileObj = pendingUploads['heroImage'];
                const base64Content = await fileToBase64(fileObj);
                const fileExt = fileObj.name.split('.').pop() || 'jpg';
                const ghPath = `public/uploads/${Date.now()}-blog-cover.${fileExt}`;
                await githubApi('write', ghPath, { content: base64Content, isBase64: true, message: `Upload capa blog ${ghPath}` });
                finalHeroImage = ghPath.replace('public', '');
            }
            const cleanedContent = post.content.replace(/&nbsp;/g, ' ').replace(/\u00A0/g, ' ');
            const finalHtmlContent = await extractAndUploadInlineImages(cleanedContent);
            const markdown = `---\ntitle: "${post.title.replace(/"/g, '\\"')}"\ndescription: "${post.description.replace(/"/g, '\\"')}"\npubDate: "${post.pubDate}"\nheroImage: "${finalHeroImage}"\ncategory: "${post.category}"\nauthor: "${post.author}"\ndraft: ${post.draft}\n---\n${finalHtmlContent}`;
            const targetPath = `src/content/blog/${slug}.md`;
            const res = await githubApi('write', targetPath, { content: markdown, sha: fileSha || undefined, message: `CMS: ${isEditing ? 'Edição' : 'Criação'} do artigo ${slug}` });
            if (res.sha) setFileSha(res.sha);
            setPost(p => ({ ...p, slug }));
            setPendingUploads({});
            triggerToast('Artigo salvo com sucesso!', 'success', 100);
            if (!isEditing) setTimeout(() => { window.location.href = '/admin/posts'; }, 1500);
        } catch (err: any) {
            setError(err.message); triggerToast(`Erro: ${err.message}`, 'error');
        } finally { setSaving(false); }
    };

    if (loading) return (
        <div className="flex flex-col items-center justify-center p-20 text-slate-400 bg-white rounded-3xl border border-slate-200">
            <Loader2 className="w-8 h-8 animate-spin mb-4 text-violet-500" />
            <p className="font-medium animate-pulse">Carregando editor...</p>
        </div>
    );

    const inputClass = "w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20 transition-all shadow-sm";
    const labelClass = "block text-sm font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1";

    return (
        <div className="max-w-5xl pb-32">
            {/* Fixed header bar */}
            <div className="flex items-center justify-between bg-white p-4 px-6 rounded-2xl border border-slate-200 shadow-sm mb-6">
                <div className="flex items-center gap-3">
                    <a href="/admin/posts" className="text-slate-400 hover:text-violet-600 transition-colors p-1.5 rounded-lg hover:bg-violet-50"><ArrowLeft className="w-5 h-5" /></a>
                    <div>
                        <h2 className="text-lg font-bold text-slate-800">{isEditing ? 'Editar Artigo' : 'Novo Artigo'}</h2>
                        {post.slug && <p className="text-xs font-mono text-slate-400">/{post.slug}</p>}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <button type="button" onClick={() => setIsPreview(!isPreview)} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-sm font-medium transition-colors">
                        {isPreview ? <Edit3 className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        {isPreview ? 'Editor' : 'Preview'}
                    </button>
                    <button onClick={handleSave} disabled={saving} className="bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg text-sm font-bold flex items-center gap-2 transition-all shadow-sm shadow-violet-600/20">
                        {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                        {saving ? 'Salvando...' : <><Save className="w-4 h-4" /> {isEditing ? 'Salvar' : 'Publicar'}</>}
                    </button>
                </div>
            </div>

            {error && <div className="p-4 bg-red-50 text-red-700 border-l-4 border-red-500 text-sm font-medium mb-6 rounded-r-xl flex gap-2"><AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />{error}</div>}

            <div className="flex gap-6 items-start">
                {/* Main Editor Area */}
                <div className="flex-1 min-w-0 space-y-6">
                    {/* Title */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <label className={labelClass}>Título do Artigo *</label>
                        <input type="text" value={post.title} onChange={e => handleTitleChange(e.target.value)} className={inputClass} placeholder="Título do artigo..." />
                        <div className="mt-3">
                            <label className={labelClass}>Slug (URL) *</label>
                            <input type="text" value={post.slug} onChange={e => setPost(p => ({ ...p, slug: normalizePostSlug(e.target.value) }))} className={`${inputClass} font-mono text-xs`} placeholder="ex.: galzerano-ou-burigotto-melhor-marca-2026" />
                        <p className="text-[11px] text-slate-400 mt-1.5">URL pública: <span className="font-mono text-slate-500">/{post.slug || '…'}</span> — 3 a 120 caracteres, minúsculas e hífens.</p>
                        </div>
                        <div className="mt-3">
                            <label className={labelClass}>Descrição / Meta Description</label>
                            <textarea rows={2} value={post.description} onChange={e => setPost(p => ({ ...p, description: e.target.value }))} className={`${inputClass} resize-none`} placeholder="Breve descrição do artigo..." />
                        </div>
                    </div>

                    {/* Content Editor */}
                    <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
                        <div className="mb-3 space-y-3">
                            <div className="min-w-0">
                                <label className={labelClass + ' mb-0'}>Conteúdo do Artigo</label>
                                <p className="text-[11px] text-slate-400 mt-1.5 break-words leading-relaxed">
                                    Com o cursor ou seleção em{' '}
                                    <code className="text-amber-700 bg-amber-50 px-1 rounded break-all">[affiliate:slug]</code>,{' '}
                                    <code className="text-emerald-800 bg-emerald-50 px-1 rounded break-all">[affiliate_table …]</code> ou{' '}
                                    <code className="text-violet-800 bg-violet-50 px-1 rounded break-all">[affiliate_comparison …]</code>, use{' '}
                                    <strong className="text-slate-500">Editar</strong> ou o lápis (produto único) para alterar sem duplicar o bloco.
                                </p>
                            </div>
                            {!isPreview && (
                                <div className="flex flex-wrap gap-2 items-center w-full">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const q = quillRef.current?.getEditor?.();
                                            const t = q ? extractAffiliateEditTargetFromQuill(q, true) : null;
                                            const slug = t?.kind === 'product' ? t.slug : null;
                                            openAffiliateModal(slug);
                                        }}
                                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-sm font-bold text-white shadow-sm transition-all active:scale-[0.98]"
                                        style={{
                                            background: 'linear-gradient(135deg, #f59e0b, #f97316)',
                                            boxShadow: '0 4px 12px -2px rgba(245, 158, 11, 0.35)',
                                        }}
                                        title={affiliateFab ? 'Editar produto do shortcode selecionado' : 'Novo produto (ou selecione um shortcode para editar)'}
                                    >
                                        <Package className="w-3.5 h-3.5 shrink-0" />
                                        + Adicionar Produto Afiliado
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            affiliateReplaceRangeRef.current = null;
                                            setAffiliateTableInitialShortcode(null);
                                            setAffiliateTableModalOpen(true);
                                        }}
                                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-sm font-bold text-white shadow-sm transition-all active:scale-[0.98]"
                                        style={{
                                            background: 'linear-gradient(135deg, #059669, #0d9488)',
                                            boxShadow: '0 4px 12px -2px rgba(5, 150, 105, 0.35)',
                                        }}
                                        title="Inserir tabela comparativa (3 a 5 produtos)"
                                    >
                                        <Table2 className="w-3.5 h-3.5 shrink-0" />
                                        + Inserir Tabela Comparativa
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            affiliateReplaceRangeRef.current = null;
                                            setAffiliateComparisonInitialShortcode(null);
                                            setAffiliateComparisonModalOpen(true);
                                        }}
                                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-sm font-bold text-white shadow-sm transition-all active:scale-[0.98]"
                                        style={{
                                            background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                                            boxShadow: '0 4px 12px -2px rgba(124, 58, 237, 0.35)',
                                        }}
                                        title="Top Comparação — 3 cards em colunas"
                                    >
                                        <Columns3 className="w-3.5 h-3.5 shrink-0" />
                                        + Inserir Top Comparação
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            const q = quillRef.current?.getEditor?.();
                                            const t = q ? extractAffiliateEditTargetFromQuill(q, true) : null;
                                            if (!t) {
                                                triggerToast(
                                                    'Selecione ou coloque o cursor em um bloco: produto [affiliate:…], tabela [affiliate_table …] ou Top Comparação [affiliate_comparison …].',
                                                    'error',
                                                    200
                                                );
                                                return;
                                            }
                                            if (t.kind === 'product') {
                                                openAffiliateModal(t.slug);
                                                return;
                                            }
                                            affiliateReplaceRangeRef.current = { from: t.start, to: t.end };
                                            if (t.kind === 'table') {
                                                setAffiliateTableInitialShortcode(t.raw);
                                                setAffiliateTableModalOpen(true);
                                                return;
                                            }
                                            setAffiliateComparisonInitialShortcode(t.raw);
                                            setAffiliateComparisonModalOpen(true);
                                        }}
                                        className="inline-flex items-center justify-center gap-1 px-2.5 py-1 rounded-lg text-sm font-bold border border-amber-400 text-amber-800 bg-amber-50 hover:bg-amber-100 transition-all"
                                        title="Editar bloco afiliado selecionado (produto, tabela ou Top Comparação)"
                                    >
                                        <Pencil className="w-3.5 h-3.5 shrink-0" />
                                        Editar
                                    </button>
                                </div>
                            )}
                        </div>
                        {isPreview ? (
                            <div
                                className="prose prose-slate prose-lg max-w-none border border-slate-200 rounded-xl p-6 md:p-8 min-h-[320px] bg-white text-slate-800 leading-relaxed [&_p]:leading-relaxed [&_li]:leading-relaxed"
                                dangerouslySetInnerHTML={{ __html: post.content }}
                            />
                        ) : QuillEditor ? (
                            <div
                                className="relative rounded-xl border border-slate-200 bg-white overflow-hidden shadow-sm
                                [&_.ql-toolbar]:sticky [&_.ql-toolbar]:top-0 [&_.ql-toolbar]:z-10 [&_.ql-toolbar]:bg-white [&_.ql-toolbar]:border-b [&_.ql-toolbar]:border-slate-200 [&_.ql-toolbar]:px-2 [&_.ql-toolbar]:py-1
                                [&_.ql-container]:border-0 [&_.ql-container]:rounded-b-xl
                                [&_.ql-editor]:min-h-[22rem] [&_.ql-editor]:max-h-[min(70vh,46rem)] [&_.ql-editor]:overflow-y-auto [&_.ql-editor]:overflow-x-hidden
                                [&_.ql-editor]:px-5 [&_.ql-editor]:py-5 [&_.ql-editor]:text-[17px] [&_.ql-editor]:leading-[1.75] [&_.ql-editor]:text-slate-800 [&_.ql-editor]:font-sans
                                [&_.ql-editor_h1]:text-3xl [&_.ql-editor_h1]:font-bold [&_.ql-editor_h1]:mt-6 [&_.ql-editor_h1]:mb-3
                                [&_.ql-editor_h2]:text-2xl [&_.ql-editor_h2]:font-bold [&_.ql-editor_h2]:mt-5 [&_.ql-editor_h2]:mb-2.5
                                [&_.ql-editor_h3]:text-xl [&_.ql-editor_h3]:font-semibold [&_.ql-editor_h3]:mt-4 [&_.ql-editor_h3]:mb-2
                                [&_.ql-editor_p]:mb-3 [&_.ql-editor_ul]:my-3 [&_.ql-editor_ol]:my-3 [&_.ql-editor_li]:my-0.5
                                [&_.ql-editor_a]:text-violet-700 [&_.ql-editor_a]:underline"
                            >
                                <QuillEditor
                                    ref={quillRef}
                                    theme="snow"
                                    value={post.content}
                                    onChange={(val: string) => setPost(p => ({ ...p, content: val }))}
                                />
                                {affiliateFab && !affiliateModalOpen && !affiliateTableModalOpen && !affiliateComparisonModalOpen && (
                                    <button
                                        type="button"
                                        className="fixed z-[60] flex items-center justify-center w-9 h-9 rounded-full shadow-lg border-2 border-white text-white bg-gradient-to-br from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 transition-all hover:scale-105"
                                        style={{ top: affiliateFab.top, left: affiliateFab.left }}
                                        title="Editar este produto"
                                        aria-label="Editar produto afiliado"
                                        onClick={e => {
                                            e.preventDefault();
                                            e.stopPropagation();
                                            openAffiliateModal(affiliateFab.slug);
                                            setAffiliateFab(null);
                                        }}
                                    >
                                        <Pencil className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        ) : (
                            <div className="flex items-center justify-center p-12 text-slate-400"><Loader2 className="w-6 h-6 animate-spin mr-2" />Carregando editor...</div>
                        )}
                    </div>
                </div>

                {/* Sidebar */}
                <div className="w-72 shrink-0 space-y-4 sticky top-4">
                    {/* Publish Settings */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-700 text-sm border-b border-slate-100 pb-3 mb-4">Publicação</h3>
                        <div className="space-y-4">
                            <div>
                                <label className={labelClass}>Status</label>
                                <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl hover:bg-violet-50 transition-colors">
                                    <input type="checkbox" checked={post.draft} onChange={e => setPost(p => ({ ...p, draft: e.target.checked }))} className="rounded border-slate-300 text-violet-600 focus:ring-violet-500" />
                                    <span className="text-sm font-medium text-slate-700">Salvar como rascunho</span>
                                </label>
                            </div>
                            <div>
                                <label className={labelClass}>Data de Publicação</label>
                                <input type="date" value={post.pubDate} onChange={e => setPost(p => ({ ...p, pubDate: e.target.value }))} className={inputClass} />
                            </div>
                        </div>
                    </div>

                    {/* Category & Author */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-700 text-sm border-b border-slate-100 pb-3 mb-4">Metadados</h3>
                        <div className="space-y-4">
                            <div>
                                <label className={labelClass}>Categoria</label>
                                {dynamicCategories.length > 0 ? (
                                    <select value={post.category} onChange={e => setPost(p => ({ ...p, category: e.target.value }))} className={inputClass}>
                                        <option value="">Selecionar categoria...</option>
                                        {dynamicCategories.map(cat => <option key={cat} value={cat}>{cat}</option>)}
                                    </select>
                                ) : (
                                    <input type="text" value={post.category} onChange={e => setPost(p => ({ ...p, category: e.target.value }))} className={inputClass} placeholder="Ex: Tecnologia" />
                                )}
                            </div>
                            <div>
                                <label className={labelClass}>Autor</label>
                                {authors.length > 0 ? (
                                    <select value={post.author} onChange={e => setPost(p => ({ ...p, author: e.target.value }))} className={inputClass}>
                                        <option value="">Selecionar autor...</option>
                                        {authors.map(a => <option key={a.id} value={a.name}>{a.name}</option>)}
                                    </select>
                                ) : (
                                    <input type="text" value={post.author} onChange={e => setPost(p => ({ ...p, author: e.target.value }))} className={inputClass} placeholder="Nome do autor" />
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Hero Image */}
                    <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                        <h3 className="font-bold text-slate-700 text-sm border-b border-slate-100 pb-3 mb-4">Imagem de Capa</h3>
                        <label className="group relative border-2 border-dashed border-slate-200 hover:border-violet-400 bg-slate-50 hover:bg-violet-50 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-all text-center overflow-hidden" style={{ minHeight: '120px' }}>
                            <input type="file" accept="image/*" className="hidden" onChange={e => handleFileSelect(e, 'heroImage')} />
                            {post.heroImage ? (
                                <>
                                    <img src={post.heroImage} alt="Capa" className="absolute inset-0 w-full h-full object-cover group-hover:opacity-60 transition-opacity" />
                                    <div className="absolute inset-0 flex flex-col items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-white/20">
                                        <ImageIcon className="w-8 h-8 text-slate-800" />
                                        <span className="text-xs font-bold text-slate-900 mt-1">Trocar imagem</span>
                                    </div>
                                </>
                            ) : (
                                <div className="py-6 flex flex-col items-center text-slate-400 group-hover:text-violet-500 transition-colors">
                                    <ImageIcon className="w-8 h-8 mb-2" />
                                    <span className="text-xs font-bold">Enviar imagem de capa</span>
                                </div>
                            )}
                        </label>
                        {pendingUploads['heroImage'] && <span className="text-[10px] text-amber-600 font-bold block mt-2">Upload pendente — será enviado ao salvar</span>}
                    </div>

                    {/* SEO Score Widget */}
                    <SEOScoreWidget
                        title={post.title}
                        description={post.description}
                        heroImage={post.heroImage}
                        content={post.content}
                    />
                </div>
            </div>

            <AffiliatePostModal
                key={affiliateModalOpen ? `aff-${affiliateInitialSlug ?? 'new'}` : 'aff-closed'}
                open={affiliateModalOpen}
                initialSlug={affiliateInitialSlug}
                onClose={() => {
                    setAffiliateModalOpen(false);
                    setAffiliateInitialSlug(null);
                }}
                onInserted={onAffiliateSaved}
            />
            <AffiliateTableModal
                key={affiliateTableModalOpen ? `tbl-${affiliateTableInitialShortcode ? 'edit' : 'new'}` : 'tbl-closed'}
                open={affiliateTableModalOpen}
                onClose={() => {
                    setAffiliateTableModalOpen(false);
                    setAffiliateTableInitialShortcode(null);
                    affiliateReplaceRangeRef.current = null;
                }}
                onInsert={insertAffiliateTableShortcode}
                initialShortcode={affiliateTableInitialShortcode}
                isEditMode={!!affiliateTableInitialShortcode}
            />
            <AffiliateComparisonModal
                key={affiliateComparisonModalOpen ? `cmp-${affiliateComparisonInitialShortcode ? 'edit' : 'new'}` : 'cmp-closed'}
                open={affiliateComparisonModalOpen}
                onClose={() => {
                    setAffiliateComparisonModalOpen(false);
                    setAffiliateComparisonInitialShortcode(null);
                    affiliateReplaceRangeRef.current = null;
                }}
                onInsert={insertAffiliateComparisonShortcode}
                initialShortcode={affiliateComparisonInitialShortcode}
                isEditMode={!!affiliateComparisonInitialShortcode}
            />
        </div>
    );
}
