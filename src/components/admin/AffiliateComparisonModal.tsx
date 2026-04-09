/**
 * Top Comparação — 3 cards verticais com badge, subtítulo e specs (shortcode + data base64).
 * [affiliate_comparison ids="a,b,c" data="..."]
 */
import { useState, useEffect } from 'react';
import { X, Loader2, Columns3 } from 'lucide-react';
import { githubApi } from '../../lib/adminApi';
import { triggerToast } from './CmsToaster';

const PRODUCTS_PATH = 'src/data/affiliateProducts.json';

interface ProductRow {
  slug: string;
  title: string;
  image?: string;
}

export interface ComparisonPayload {
  badges: [string, string, string];
  subtitles: [string, string, string];
  specs: [string[], string[], string[]];
}

interface Props {
  open: boolean;
  onClose: () => void;
  onInsert: (shortcode: string) => void;
  /** Shortcode completo colado no artigo — pré-preenche o formulário ao editar */
  initialShortcode?: string | null;
  /** true = substituindo bloco existente (texto do botão / toast) */
  isEditMode?: boolean;
}

const BADGE_PRESETS = [
  '',
  'Melhor Escolha',
  'Melhor Performance',
  'Mais Barato',
  'Melhor Custo-Benefício',
  'Recomendado',
];

function encodeData(payload: ComparisonPayload): string {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function buildShortcode(slugs: string[], payload: ComparisonPayload): string {
  const ids = slugs.map(s => s.trim()).join(', ');
  const data = encodeData(payload);
  const hasExtras =
    payload.badges.some(Boolean) ||
    payload.subtitles.some(Boolean) ||
    payload.specs.some(arr => arr.some(Boolean));
  if (!hasExtras) {
    return `[affiliate_comparison ids="${ids}"]`;
  }
  return `[affiliate_comparison ids="${ids}" data="${data}"]`;
}

function decodeDataAttr(data: string): ComparisonPayload | null {
  try {
    let b64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4;
    if (pad) b64 += '='.repeat(4 - pad);
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const json = new TextDecoder().decode(bytes);
    const o = JSON.parse(json) as Partial<ComparisonPayload>;
    return {
      badges: (o.badges as string[] | undefined)?.length === 3
        ? (o.badges as [string, string, string])
        : ['', '', ''],
      subtitles: (o.subtitles as string[] | undefined)?.length === 3
        ? (o.subtitles as [string, string, string])
        : ['', '', ''],
      specs:
        Array.isArray(o.specs) && o.specs.length === 3
          ? (o.specs as [string[], string[], string[]])
          : [[], [], []],
    };
  } catch {
    return null;
  }
}

function padSpecLines(lines: string[]): string[] {
  const a = [...lines];
  while (a.length < 4) a.push('');
  return a.slice(0, 4);
}

/** Para reabrir o modal a partir do shortcode já colado no artigo. */
export function parseAffiliateComparisonShortcodeForEdit(raw: string): {
  slugs: [string, string, string];
  payload: ComparisonPayload;
} | null {
  const idsM = raw.match(/ids\s*=\s*"([^"]*)"/);
  if (!idsM) return null;
  const parts = idsM[1].split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length !== 3) return null;
  const slugs = [parts[0], parts[1], parts[2]] as [string, string, string];
  const dataM = raw.match(/data\s*=\s*"([^"]*)"/);
  let payload: ComparisonPayload = {
    badges: ['', '', ''],
    subtitles: ['', '', ''],
    specs: [[], [], []],
  };
  if (dataM?.[1]) {
    const decoded = decodeDataAttr(dataM[1]);
    if (decoded) payload = decoded;
  }
  return {
    slugs,
    payload: {
      badges: [payload.badges[0] ?? '', payload.badges[1] ?? '', payload.badges[2] ?? ''] as [
        string,
        string,
        string,
      ],
      subtitles: [payload.subtitles[0] ?? '', payload.subtitles[1] ?? '', payload.subtitles[2] ?? ''] as [
        string,
        string,
        string,
      ],
      specs: [
        padSpecLines(payload.specs[0] || []),
        padSpecLines(payload.specs[1] || []),
        padSpecLines(payload.specs[2] || []),
      ] as [string[], string[], string[]],
    },
  };
}

function emptySpecs(): string[] {
  return ['', '', '', ''];
}

export default function AffiliateComparisonModal({
  open,
  onClose,
  onInsert,
  initialShortcode = null,
  isEditMode = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [query, setQuery] = useState('');
  const [slugs, setSlugs] = useState<[string, string, string]>(['', '', '']);
  const [badges, setBadges] = useState<[string, string, string]>(['', '', '']);
  const [subtitles, setSubtitles] = useState<[string, string, string]>(['', '', '']);
  const [specs, setSpecs] = useState<[string[], string[], string[]]>([
    emptySpecs(),
    emptySpecs(),
    emptySpecs(),
  ]);

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
          const parsed = parseAffiliateComparisonShortcodeForEdit(init);
          if (parsed) {
            setSlugs(parsed.slugs);
            setBadges(parsed.payload.badges);
            setSubtitles(parsed.payload.subtitles);
            setSpecs(parsed.payload.specs);
          } else {
            setSlugs(['', '', '']);
            setBadges(['', '', '']);
            setSubtitles(['', '', '']);
            setSpecs([emptySpecs(), emptySpecs(), emptySpecs()]);
            triggerToast('Não foi possível ler este bloco de Top Comparação.', 'error', 160);
          }
        } else {
          setSlugs(['', '', '']);
          setBadges(['', '', '']);
          setSubtitles(['', '', '']);
          setSpecs([emptySpecs(), emptySpecs(), emptySpecs()]);
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

  const setSlug = (i: 0 | 1 | 2, slug: string) => {
    setSlugs(s => {
      const n = [...s] as [string, string, string];
      n[i] = slug;
      return n;
    });
  };

  const setBadge = (i: 0 | 1 | 2, v: string) => {
    setBadges(b => {
      const n = [...b] as [string, string, string];
      n[i] = v;
      return n;
    });
  };

  const setSubtitle = (i: 0 | 1 | 2, v: string) => {
    setSubtitles(s => {
      const n = [...s] as [string, string, string];
      n[i] = v;
      return n;
    });
  };

  const setSpec = (card: 0 | 1 | 2, line: number, v: string) => {
    setSpecs(prev => {
      const copy: [string[], string[], string[]] = [
        [...prev[0]],
        [...prev[1]],
        [...prev[2]],
      ];
      copy[card][line] = v;
      return copy;
    });
  };

  const handleInsert = () => {
    if (!slugs[0] || !slugs[1] || !slugs[2]) {
      triggerToast('Selecione um produto em cada uma das 3 colunas.', 'error', 140);
      return;
    }
    const payload: ComparisonPayload = {
      badges: [...badges] as [string, string, string],
      subtitles: [...subtitles] as [string, string, string],
      specs: [
        specs[0].map(s => s.trim()).filter(Boolean),
        specs[1].map(s => s.trim()).filter(Boolean),
        specs[2].map(s => s.trim()).filter(Boolean),
      ] as [string[], string[], string[]],
    };
    for (let c = 0; c < 3; c++) {
      const arr = payload.specs[c];
      const count = arr.length;
      if (count === 0) continue;
      if (count < 3 || count > 4) {
        triggerToast(`Card ${c + 1}: use entre 3 e 4 características (ou deixe as quatro linhas vazias).`, 'error', 180);
        return;
      }
    }
    const sc = buildShortcode([slugs[0], slugs[1], slugs[2]], payload);
    onInsert(sc);
    onClose();
    triggerToast(
      isEditMode ? 'Top Comparação atualizada no artigo.' : 'Bloco Top Comparação inserido.',
      'success',
      100
    );
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl my-4 flex flex-col overflow-hidden"
        role="dialog"
        aria-labelledby="aff-comp-title"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-gradient-to-r from-violet-50 to-indigo-50 shrink-0">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-violet-100 text-violet-700">
              <Columns3 className="w-5 h-5" />
            </div>
            <div>
              <h2 id="aff-comp-title" className="text-lg font-bold text-slate-800">
                Top Comparação
              </h2>
              <p className="text-xs text-slate-500">3 produtos + badge, subtítulo e 3–4 specs por card</p>
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

        <div className="flex-1 overflow-y-auto p-5 space-y-5 max-h-[calc(100vh-12rem)]">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin mb-2 text-violet-500" />
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
                  className="w-full rounded-xl border border-slate-200 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                />
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {([0, 1, 2] as const).map(i => (
                  <div
                    key={i}
                    className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4 space-y-3 shadow-sm"
                  >
                    <p className="text-xs font-extrabold text-violet-700 uppercase tracking-wider">
                      Card {i + 1}
                    </p>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Produto *
                      </label>
                      <select
                        value={slugs[i]}
                        onChange={e => setSlug(i, e.target.value)}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                      >
                        <option value="">Selecionar...</option>
                        {filtered.map(p => (
                          <option key={`${i}-${p.slug}`} value={p.slug}>
                            {p.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Badge superior
                      </label>
                      <input
                        type="text"
                        list={`aff-comp-badge-${i}`}
                        value={badges[i]}
                        onChange={e => setBadge(i, e.target.value)}
                        placeholder="Ex.: Melhor Escolha"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                      />
                      <datalist id={`aff-comp-badge-${i}`}>
                        {BADGE_PRESETS.filter(Boolean).map(opt => (
                          <option key={opt} value={opt} />
                        ))}
                      </datalist>
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Subtítulo
                      </label>
                      <input
                        type="text"
                        value={subtitles[i]}
                        onChange={e => setSubtitle(i, e.target.value)}
                        placeholder="Ex.: A melhor para vídeos"
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                        Características (3 a 4 linhas)
                      </label>
                      {[0, 1, 2, 3].map(line => (
                        <input
                          key={line}
                          type="text"
                          value={specs[i][line] || ''}
                          onChange={e => setSpec(i, line, e.target.value)}
                          placeholder={`Spec ${line + 1}`}
                          className="w-full rounded-lg border border-slate-200 px-2 py-1.5 text-xs mb-1.5 bg-white"
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>

              <div className="rounded-xl bg-slate-100 border border-slate-200 px-3 py-2">
                <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Prévia do shortcode</p>
                <code className="text-[10px] text-slate-700 break-all block">
                  {buildShortcode(
                    [slugs[0] || 'slug-1', slugs[1] || 'slug-2', slugs[2] || 'slug-3'],
                    {
                      badges,
                      subtitles,
                      specs: specs.map(s => s.map(x => x.trim()).filter(Boolean)) as [
                        string[],
                        string[],
                        string[],
                      ],
                    }
                  )}
                </code>
              </div>
            </>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-100 bg-slate-50 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-slate-600 hover:bg-slate-200/80 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={loading || !slugs[0] || !slugs[1] || !slugs[2]}
            onClick={handleInsert}
            className="px-5 py-2 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed shadow-md shadow-violet-600/20"
          >
            {isEditMode ? 'Atualizar no artigo' : 'Inserir no artigo'}
          </button>
        </div>
      </div>
    </div>
  );
}
