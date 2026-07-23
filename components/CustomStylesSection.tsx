// =============================================================
//  나만의 스타일 관리 섹션 (SettingsPage 하위)
//
//  사용자가 이미지 생성 화면 스타일 팝업에 노출될 개인 프리셋을
//  등록·수정·삭제한다. 서비스는 services/customStyleService, 저장소는
//  Supabase user_custom_styles (migration 031) 또는 MOCK 인메모리.
//
//  상한 10 은 서비스 레이어에서도 강제하지만 UI 에서도 미리 막아 UX 를 명확히 한다.
// =============================================================

import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Palette, Plus, Pencil, Trash2, Check, X, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useModal } from './ui/ModalProvider';
import {
  listCustomStyles, createCustomStyle, updateCustomStyle, deleteCustomStyle,
  MAX_CUSTOM_STYLES, type CustomStyle,
} from '../services/customStyleService';

interface DraftForm {
  id?: string;             // 수정 중일 때 존재
  name: string;
  icon_emoji: string;
  prompt_guide: string;
}

const EMPTY_DRAFT: DraftForm = { name: '', icon_emoji: '🎨', prompt_guide: '' };

export const CustomStylesSection: React.FC = () => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const { alert, confirm } = useModal();

  const [styles, setStyles] = useState<CustomStyle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DraftForm | null>(null);
  const [saving, setSaving] = useState(false);

  const reload = useCallback(async () => {
    if (!user) { setStyles([]); return; }
    setLoading(true);
    setError(null);
    try {
      setStyles(await listCustomStyles(user.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { reload(); }, [reload]);

  const atMax = styles.length >= MAX_CUSTOM_STYLES;

  const startAdd = () => {
    if (atMax) { alert(t('settings.customStyles.atMax', { max: MAX_CUSTOM_STYLES }), { type: 'warning' }); return; }
    setDraft({ ...EMPTY_DRAFT });
  };
  const startEdit = (s: CustomStyle) => {
    setDraft({ id: s.id, name: s.name, icon_emoji: s.icon_emoji, prompt_guide: s.prompt_guide });
  };
  const cancelDraft = () => setDraft(null);

  const submitDraft = async () => {
    if (!user || !draft) return;
    setSaving(true);
    try {
      const res = draft.id
        ? await updateCustomStyle(draft.id, { name: draft.name, icon_emoji: draft.icon_emoji, prompt_guide: draft.prompt_guide })
        : await createCustomStyle(user.id, { name: draft.name, icon_emoji: draft.icon_emoji, prompt_guide: draft.prompt_guide });
      if (!res.ok) {
        await alert(res.error ?? '저장 실패', { type: 'error' });
        return;
      }
      setDraft(null);
      await reload();
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (s: CustomStyle) => {
    const ok = await confirm(t('settings.customStyles.deleteConfirm'), { type: 'warning' });
    if (!ok) return;
    const res = await deleteCustomStyle(s.id);
    if (!res.ok) { await alert(res.error ?? '삭제 실패', { type: 'error' }); return; }
    await reload();
  };

  // 이모지 하나만 남기기 (긴 문자 붙여넣기 방지)
  const setIcon = (value: string) => {
    // 단일 grapheme 만 유지. Segments 는 이터러블이라 for..of 로 첫 항목만 꺼낸다.
    // 미지원 환경(구형 브라우저)은 UTF-16 code point 로 폴백.
    let first = '';
    if (value) {
      try {
        const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
        for (const s of seg.segment(value)) { first = s.segment; break; }
      } catch {
        first = Array.from(value)[0] ?? '';
      }
    }
    setDraft((d) => (d ? { ...d, icon_emoji: first || '🎨' } : d));
  };

  return (
    <div className="bg-white border border-zinc-100 rounded-[2rem] p-8">
      <div className="flex items-center gap-3 mb-2">
        <Palette className="w-7 h-7 text-primary" />
        <h2 className="text-2xl font-black tracking-tight text-zinc-900">
          {t('settings.customStyles.title')}
        </h2>
        <span className="ml-auto text-xs text-zinc-400 tabular-nums">
          {t('settings.customStyles.counter', { count: styles.length, max: MAX_CUSTOM_STYLES })}
        </span>
      </div>
      <p className="text-sm text-zinc-500 mb-6">
        {t('settings.customStyles.subtitle', { max: MAX_CUSTOM_STYLES })}
      </p>

      {!user && (
        <div className="text-sm text-zinc-500 py-8 text-center">
          {t('settings.customStyles.signInRequired')}
        </div>
      )}

      {user && (
        <>
          {loading && (
            <div className="text-sm text-zinc-500 py-6 text-center flex items-center justify-center gap-2">
              <RefreshCw size={14} className="animate-spin" /> {t('settings.customStyles.loading')}
            </div>
          )}
          {error && !loading && (
            <div className="text-sm text-red-600 py-4">{t('settings.customStyles.loadError')} — {error}</div>
          )}

          {!loading && !error && styles.length === 0 && !draft && (
            <div className="text-sm text-zinc-500 py-8 text-center border border-dashed border-zinc-200 rounded-2xl">
              {t('settings.customStyles.empty')}
            </div>
          )}

          {!loading && styles.length > 0 && (
            <ul className="space-y-2 mb-4">
              {styles.map((s) => (
                <li
                  key={s.id}
                  className="flex items-start gap-3 p-4 rounded-2xl border border-zinc-200 hover:border-primary/40 transition-colors"
                >
                  <span className="text-2xl leading-none shrink-0 mt-0.5">{s.icon_emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-zinc-900 truncate">{s.name}</div>
                    <div className="text-[11px] text-zinc-500 line-clamp-2 mt-0.5">{s.prompt_guide}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(s)}
                      className="p-2 rounded-lg text-zinc-500 hover:text-primary hover:bg-primary/10 transition-colors"
                      aria-label={t('settings.customStyles.edit')}
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(s)}
                      className="p-2 rounded-lg text-zinc-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                      aria-label={t('settings.customStyles.delete')}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {/* 추가/수정 폼 */}
          {draft && (
            <div className="border border-primary/30 bg-primary/5 rounded-2xl p-5 space-y-3 mb-4">
              <div className="flex gap-3">
                <div className="w-20 shrink-0">
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1">
                    {t('settings.customStyles.iconLabel')}
                  </label>
                  <input
                    type="text"
                    value={draft.icon_emoji}
                    onChange={(e) => setIcon(e.target.value)}
                    className="w-full text-center text-2xl px-2 py-2 bg-white border border-zinc-200 rounded-xl outline-none focus:border-primary"
                    aria-label={t('settings.customStyles.iconHint')}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-[10px] font-bold text-zinc-500 mb-1">
                    {t('settings.customStyles.nameLabel')}
                  </label>
                  <input
                    type="text"
                    value={draft.name}
                    onChange={(e) => setDraft((d) => (d ? { ...d, name: e.target.value } : d))}
                    placeholder={t('settings.customStyles.namePlaceholder')}
                    className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:border-primary"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[10px] font-bold text-zinc-500 mb-1">
                  {t('settings.customStyles.promptLabel')}
                </label>
                <textarea
                  value={draft.prompt_guide}
                  onChange={(e) => setDraft((d) => (d ? { ...d, prompt_guide: e.target.value } : d))}
                  placeholder={t('settings.customStyles.promptPlaceholder')}
                  rows={3}
                  className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-xl text-sm outline-none focus:border-primary resize-none"
                />
                <p className="text-[10px] text-zinc-400 mt-1">{t('settings.customStyles.promptHint')}</p>
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={cancelDraft}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full text-zinc-500 hover:bg-zinc-100 text-sm font-bold transition-colors"
                >
                  <X size={14} /> {t('settings.customStyles.cancel')}
                </button>
                <button
                  type="button"
                  onClick={submitDraft}
                  disabled={saving || !draft.name.trim() || !draft.prompt_guide.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-primary hover:bg-[#003E99] disabled:bg-zinc-200 disabled:text-zinc-400 text-white text-sm font-bold transition-colors"
                >
                  {saving ? <RefreshCw size={14} className="animate-spin" /> : <Check size={14} />}
                  {t('settings.customStyles.save')}
                </button>
              </div>
            </div>
          )}

          {!draft && (
            <button
              type="button"
              onClick={startAdd}
              disabled={atMax}
              className="flex items-center justify-center gap-2 w-full py-3 rounded-2xl border-2 border-dashed border-zinc-200 hover:border-primary/40 disabled:border-zinc-100 disabled:text-zinc-300 text-zinc-500 text-sm font-bold transition-colors"
            >
              <Plus size={16} /> {t('settings.customStyles.add')}
            </button>
          )}
        </>
      )}
    </div>
  );
};
