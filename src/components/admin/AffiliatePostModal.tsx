/**
 * Modal com formulário completo do plugin de afiliados + prévia ao vivo.
 * Upsert por ASIN ou slug; injeta H2 + [affiliate:slug] no editor (via onInserted).
 */
import { useState, useEffect, useRef } from 'react';
import {
  X,
  Loader2,
  ShoppingCart,
  Package,
  Plus,
  Trash2,
  Eye,
  Copy,
} from 'lucide-react';
import { githubApi } from '../../lib/adminApi';
import { buildAffiliateShortcode } from '../../lib/affiliateShortcode';
import { triggerToast } from './CmsToaster';

const PRODUCTS_PATH = 'src/data/affiliateProducts.json';
const CONFIG_PATH = 'src/data/pluginsConfig.json';

interface ExtraLink {
  label: string;
  url: string;
}

interface Product {
  id: string;
  slug: string;
  asin?: string;
  title: string;
  description: string;
  image: string;
  amazonUrl: string;
  extraLinks: ExtraLink[];
  price: string;
  originalPrice: string;
  rating: number;
  pros: string[];
  cons: string[];
  badge: string;
  buttonText: string;
  enabled: boolean;
}

interface AffiliateConfig {
  amazonTag: string;
  amazonAccessKey: string;
  amazonSecretKey: string;
  defaultButtonText: string;
  buttonColor: string;
}

const defaultConfig: AffiliateConfig = {
  amazonTag: '',
  amazonAccessKey: '',
  amazonSecretKey: '',
  defaultButtonText: 'Ver na Amazon',
  buttonColor: '#FF9900',
};

const BADGE_OPTIONS = [
  '',
  'Melhor Escolha',
  'Mais Vendido',
  'Melhor Custo-Benefício',
  'Recomendado',
  "Editor's Choice",
  'Premium',
  'Orçamento',
];

const BADGE_STYLES: Record<string, { bg: string; text: string; icon: string }> = {
  'Melhor Escolha': { bg: 'bg-amber-100', text: 'text-amber-800', icon: '🏆' },
  'Mais Vendido': { bg: 'bg-green-100', text: 'text-green-800', icon: '🔥' },
  'Melhor Custo-Benefício': { bg: 'bg-blue-100', text: 'text-blue-800', icon: '💡' },
  Recomendado: { bg: 'bg-violet-100', text: 'text-violet-800', icon: '⭐' },
  "Editor's Choice": { bg: 'bg-rose-100', text: 'text-rose-800', icon: '✍️' },
  Premium: { bg: 'bg-purple-100', text: 'text-purple-800', icon: '💎' },
  Orçamento: { bg: 'bg-slate-100', text: 'text-slate-700', icon: '💰' },
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function extractAsinFromUrl(url: string): string {
  if (!url?.trim()) return '';
  const m = url.match(/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?:\/|[/?]|$)/i);
  return m ? m[1].toUpperCase() : '';
}

function normalizeAsinCode(s: string): string {
  const t = s.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.length === 10) return t;
  return '';
}

function resolveAsinLookup(asinField: string, amazonUrl: string): string {
  return normalizeAsinCode(asinField) || extractAsinFromUrl(amazonUrl);
}

function findProductIndex(products: Product[], slugKey: string, asinLook: string): number {
  if (asinLook) {
    const byAsin = products.findIndex(p => {
      const pAsin = normalizeAsinCode(p.asin || '') || extractAsinFromUrl(p.amazonUrl || '');
      return pAsin && pAsin === asinLook;
    });
    if (byAsin >= 0) return byAsin;
  }
  if (slugKey) {
    const bySlug = products.findIndex(p => p.slug === slugKey);
    if (bySlug >= 0) return bySlug;
  }
  return -1;
}


function StarRating({ rating }: { rating: number }) {
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <div className="flex items-center gap-0.5">
      {[0, 1, 2, 3, 4].map(i => (
        <span
          key={i}
          className={
            i < full ? 'text-amber-400' : i === full && half ? 'text-amber-300' : 'text-slate-200'
          }
          style={{ fontSize: '12px' }}
        >
          ★
        </span>
      ))}
      <span className="ml-1 text-slate-500 text-xs font-bold tabular-nums">
        {Number(rating).toFixed(1)}
      </span>
    </div>
  );
}

function LivePreview({
  form,
  prosText,
  consText,
  buttonColor,
  defaultButtonText,
}: {
  form: Omit<Product, 'id'>;
  prosText: string;
  consText: string;
  buttonColor: string;
  defaultButtonText: string;
}) {
  const pros = prosText
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  const cons = consText
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean)
    .slice(0, 3);
  const btnText = form.buttonText || defaultButtonText;
  const badgeInfo = form.badge ? BADGE_STYLES[form.badge] : null;
  const hasContent = !!(form.title || form.image || form.price);

  if (!hasContent) {
    return (
      <div className="flex flex-col items-center justify-center h-56 text-center px-4">
        <div className="w-14 h-14 rounded-2xl bg-amber-50 flex items-center justify-center mb-3">
          <Eye className="w-6 h-6 text-amber-300" />
        </div>
        <p className="text-sm font-semibold text-slate-400">Preencha os dados</p>
        <p className="text-xs text-slate-300 mt-1">A prévia do card aparece aqui</p>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
      {form.badge && badgeInfo && (
        <div
          className={`px-3 py-1.5 ${badgeInfo.bg} ${badgeInfo.text} font-bold uppercase tracking-wider flex items-center gap-1.5`}
          style={{ fontSize: '10px' }}
        >
          <span>{badgeInfo.icon}</span>
          {form.badge}
        </div>
      )}
      <div className="flex gap-3 p-3">
        {form.image && (
          <div className="w-16 h-16 shrink-0 rounded-lg bg-slate-50 border border-slate-100 overflow-hidden">
            <img
              src={form.image}
              alt=""
              className="w-full h-full object-contain"
              onError={e => {
                (e.target as HTMLImageElement).style.display = 'none';
              }}
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="font-bold text-slate-800 leading-tight mb-1 line-clamp-2" style={{ fontSize: '12px' }}>
            {form.title || <span className="text-slate-300 font-normal">Título do produto...</span>}
          </p>
          {form.rating > 0 && <StarRating rating={form.rating} />}
          {form.price && (
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="font-bold text-amber-700" style={{ fontSize: '13px' }}>
                {form.price}
              </span>
              {form.originalPrice && (
                <span className="text-slate-400 line-through" style={{ fontSize: '10px' }}>
                  {form.originalPrice}
                </span>
              )}
            </div>
          )}
        </div>
      </div>

      {(pros.length > 0 || cons.length > 0) && (
        <div className="px-3 pb-2 grid grid-cols-2 gap-x-2">
          <div className="space-y-0.5">
            {pros.map((p, i) => (
              <div key={i} className="flex items-start gap-1 text-slate-600" style={{ fontSize: '11px' }}>
                <span className="text-green-500 shrink-0 mt-0.5 font-bold">✓</span>
                <span className="leading-tight">{p}</span>
              </div>
            ))}
          </div>
          <div className="space-y-0.5">
            {cons.map((c, i) => (
              <div key={i} className="flex items-start gap-1 text-slate-600" style={{ fontSize: '11px' }}>
                <span className="text-red-400 shrink-0 mt-0.5 font-bold">✗</span>
                <span className="leading-tight">{c}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-3 pb-3 space-y-1.5">
        <div
          className="text-white font-bold text-center py-2 rounded-lg"
          style={{ background: buttonColor, fontSize: '11px' }}
        >
          {btnText} →
        </div>
        {form.extraLinks
          ?.filter(l => l.label.trim() && l.url.trim())
          .map((link, i) => {
            const lab = link.label.toLowerCase();
            let cls =
              'block text-center font-semibold py-1.5 rounded-lg border text-[10px] no-underline';
            if (lab.includes('mercado') || lab.includes('meli'))
              cls += ' bg-[#fff159] text-gray-900 border-[#e6d700]';
            else if (lab.includes('magalu') || lab.includes('magazine'))
              cls += ' bg-gradient-to-r from-sky-500 to-pink-500 text-white border-0';
            else if (lab.includes('shopee')) cls += ' bg-[#ee4d2d] text-white border-[#d7321f]';
            else cls += ' bg-white text-slate-700 border-slate-200';
            return (
              <a
                key={i}
                href={link.url}
                target="_blank"
                rel="nofollow noopener noreferrer"
                className={cls}
              >
                {link.label} →
              </a>
            );
          })}
      </div>
    </div>
  );
}

const inputClass =
  'w-full bg-white border border-slate-200 rounded-xl px-4 py-3 text-sm font-medium text-slate-800 focus:outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 transition-all shadow-sm';
const labelClass = 'block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 ml-0.5';

export type AffiliateInsertPayload = {
  slug: string;
  id: string;
  title: string;
  /** false quando abriu a partir de shortcode selecionado — só atualiza JSON, não insere H2 no editor */
  insertIntoEditor?: boolean;
  /** Links extras embutidos no shortcode (Mercado Livre, Magalu, etc.) */
  extraLinks?: ExtraLink[];
};

type Props = {
  open: boolean;
  onClose: () => void;
  /** Se definido ao abrir, carrega o produto deste slug para edição */
  initialSlug?: string | null;
  onInserted: (payload: AffiliateInsertPayload) => void;
};

export default function AffiliatePostModal({ open, onClose, initialSlug = null, onInserted }: Props) {
  const [productsSha, setProductsSha] = useState('');
  const [config, setConfig] = useState<AffiliateConfig>(defaultConfig);
  const slugManual = useRef(false);

  const [asin, setAsin] = useState('');
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState('');
  const [amazonUrl, setAmazonUrl] = useState('');
  const [extraLinks, setExtraLinks] = useState<ExtraLink[]>([]);
  const [price, setPrice] = useState('');
  const [originalPrice, setOriginalPrice] = useState('');
  const [rating, setRating] = useState(4.5);
  const [prosText, setProsText] = useState('');
  const [consText, setConsText] = useState('');
  const [badge, setBadge] = useState('');
  const [buttonText, setButtonText] = useState('');
  const [enabled, setEnabled] = useState(true);
  const [importing, setImporting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingProduct, setLoadingProduct] = useState(false);

  const formForPreview: Omit<Product, 'id'> = {
    slug,
    title,
    description,
    image,
    amazonUrl,
    extraLinks,
    price,
    originalPrice,
    rating,
    pros: [],
    cons: [],
    badge,
    buttonText,
    enabled,
  };

  useEffect(() => {
    if (!open) {
      setAsin('');
      setTitle('');
      setSlug('');
      setDescription('');
      setImage('');
      setAmazonUrl('');
      setExtraLinks([]);
      setPrice('');
      setOriginalPrice('');
      setRating(4.5);
      setProsText('');
      setConsText('');
      setBadge('');
      setButtonText('');
      setEnabled(true);
      setLoadingProduct(false);
      return;
    }

    Promise.all([githubApi('read', CONFIG_PATH).catch(() => null)]).then(([cfgData]) => {
      if (cfgData) {
        const cfg = JSON.parse(cfgData.content);
        if (cfg.affiliates) {
          setConfig({ ...defaultConfig, ...cfg.affiliates });
        }
      }
    });
    githubApi('read', PRODUCTS_PATH)
      .then(d => setProductsSha(d.sha))
      .catch(() => setProductsSha(''));

    if (!initialSlug?.trim()) {
      slugManual.current = false;
      setAsin('');
      setTitle('');
      setSlug('');
      setDescription('');
      setImage('');
      setAmazonUrl('');
      setExtraLinks([]);
      setPrice('');
      setOriginalPrice('');
      setRating(4.5);
      setProsText('');
      setConsText('');
      setBadge('');
      setButtonText('');
      setEnabled(true);
      return;
    }

    let cancelled = false;
    setLoadingProduct(true);
    slugManual.current = true;
    const needle = initialSlug.trim();
    const needleLc = needle.toLowerCase();
    (async () => {
      try {
        const raw = await githubApi('read', PRODUCTS_PATH);
        const arr = JSON.parse(raw.content);
        const products: Product[] = Array.isArray(arr) ? arr : [];
        const p = products.find(
          x => x.slug === needle || (x.slug && x.slug.toLowerCase() === needleLc)
        );
        if (cancelled) return;
        if (p) {
          setAsin(p.asin || '');
          setTitle(p.title);
          setSlug(p.slug);
          setDescription(p.description || '');
          setImage(p.image || '');
          setAmazonUrl(p.amazonUrl || '');
          setExtraLinks(
            Array.isArray(p.extraLinks)
              ? p.extraLinks.map(l => ({
                  label: String(l.label ?? ''),
                  url: String(l.url ?? ''),
                }))
              : []
          );
          setPrice(p.price || '');
          setOriginalPrice(p.originalPrice || '');
          setRating(typeof p.rating === 'number' ? p.rating : 4.5);
          setProsText((p.pros || []).join('\n'));
          setConsText((p.cons || []).join('\n'));
          setBadge(p.badge || '');
          setButtonText(p.buttonText || '');
          setEnabled(p.enabled !== false);
          triggerToast('Produto carregado para edição.', 'success', 80);
        } else {
          setSlug(slugify(needle));
          setExtraLinks([]);
          triggerToast('Produto não encontrado no cadastro — preencha para criar.', 'warning', 120);
        }
      } catch {
        if (!cancelled) triggerToast('Não foi possível carregar o produto.', 'error');
      } finally {
        if (!cancelled) setLoadingProduct(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, initialSlug]);

  const onTitleChange = (v: string) => {
    setTitle(v);
    if (!slugManual.current) setSlug(slugify(v));
  };

  const onSlugChange = (v: string) => {
    slugManual.current = true;
    setSlug(slugify(v));
  };

  const importFromAmazon = async () => {
    const raw = asin.trim();
    if (!raw) return;
    setImporting(true);
    try {
      const res = await fetch('/api/admin/amazon-product', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          asin: raw,
          accessKey: config.amazonAccessKey || undefined,
          secretKey: config.amazonSecretKey || undefined,
          partnerTag: config.amazonTag || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        triggerToast(data.error || 'Erro ao buscar produto', 'error');
        return;
      }
      const features: string[] = data.features ?? [];
      const pros = features.slice(0, 4).join('\n');
      const norm = normalizeAsinCode(raw) || extractAsinFromUrl(data.amazonUrl || '');
      if (norm) setAsin(norm);
      if (data.title) {
        setTitle(data.title);
        if (!slugManual.current) setSlug(slugify(data.title));
      }
      if (data.image) setImage(data.image);
      if (data.price) setPrice(data.price);
      if (data.originalPrice) setOriginalPrice(data.originalPrice);
      if (typeof data.rating === 'number') setRating(data.rating);
      if (data.amazonUrl) setAmazonUrl(data.amazonUrl);
      if (pros) setProsText(pros);
      triggerToast('Dados importados da Amazon.', 'success', 100);
    } catch (e: any) {
      triggerToast(e.message, 'error');
    } finally {
      setImporting(false);
    }
  };

  const handleSave = async () => {
    if (!title.trim()) {
      triggerToast('Preencha o título do produto', 'error');
      return;
    }
    if (!amazonUrl.trim()) {
      triggerToast('Preencha a URL da Amazon (principal)', 'error');
      return;
    }

    const finalSlugFromForm = slug.trim() ? slugify(slug.trim()) : slugify(title.trim());
    if (!finalSlugFromForm) {
      triggerToast('Slug ou título inválido', 'error');
      return;
    }

    const asinLook = resolveAsinLookup(asin, amazonUrl);

    setSaving(true);
    try {
      let products: Product[] = [];
      let sha = productsSha;
      try {
        const raw = await githubApi('read', PRODUCTS_PATH);
        const arr = JSON.parse(raw.content);
        products = Array.isArray(arr) ? arr : [];
        sha = raw.sha;
      } catch {
        products = [];
      }

      const pros = prosText.split('\n').map(s => s.trim()).filter(Boolean);
      const cons = consText.split('\n').map(s => s.trim()).filter(Boolean);
      const links = extraLinks.filter(l => l.label.trim() && l.url.trim());

      const matchIdx = findProductIndex(products, finalSlugFromForm, asinLook);
      const isUpdate = matchIdx >= 0;
      const prev = isUpdate ? products[matchIdx] : null;

      let outProduct: Product;
      let finalSlug: string;
      let finalId: string;

      if (isUpdate && prev) {
        finalSlug = prev.slug;
        finalId = prev.id;
        outProduct = {
          ...prev,
          title: title.trim(),
          description: description.trim(),
          image: image.trim(),
          amazonUrl: amazonUrl.trim(),
          extraLinks: links,
          price: price.trim(),
          originalPrice: originalPrice.trim(),
          rating: Number(rating) || prev.rating,
          pros,
          cons,
          badge,
          buttonText: buttonText.trim(),
          enabled,
          ...(asinLook ? { asin: asinLook } : {}),
        };
      } else {
        finalSlug = finalSlugFromForm;
        finalId = `p_${Date.now()}`;
        outProduct = {
          id: finalId,
          slug: finalSlug,
          ...(asinLook ? { asin: asinLook } : {}),
          title: title.trim(),
          description: description.trim(),
          image: image.trim(),
          amazonUrl: amazonUrl.trim(),
          extraLinks: links,
          price: price.trim(),
          originalPrice: originalPrice.trim(),
          rating: Number(rating) || 4.5,
          pros,
          cons,
          badge,
          buttonText: buttonText.trim(),
          enabled,
        };
      }

      const newList = isUpdate
        ? products.map((p, i) => (i === matchIdx ? outProduct : p))
        : [...products, outProduct];

      const res = await githubApi('write', PRODUCTS_PATH, {
        content: JSON.stringify(newList, null, 2),
        sha: sha || undefined,
        message: isUpdate
          ? `CMS: atualiza produto afiliado (editor) — ${finalSlug}`
          : `CMS: produto afiliado (editor) — ${finalSlug}`,
      });
      setProductsSha(res.sha || sha);
      const insertIntoEditor = !initialSlug;
      triggerToast(
        insertIntoEditor
          ? isUpdate
            ? 'Produto atualizado. Bloco inserido no artigo.'
            : 'Produto criado. Bloco inserido no artigo.'
          : isUpdate
            ? 'Produto atualizado. O shortcode no texto continua o mesmo.'
            : 'Produto salvo. O shortcode no texto continua o mesmo.',
        'success',
        100,
      );
      onInserted({
        slug: finalSlug,
        id: finalId,
        title: title.trim(),
        insertIntoEditor,
        extraLinks: links.length ? links : undefined,
      });
      onClose();
    } catch (err: any) {
      triggerToast(err.message || 'Erro ao salvar', 'error');
    } finally {
      setSaving(false);
    }
  };

  const copyShortcodePreview = () => {
    const s = slug.trim() ? slugify(slug.trim()) : slugify(title.trim());
    if (!s) return;
    const links = extraLinks.filter(l => l.label.trim() && l.url.trim());
    navigator.clipboard.writeText(buildAffiliateShortcode(s, links));
    triggerToast('Shortcode copiado!', 'success', 100);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm"
      onClick={e => e.target === e.currentTarget && !saving && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="aff-post-modal-title"
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col border border-amber-100/80 overflow-hidden">
        <div
          className="px-4 sm:px-5 py-3 sm:py-4 flex items-center justify-between shrink-0 text-white"
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #f97316 50%, #ea580c 100%)',
            boxShadow: '0 8px 32px -4px rgba(245, 158, 11, 0.35)',
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center border border-white/30 shrink-0">
              <Package className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h2 id="aff-post-modal-title" className="font-black text-base sm:text-lg tracking-tight truncate">
                Produto afiliado
              </h2>
              <p className="text-amber-100 text-[11px] sm:text-xs font-medium mt-0.5">
                {initialSlug
                  ? `Editando: ${initialSlug} · prévia ao vivo`
                  : 'Formulário completo · Upsert por ASIN ou slug · Prévia ao vivo'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/15 transition-colors shrink-0"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex flex-col lg:flex-row flex-1 min-h-0">
          {/* Coluna esquerda: scroll */}
          <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-5 space-y-4 border-b lg:border-b-0 lg:border-r border-slate-100">
            <div className="flex gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
              <div className="flex-1 min-w-0">
                <label className={labelClass}>ASIN / ID (importar da Amazon)</label>
                <input
                  type="text"
                  value={asin}
                  onChange={e => setAsin(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), importFromAmazon())}
                  className={`${inputClass} font-mono text-xs`}
                  placeholder="B09XS7JWHH"
                />
              </div>
              <div className="flex items-end">
                <button
                  type="button"
                  onClick={importFromAmazon}
                  disabled={importing || !asin.trim()}
                  className="flex items-center gap-1.5 px-4 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors whitespace-nowrap h-[46px] shadow-md shadow-amber-500/25"
                >
                  {importing ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <ShoppingCart className="w-4 h-4" />
                  )}
                  Importar
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Título do produto *</label>
                <input
                  type="text"
                  value={title}
                  onChange={e => onTitleChange(e.target.value)}
                  className={inputClass}
                  placeholder="Nome do produto"
                />
              </div>
              <div>
                <label className={labelClass}>Slug (URL) — auto</label>
                <input
                  type="text"
                  value={slug}
                  onChange={e => onSlugChange(e.target.value)}
                  className={`${inputClass} font-mono text-xs`}
                  placeholder="slug-do-produto"
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Descrição curta</label>
              <input
                type="text"
                value={description}
                onChange={e => setDescription(e.target.value)}
                className={inputClass}
                placeholder="Uma linha sobre o produto"
              />
            </div>

            <div>
              <label className={labelClass}>URL da imagem</label>
              <input
                type="url"
                value={image}
                onChange={e => setImage(e.target.value)}
                className={`${inputClass} font-mono text-xs`}
                placeholder="https://m.media-amazon.com/images/I/..."
              />
            </div>

            <div>
              <label className={labelClass}>URL Amazon (principal) *</label>
              <input
                type="url"
                value={amazonUrl}
                onChange={e => setAmazonUrl(e.target.value)}
                className={`${inputClass} font-mono text-xs`}
                placeholder="https://www.amazon.com.br/dp/..."
              />
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between mb-2">
                <label className={`${labelClass} mb-0`}>Links adicionais</label>
                <button
                  type="button"
                  onClick={() => setExtraLinks(l => [...l, { label: '', url: '' }])}
                  className="flex items-center gap-1 text-xs font-bold text-amber-600 hover:text-amber-700 bg-amber-50 hover:bg-amber-100 px-2.5 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="w-3 h-3" /> Adicionar loja
                </button>
              </div>
              {extraLinks.length === 0 ? (
                <p className="text-xs text-slate-400">Mercado Livre, Magalu, Shopee...</p>
              ) : (
                <div className="space-y-2">
                  {extraLinks.map((link, i) => (
                    <div key={i} className="flex gap-2 items-center">
                      <input
                        type="text"
                        value={link.label}
                        onChange={e =>
                          setExtraLinks(ls =>
                            ls.map((l, j) => (j === i ? { ...l, label: e.target.value } : l)),
                          )
                        }
                        className={`${inputClass} w-28 shrink-0`}
                        placeholder="Magalu"
                      />
                      <input
                        type="url"
                        value={link.url}
                        onChange={e =>
                          setExtraLinks(ls =>
                            ls.map((l, j) => (j === i ? { ...l, url: e.target.value } : l)),
                          )
                        }
                        className={`${inputClass} font-mono text-xs flex-1`}
                        placeholder="https://..."
                      />
                      <button
                        type="button"
                        onClick={() => setExtraLinks(ls => ls.filter((_, j) => j !== i))}
                        className="p-2 text-slate-300 hover:text-red-500 rounded-lg transition-colors shrink-0"
                        aria-label="Remover"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className={labelClass}>Preço</label>
                <input
                  type="text"
                  value={price}
                  onChange={e => setPrice(e.target.value)}
                  className={inputClass}
                  placeholder="R$ 1.899"
                />
              </div>
              <div>
                <label className={labelClass}>Preço original</label>
                <input
                  type="text"
                  value={originalPrice}
                  onChange={e => setOriginalPrice(e.target.value)}
                  className={inputClass}
                  placeholder="R$ 2.299"
                />
              </div>
              <div>
                <label className={labelClass}>Rating (1–5)</label>
                <input
                  type="number"
                  min={1}
                  max={5}
                  step={0.5}
                  value={rating}
                  onChange={e => setRating(Number(e.target.value))}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Prós (1 por linha)</label>
                <textarea
                  value={prosText}
                  onChange={e => setProsText(e.target.value)}
                  rows={4}
                  className={inputClass}
                  placeholder={'Qualidade\nAutonomia'}
                />
              </div>
              <div>
                <label className={labelClass}>Contras (1 por linha)</label>
                <textarea
                  value={consText}
                  onChange={e => setConsText(e.target.value)}
                  rows={4}
                  className={inputClass}
                  placeholder={'Preço\nPeso'}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Badge</label>
                <select
                  value={badge}
                  onChange={e => setBadge(e.target.value)}
                  className={inputClass}
                >
                  {BADGE_OPTIONS.map(b => (
                    <option key={b || 'none'} value={b}>
                      {b || '— Sem badge —'}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClass}>Texto do botão</label>
                <input
                  type="text"
                  value={buttonText}
                  onChange={e => setButtonText(e.target.value)}
                  className={inputClass}
                  placeholder={config.defaultButtonText}
                />
              </div>
            </div>

            <label className="flex items-center gap-3 cursor-pointer p-3 bg-slate-50 rounded-xl hover:bg-amber-50 transition-colors w-fit">
              <input
                type="checkbox"
                checked={enabled}
                onChange={e => setEnabled(e.target.checked)}
                className="rounded border-slate-300 text-amber-500 focus:ring-amber-400"
              />
              <span className="text-sm font-medium text-slate-700">Produto ativo (visível nos posts)</span>
            </label>

            <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t border-slate-100 pb-2">
            <button
              type="button"
              onClick={handleSave}
              disabled={saving || loadingProduct}
              className="flex-1 disabled:opacity-50 text-white py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.99] shadow-lg shadow-orange-500/30"
              style={{ background: 'linear-gradient(135deg, #f59e0b, #f97316)' }}
            >
              {saving || loadingProduct ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {loadingProduct ? 'Carregando...' : saving ? 'Salvando...' : 'Salvar e inserir no artigo'}
            </button>
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-3 rounded-xl text-sm font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-all"
              >
                Cancelar
              </button>
            </div>
          </div>

          {/* Prévia ao vivo — coluna direita */}
          <div className="lg:w-[300px] shrink-0 flex flex-col max-h-[50vh] lg:max-h-none lg:min-h-0 bg-gradient-to-b from-slate-50/80 to-slate-100/40 p-4 sm:p-5 border-t lg:border-t-0 lg:border-l border-slate-100 overflow-y-auto">
            <div className="sticky top-0 lg:top-4 space-y-3">
              <div className="flex items-center gap-2 mb-1">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full animate-pulse" />
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">Prévia ao vivo</p>
              </div>
              <LivePreview
                form={formForPreview}
                prosText={prosText}
                consText={consText}
                buttonColor={config.buttonColor}
                defaultButtonText={config.defaultButtonText}
              />
              {(slug.trim() || title.trim()) && (
                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl">
                  <p className="text-[10px] text-amber-600 font-bold uppercase tracking-wider mb-2">
                    Shortcode
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="text-[10px] sm:text-xs bg-white border border-amber-200 rounded-lg px-2 py-1.5 font-mono text-amber-800 flex-1 break-all whitespace-normal leading-snug">
                      {buildAffiliateShortcode(
                        slug.trim() ? slugify(slug.trim()) : slugify(title.trim()) || 'slug',
                        extraLinks.filter(l => l.label.trim() && l.url.trim())
                      )}
                    </code>
                    <button
                      type="button"
                      onClick={copyShortcodePreview}
                      className="p-1.5 text-amber-500 hover:text-amber-700 bg-amber-100 hover:bg-amber-200 rounded-lg transition-colors shrink-0"
                      title="Copiar"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
