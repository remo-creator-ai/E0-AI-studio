import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Search, X, ImagePlus, Trash2, Pencil, Package, Sparkles } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useStore } from '../store';
import { ProjectStep } from '../types';
import { useModal } from './ui/ModalProvider';
import {
  listAssets, getAsset, createAsset, updateAsset, deleteAsset,
  addAssetFiles, deleteAssetFile, countLinkedProjects,
  validateFile, maxReferenceCount, ASSET_TYPES,
  type Asset, type AssetType, type AssetFile, type NewAssetFile,
} from '../services/assetService';

const TYPE_BADGE: Record<AssetType, string> = {
  character: 'bg-[#E5EDFA] text-[#003E99] border-[#C0D4F0]',
  product:   'bg-emerald-50 text-emerald-700 border-emerald-200',
  logo:      'bg-amber-50 text-amber-700 border-amber-200',
  image:     'bg-zinc-100 text-zinc-600 border-zinc-200',
};

/* ============================= Library ============================= */
export const AssetLibrary: React.FC = () => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [type, setType] = useState<AssetType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');
  const [showCreate, setShowCreate] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setAssets(await listAssets(user.id, { type, search, sort }));
    setLoading(false);
  }, [user, type, search, sort]);
  useEffect(() => { load(); }, [load]);

  const typeChip = (val: AssetType | 'all') => (
    <button
      key={val}
      onClick={() => setType(val)}
      className={`px-3.5 py-1.5 rounded-full text-sm font-bold border transition-all ${
        type === val ? 'bg-primary border-primary text-white' : 'bg-white border-zinc-200 text-zinc-600 hover:border-primary/40'
      }`}
    >
      {t(`assets.types.${val}`)}
    </button>
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-4xl font-black tracking-tighter text-zinc-900">{t('assets.title')}</h1>
          <p className="text-sm text-zinc-500 mt-1.5">{t('assets.subtitle')}</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="flex items-center gap-2 px-5 py-3 bg-primary hover:bg-[#003E99] text-white rounded-full font-bold text-sm transition-all active:scale-95 shadow-[0_8px_20px_rgba(0,80,191,0.25)]"
        >
          <Plus size={16} /> {t('assets.new')}
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex gap-2 flex-wrap">{(['all', ...ASSET_TYPES] as const).map(typeChip)}</div>
        <div className="flex-1" />
        <div className="relative">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
          <input
            value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder={t('assets.search')}
            className="pl-9 pr-3 py-2 rounded-xl border border-zinc-200 text-sm outline-none focus:border-primary w-48"
          />
        </div>
        <select
          value={sort} onChange={(e) => setSort(e.target.value as 'recent' | 'name')}
          className="px-3 py-2 rounded-xl border border-zinc-200 text-sm outline-none focus:border-primary bg-white"
        >
          <option value="recent">{t('assets.sortRecent')}</option>
          <option value="name">{t('assets.sortName')}</option>
        </select>
      </div>

      {/* Grid / Empty */}
      {loading ? (
        <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : assets.length === 0 ? (
        <div className="text-center py-20">
          <Package size={40} className="text-zinc-300 mx-auto mb-3" />
          <p className="text-sm font-bold text-zinc-500">{t('assets.empty')}</p>
          <p className="text-xs text-zinc-400 mt-1">{t('assets.emptyHint')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
          {assets.map((a) => (
            <button
              key={a.id} onClick={() => setDetailId(a.id)}
              className="text-left bg-white border border-zinc-150 rounded-2xl overflow-hidden hover:border-primary/40 hover:shadow-lg transition-all active:scale-[0.98]"
            >
              <div className="aspect-square bg-zinc-100 flex items-center justify-center overflow-hidden">
                {a.primary_url
                  ? <img src={a.primary_url} alt={a.name} className="w-full h-full object-contain" />
                  : <ImagePlus size={28} className="text-zinc-300" />}
              </div>
              <div className="p-3">
                <div className="flex items-center gap-1.5">
                  <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-bold border ${TYPE_BADGE[a.asset_type]}`}>
                    {t(`assets.types.${a.asset_type}`)}
                  </span>
                </div>
                <p className="text-sm font-bold text-zinc-800 truncate mt-1.5">{a.name}</p>
                {a.description && (
                  <p className="text-[11px] text-zinc-500 mt-1 line-clamp-2 leading-snug" title={a.description}>
                    {a.description}
                  </p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}

      {showCreate && <CreateAssetModal onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />}
      {detailId && (
        <AssetDetailModal
          id={detailId} onClose={() => setDetailId(null)}
          onChanged={load} onDeleted={() => { setDetailId(null); load(); }}
        />
      )}
    </div>
  );
};

/* ============================= Create Modal ============================= */
const CreateAssetModal: React.FC<{ onClose: () => void; onDone: () => void }> = ({ onClose, onDone }) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [assetType, setAssetType] = useState<AssetType>('character');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [primary, setPrimary] = useState<File | null>(null);
  const [refs, setRefs] = useState<File[]>([]);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const maxRef = maxReferenceCount(assetType);
  const isMulti = maxRef > 0;

  const pick = (setter: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = '';
    if (!f) return;
    const v = validateFile(f);
    if (v) { setError(v); return; }
    setError(''); setter(f);
  };

  const submit = async () => {
    if (!user || saving) return;
    if (!primary) { setError(t('assets.create.needPrimary')); return; }
    setSaving(true); setError('');
    const files: NewAssetFile[] = [{ file: primary, role: 'primary' }, ...(isMulti ? refs.map((f) => ({ file: f, role: 'reference' as const })) : [])];
    const res = await createAsset(user.id, { asset_type: assetType, name, description }, files);
    setSaving(false);
    if (!res.ok) { setError(res.error ?? ''); return; }
    onDone();
  };

  return (
    <ModalWrap onClose={onClose} title={t('assets.create.title')}>
      {/* 분류 */}
      <label className="text-xs font-bold text-zinc-600">{t('assets.create.typeLabel')}</label>
      <div className="flex gap-2 flex-wrap mt-1.5 mb-4">
        {ASSET_TYPES.map((ty) => (
          <button key={ty} onClick={() => { setAssetType(ty); setRefs([]); }}
            className={`px-3 py-1.5 rounded-full text-sm font-bold border transition-all ${assetType === ty ? 'bg-primary border-primary text-white' : 'bg-white border-zinc-200 text-zinc-600 hover:border-primary/40'}`}>
            {t(`assets.types.${ty}`)}
          </button>
        ))}
      </div>

      <label className="text-xs font-bold text-zinc-600">{t('assets.create.nameLabel')}</label>
      <input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('assets.create.namePlaceholder')}
        className="mt-1.5 mb-4 w-full px-4 py-3 rounded-2xl border border-zinc-200 text-sm outline-none focus:border-primary" />

      <label className="text-xs font-bold text-zinc-600">{t('assets.create.descLabel')}</label>
      <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder={t('assets.create.descPlaceholder')}
        className="mt-1.5 mb-4 w-full px-4 py-3 rounded-2xl border border-zinc-200 text-sm outline-none focus:border-primary resize-none" />

      {/* 대표 이미지 */}
      <label className="text-xs font-bold text-zinc-600">{t('assets.create.primary')}
        <span className="text-zinc-400 font-normal ml-1">· {isMulti ? t('assets.create.primaryHint') : t('assets.create.singleHint')}</span>
      </label>
      <div className="mt-1.5 mb-4">
        {primary ? (
          <div className="relative w-24 h-24 rounded-xl overflow-hidden border border-zinc-200">
            <img src={URL.createObjectURL(primary)} alt="" className="w-full h-full object-contain" />
            <button onClick={() => setPrimary(null)} className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full text-white flex items-center justify-center"><X size={12} /></button>
          </div>
        ) : (
          <label className="w-24 h-24 rounded-xl border-2 border-dashed border-zinc-200 hover:border-primary/40 flex items-center justify-center cursor-pointer transition-all">
            <ImagePlus size={20} className="text-zinc-400" />
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick(setPrimary)} />
          </label>
        )}
      </div>

      {/* 참고 이미지 (캐릭터·제품) */}
      {isMulti && (
        <>
          <label className="text-xs font-bold text-zinc-600">{t('assets.create.reference')}
            <span className="text-zinc-400 font-normal ml-1">· {t('assets.create.referenceHint', { count: maxRef })}</span>
          </label>
          <div className="mt-1.5 mb-4 flex gap-2 flex-wrap">
            {refs.map((f, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border border-zinc-200">
                <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-contain" />
                <button onClick={() => setRefs(refs.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full text-white flex items-center justify-center"><X size={10} /></button>
              </div>
            ))}
            {refs.length < maxRef && (
              <label className="w-16 h-16 rounded-lg border-2 border-dashed border-zinc-200 hover:border-primary/40 flex items-center justify-center cursor-pointer transition-all">
                <Plus size={16} className="text-zinc-400" />
                <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={pick((f) => setRefs((r) => [...r, f]))} />
              </label>
            )}
          </div>
        </>
      )}

      {error && <p className="text-xs font-semibold text-red-500 mb-3">{error}</p>}
      <button onClick={submit} disabled={saving || !name.trim() || !primary}
        className="w-full py-3.5 bg-primary hover:bg-[#003E99] disabled:bg-zinc-200 disabled:text-zinc-400 text-white rounded-full font-black text-sm transition-all active:scale-[0.98]">
        {saving ? t('assets.create.submitting') : t('assets.create.submit')}
      </button>
    </ModalWrap>
  );
};

/* ============================= Detail Modal ============================= */
const AssetDetailModal: React.FC<{ id: string; onClose: () => void; onChanged: () => void; onDeleted: () => void }> = ({ id, onClose, onChanged, onDeleted }) => {
  const { t } = useTranslation();
  const { confirm } = useModal();
  const user = useAuthStore((s) => s.user);
  const setStep = useStore((s) => s.setStep);
  const setPendingRef = useStore((s) => s.setPendingImageStudioRef);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const a = await getAsset(id);
    setAsset(a);
    if (a) { setName(a.name); setDesc(a.description); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  const save = async () => {
    setBusy(true);
    await updateAsset(id, { name, description: desc });
    setBusy(false); setEditing(false);
    await load(); onChanged();
  };

  const del = async () => {
    const n = await countLinkedProjects(id);
    const msg = n > 0 ? t('assets.detail.deleteLinked', { count: n }) : t('assets.detail.deleteConfirm');
    if (!(await confirm(msg, { type: 'warning' }))) return;
    setBusy(true);
    await deleteAsset(id);
    setBusy(false);
    onDeleted();
  };

  const addRef = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; e.target.value = '';
    if (!f || !user) return;
    const v = validateFile(f); if (v) return;
    setBusy(true);
    await addAssetFiles(user.id, id, [{ file: f, role: 'reference' }]);
    setBusy(false);
    await load(); onChanged();
  };

  const delFile = async (file: AssetFile) => {
    setBusy(true);
    await deleteAssetFile(file.id, file.storage_path);
    setBusy(false);
    await load(); onChanged();
  };

  const isMulti = asset ? maxReferenceCount(asset.asset_type) > 0 : false;
  const refs = asset?.files.filter((f) => f.file_role === 'reference') ?? [];

  // "여기서부터 생성" — 이 자산을 참고 이미지로 preload 한 채 이미지 생성 화면으로 이동.
  // 실제 dataUrl 변환은 ImageStudio 마운트 useEffect 가 담당한다 (모듈 격리 유지).
  const generateFromHere = () => {
    if (!asset?.primary_url) return;
    setPendingRef({ assetId: asset.id, primaryUrl: asset.primary_url, name: asset.name });
    setStep(ProjectStep.IMAGE_STUDIO);
    onClose();
  };

  return (
    <ModalWrap onClose={onClose} title={asset ? asset.name : ''} size="wide">
      {!asset ? (
        <div className="flex justify-center py-10"><div className="w-8 h-8 border-4 border-primary/20 border-t-primary rounded-full animate-spin" /></div>
      ) : (
        <>
          <div className="flex items-center gap-1.5 mb-4">
            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${TYPE_BADGE[asset.asset_type]}`}>{t(`assets.types.${asset.asset_type}`)}</span>
          </div>

          {/* 대표 이미지 — aspect 강제하지 않고 자연 비율 유지, 최대 60vh 로 캡 */}
          <div className="bg-zinc-100 rounded-2xl overflow-hidden flex items-center justify-center mb-4">
            {asset.primary_url
              ? <img src={asset.primary_url} alt="" className="max-w-full max-h-[60vh] w-auto h-auto object-contain" />
              : <div className="w-full aspect-video flex items-center justify-center"><ImagePlus size={32} className="text-zinc-300" /></div>}
          </div>

          {/* 참고 이미지 (캐릭터·제품) */}
          {isMulti && (
            <div className="flex gap-2 flex-wrap mb-4">
              {refs.map((f) => (
                <div key={f.id} className="relative w-16 h-16 rounded-lg overflow-hidden border border-zinc-200">
                  <img src={f.url} alt="" className="w-full h-full object-contain" />
                  <button onClick={() => delFile(f)} disabled={busy} className="absolute top-0.5 right-0.5 w-4 h-4 bg-black/60 rounded-full text-white flex items-center justify-center"><X size={10} /></button>
                </div>
              ))}
              {refs.length < maxReferenceCount(asset.asset_type) && (
                <label className="w-16 h-16 rounded-lg border-2 border-dashed border-zinc-200 hover:border-primary/40 flex items-center justify-center cursor-pointer">
                  <Plus size={16} className="text-zinc-400" />
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={addRef} />
                </label>
              )}
            </div>
          )}

          {/* 이름·설명(프롬프트) */}
          {editing ? (
            <div className="space-y-3 mb-4">
              <div>
                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">
                  {t('assets.detail.nameLabel')}
                </label>
                <input value={name} onChange={(e) => setName(e.target.value)} className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-sm outline-none focus:border-primary" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">
                  {t('assets.detail.descLabel')}
                </label>
                <textarea value={desc} onChange={(e) => setDesc(e.target.value)} rows={3} className="w-full px-4 py-2.5 rounded-xl border border-zinc-200 text-sm outline-none focus:border-primary resize-none" />
              </div>
            </div>
          ) : (
            <div className="mb-4">
              <div className="text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-1">
                {t('assets.detail.descLabel')}
              </div>
              <p className="text-sm text-zinc-700 whitespace-pre-line leading-relaxed">{asset.description || '—'}</p>
            </div>
          )}

          {/* 액션 */}
          {editing ? (
            <div className="flex gap-2">
              <button onClick={save} disabled={busy} className="flex-1 py-2.5 bg-primary hover:bg-[#003E99] text-white rounded-full font-bold text-sm disabled:opacity-50">{t('assets.detail.save')}</button>
              <button onClick={() => { setEditing(false); setName(asset.name); setDesc(asset.description); }} className="px-5 py-2.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-600 rounded-full font-bold text-sm">{t('assets.detail.cancel')}</button>
            </div>
          ) : (
            <div className="space-y-2">
              {/* 주 액션: 이 자산으로 이미지 생성 */}
              <button
                onClick={generateFromHere}
                disabled={!asset.primary_url}
                className="w-full flex items-center justify-center gap-2 py-3 bg-primary hover:bg-[#003E99] disabled:bg-zinc-200 disabled:text-zinc-400 text-white rounded-full font-black text-sm transition-colors"
              >
                <Sparkles size={16} /> {t('assets.detail.generateFromHere')}
              </button>
              {/* 보조 액션 */}
              <div className="flex gap-2">
                <button onClick={() => setEditing(true)} className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-700 rounded-full font-bold text-sm"><Pencil size={14} /> {t('assets.detail.edit')}</button>
                <button onClick={del} disabled={busy} className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-white border border-red-200 hover:bg-red-50 text-red-500 rounded-full font-bold text-sm disabled:opacity-50"><Trash2 size={14} /> {t('assets.detail.delete')}</button>
              </div>
            </div>
          )}
        </>
      )}
    </ModalWrap>
  );
};

/* ============================= Modal wrapper ============================= */
const ModalWrap: React.FC<{
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'default' | 'wide';   // 'wide' = 상세 모달(이미지를 크게 보여주기 위한 폭)
}> = ({ title, onClose, children, size = 'default' }) => (
  <div className="fixed inset-0 z-[230] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-md"
    onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <div className={`relative bg-white border border-zinc-200 rounded-[2rem] w-full shadow-2xl flex flex-col max-h-[92vh] ${
      size === 'wide' ? 'max-w-3xl' : 'max-w-lg'
    }`}>
      <div className="flex items-center justify-between p-6 pb-4 shrink-0">
        <h2 className="text-lg font-black tracking-tight text-zinc-900 truncate pr-4">{title}</h2>
        <button onClick={onClose} className="p-2 hover:bg-zinc-100 rounded-xl transition-all shrink-0"><X size={18} className="text-zinc-400" /></button>
      </div>
      <div className="px-6 pb-6 overflow-y-auto custom-scrollbar">{children}</div>
    </div>
  </div>
);
