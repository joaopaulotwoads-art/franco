/**
 * Modal para inserir tabela comparativa de produtos afiliados no post.
 * Shortcode: [affiliate_table ids="a,b,c" badges="x||y"] (badges opcional, ordem alinhada por |)
 */
import { useState, useEffect } from 'react';
import { X, Loader2, Table2, ChevronUp, ChevronDown, Check } from 'lucide-react';
import { githubApi } from '../../lib/adminApi';
import { triggerToast } from './CmsToaster';

const PRODUCTS_PATH = 'src/data/affiliateProducts.json';

interface ProductRow {
  slug: string;
  title: string;
  image?: string;
}

const BADGE_PRESETS = [
  '',
  'Melhor Escolha',
  'Melhor Preço',
  'Mais Vendido',
  'Melhor Custo-Benefício',
  'Recomendado',
];

interface Props {
  open: boolean;
  onClose: () => void;
  onInsert: (shortcode: string) => void;
  initialShortcode?: string | null;
  isEditMode?: boolean;
}

function buildShortcode(slugs: string[], badges: string[]): string {
  const ids = slugs.map(s => s.trim()).filter(Boolean).join(', ');
  const hasAnyBadge = badges.some(b => b.trim());
  if (!hasAnyBadge) {
    return `[affiliate_table ids="${ids}"]`;
  }
  const esc = (b: string) => b.replace(/"/g, '\\"');
  const badgeStr = badges.map(b => esc(b.trim())).join('|');
  return `[affiliate_table ids="${ids}" badges="${badgeStr}"]`;
}

function parseAffiliateTableShortcodeForEdit(raw: string): { slugs: string[]; badgesBySlug: Record<string, string> } | null {
  const idsM = raw.match(/ids\s*=\s*"([^"]*)"/);
  if (!idsM) return null;
  const slugs = idsM[1].split(',').map(s => s.trim()).filter(Boolean);
  if (slugs.length < 3) return null;
  const badgesBySlug: Record<string, string> = {};
  const badgeM = raw.match(/badges\s*=\s*"((?:[^"\\]|\\.)*)"/);
  if (badgeM && slugs.length) {
    const parts = badgeM[1].split('|').map(p => p.replace(/\\"/g, '"'));
    slugs.forEach((slug, i) => {
      if (parts[i] !== undefined && String(parts[i]).trim() !== '') badgesBySlug[slug] = String(parts[i]).trim();
    });
  }
  return { slugs, badgesBySlug };
}

export default function AffiliateTableModal({
  open,
  onClose,
  onInsert,
  initialShortcode = null,
  isEditMode = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [query, setQuery] = useState('');
  const [selectedSlugs, setSelectedSlugs] = useState<string[]>([]);
  const [badgesBySlug, setBadgesBySlug] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    setQuery('');
    (async () => {
      try {
        const res = await githubApi('read', PRODUCTS_PATH);
        const list = JSON.parse(res.content) as any[];
        const rows: ProductRow[] = (Array.isArray(list) ? list : [])
          .filter((p: any) => p && p.slug && p.enabled !== false)
          .map((p: any) => ({
            slug: String(p.slug),
            title: String(p.title || p.slug),
            image: p.image,
          }));
        setProducts(rows);
        const init = initialShortcode?.trim();
        if (init) {
          const parsed = parseAffiliateTableShortcodeForEdit(init);
          if (parsed && parsed.slugs.length >= 3 && parsed.slugs.length <= 5) {
            setSelectedSlugs(parsed.slugs);
            setBadgesBySlug(parsed.badgesBySlug);
          } else {
            setSelectedSlugs([]);
            setBadgesBySlug({});
            triggerToast('Não foi possível ler esta tabela comparativa.', 'error', 160);
          }
        } else {
          setSelectedSlugs([]);
          setBadgesBySlug({});
        }
      } catch (e: any) {
        triggerToast(e?.message || 'Erro ao carregar produtos', 'error');
        setProducts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, initialShortcode]);

  const filtered = products.filter(
    p =>
      !query.trim() ||
      p.title.toLowerCase().includes(query.toLowerCase()) ||
      p.slug.toLowerCase().includes(query.toLowerCase())
  );

  const toggle = (slug: string) => {
    setSelectedSlugs(prev => {
      if (prev.includes(slug)) {
        setBadgesBySlug(b => {
          const n = { ...b };
          delete n[slug];
          return n;
        });
        return prev.filter(s => s !== slug);
      }
      if (prev.length >= 5) {
        triggerToast('No máximo 5 produtos na tabela.', 'error', 120);
        return prev;
      }
      return [...prev, slug];
    });
  };

  const move = (index: number, dir: -1 | 1) => {
    setSelectedSlugs(prev => {
      const j = index + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[j]] = [next[j], next[index]];
      return next;
    });
  };

  const setBadge = (slug: string, badge: string) => {
    setBadgesBySlug(b => ({ ...b, [slug]: badge }));
  };

  const handleInsert = () => {
    if (selectedSlugs.length < 3 || selectedSlugs.length > 5) {
      triggerToast('Selecione entre 3 e 5 produtos.', 'error', 140);
      return;
    }
    const badges = selectedSlugs.map(s => badgesBySlug[s] || '');
    const sc = buildShortcode(selectedSlugs, badges);
    onInsert(sc);
    onClose();
    triggerToast(
      isEditMode ? 'Tabela comparativa atualizada no artigo.' : 'Tabela comparativa inserida no editor.',
      'success',
      100
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden"
        role="dialog"
        aria-labelledby="aff-table-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-emerald-50 to-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
              <Table2 className="w-5 h-5" />
            </div>
            <div>
              <h2 id="aff-table-title" className="text-lg font-bold text-slate-800">
                Tabela comparativa
              </h2>
              <p className="text-xs text-slate-500">Escolha 3 a 5 produtos e um badge opcional por linha</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors"
            aria-label="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-2 text-emerald-500" />
              <span className="text-sm">Carregando produtos...</span>
            </div>
          ) : (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Buscar produto
                </label>
                <input
                  type="search"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Nome ou slug..."
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500"
                />
              </div>

              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Produtos cadastrados ({filtered.length})
                </p>
                <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100 max-h-48 overflow-y-auto">
                  {filtered.length === 0 ? (
                    <li className="p-4 text-sm text-slate-400 text-center">Nenhum produto encontrado</li>
                  ) : (
                    filtered.map(p => {
                      const sel = selectedSlugs.includes(p.slug);
                      const disabled = !sel && selectedSlugs.length >= 5;
                      return (
                        <li key={p.slug}>
                          <button
                            type="button"
                            disabled={disabled}
                            onClick={() => toggle(p.slug)}
                            className={`w-full flex items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors ${
                              sel
                                ? 'bg-emerald-50 text-emerald-900'
                                : disabled
                                  ? 'opacity-40 cursor-not-allowed'
                                  : 'hover:bg-slate-50'
                            }`}
                          >
                            {p.image ? (
                              <img
                                src={p.image}
                                alt=""
                                className="w-10 h-10 object-contain rounded-lg bg-slate-50 shrink-0"
                              />
                            ) : (
                              <div className="w-10 h-10 rounded-lg bg-slate-100 shrink-0" />
                            )}
                            <span className="flex-1 min-w-0 truncate font-medium">{p.title}</span>
                            <span className="text-[10px] font-mono text-slate-400 shrink-0">{p.slug}</span>
                            {sel && <Check className="w-4 h-4 text-emerald-600 shrink-0" />}
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Selecionados ({selectedSlugs.length}/5) — ordem das colunas na tabela
                </p>
                {selectedSlugs.length === 0 ? (
                  <p className="text-sm text-slate-400 py-6 text-center border border-dashed border-slate-200 rounded-xl">
                    Marque entre 3 e 5 produtos na lista acima
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {selectedSlugs.map((slug, i) => {
                      const p = products.find(x => x.slug === slug);
                      return (
                        <li
                          key={slug}
                          className="flex flex-wrap items-center gap-2 p-3 rounded-xl border border-slate-200 bg-slate-50/80"
                        >
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              className="p-1 rounded text-slate-500 hover:bg-white disabled:opacity-30"
                              onClick={() => move(i, -1)}
                              disabled={i === 0}
                              aria-label="Subir"
                            >
                              <ChevronUp className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              className="p-1 rounded text-slate-500 hover:bg-white disabled:opacity-30"
                              onClick={() => move(i, 1)}
                              disabled={i === selectedSlugs.length - 1}
                              aria-label="Descer"
                            >
                              <ChevronDown className="w-4 h-4" />
                            </button>
                          </div>
                          <span className="text-sm font-medium text-slate-800 flex-1 min-w-[120px] truncate">
                            {p?.title || slug}
                          </span>
                          <select
                            value={badgesBySlug[slug] ?? ''}
                            onChange={e => setBadge(slug, e.target.value)}
                            className="text-xs rounded-lg border border-slate-200 px-2 py-1.5 bg-white max-w-[200px]"
                          >
                            {BADGE_PRESETS.map(opt => (
                              <option key={opt || 'none'} value={opt}>
                                {opt || '— Sem badge —'}
                              </option>
                            ))}
                          </select>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Prévia do shortcode</p>
                <code className="text-[11px] text-slate-700 break-all">
                  {selectedSlugs.length >= 3
                    ? buildShortcode(
                        selectedSlugs,
                        selectedSlugs.map(s => badgesBySlug[s] || '')
                      )
                    : '[affiliate_table ids="..."]'}
                </code>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-200/80 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading || selectedSlugs.length < 3 || selectedSlugs.length > 5}
            onClick={handleInsert}
            className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-emerald-600/20"
          >
            {isEditMode ? 'Atualizar no artigo' : 'Inserir no artigo'}
          </button>
        </div>
      </div>
    </div>
  );
}
