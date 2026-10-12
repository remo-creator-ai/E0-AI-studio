// =============================================================
//  전문가 의뢰 모달 (Phase 7)
//
//  기존 ProductionStep 내부에 인라인으로 묻혀 있던 "제작 의뢰" 폼을 꺼내
//  독립 컴포넌트로 재구성. 업로드 → production_requests insert →
//  send-production-request Edge Function 호출까지 한 흐름에서 처리한다.
//
//  Storage 버킷: production-attachments (migration 024)
//  DB: production_requests (migration 008/009), status CHECK 는
//      pending | in_progress | completed | cancelled 4종만 허용.
// =============================================================

import React, { useMemo, useRef, useState } from 'react';
import {
  X, Send, Loader2, CheckCircle2, Paperclip, FileJson, Image as ImageIcon,
  Film, LayoutGrid, Check, AlertCircle,
} from 'lucide-react';
import { useStore } from '../store';
import { useAuthStore } from '../store/authStore';
import { supabase } from '../lib/supabase';
import { MOCK_MODE } from '../lib/mockAuth';
import { sceneImageToBlob } from '../services/imageUtils';
import { track } from '../lib/analytics';

// 사용자 요청: 서비스 옵션이 너무 많아 지금은 하나만 노출.
// 추후 부가 서비스(사운드·자막·리사이즈 등)가 실제 제공 준비되면 배열에 추가.
const SERVICES = [
  { id: 'video', label: '완성 영상 제작', desc: '씬 편집 · 트랜지션 · 최종 렌더링' },
] as const;

const MAX_FILE_SIZE = 20 * 1024 * 1024;

interface CommissionModalProps {
  open: boolean;
  onClose: () => void;
}

export const CommissionModal: React.FC<CommissionModalProps> = ({ open, onClose }) => {
  const project = useStore((s) => s.project);
  const { user } = useAuthStore();

  const [selected, setSelected] = useState<string[]>(['video']);
  const [notes, setNotes] = useState('');
  const [name, setName] = useState(
    user?.user_metadata?.full_name || user?.user_metadata?.name || '',
  );
  const [email, setEmail] = useState(user?.email || '');
  const [extraFiles, setExtraFiles] = useState<File[]>([]);
  const [phase, setPhase] = useState<'form' | 'sending' | 'done'>('form');
  const [progress, setProgress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [emailFailed, setEmailFailed] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const attachments = useMemo(() => {
    const sheets = (project?.grid_images || []).filter(Boolean).length;
    const images = (project?.scenes || []).filter((s) => s.image_url).length;
    const videos = (project?.scenes || []).filter((s) => s.video_url).length;
    return { sheets, images, videos, scenes: project?.scenes.length || 0 };
  }, [project]);

  if (!open || !project) return null;

  const toggle = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const pickFiles = (files: File[]) => {
    const oversized = files.filter((f) => f.size > MAX_FILE_SIZE);
    if (oversized.length > 0) {
      setError(`20MB 를 넘는 파일은 첨부할 수 없습니다: ${oversized.map((f) => f.name).join(', ')}`);
    }
    setExtraFiles((cur) => [...cur, ...files.filter((f) => f.size <= MAX_FILE_SIZE)]);
  };

  const submit = async () => {
    const services = SERVICES.filter((s) => selected.includes(s.id));
    if (services.length === 0) {
      setError('원하는 서비스를 하나 이상 선택해주세요.');
      return;
    }
    if (!name.trim()) {
      setError('연락받을 담당자 이름을 입력해주세요.');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError('연락받을 이메일 주소를 정확히 입력해주세요.');
      return;
    }

    setError(null);
    setEmailFailed(false);
    setPhase('sending');

    if (MOCK_MODE) {
      setProgress('디자인(가계정) 모드 — 실제 발송 없이 완료 처리합니다.');
      setPhase('done');
      return;
    }

    try {
      const basePath = `production-requests/${project.id}/${Date.now()}`;
      const bucket = supabase.storage.from('production-attachments');
      const uploadWarnings: string[] = [];

      // 1. 스토리보드 · 스크립트 (프로젝트 JSON)
      setProgress('스토리보드 · 스크립트 업로드 중...');
      let storyboardUrl: string | null = null;
      const projectBlob = new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' });
      const sb = await bucket.upload(`${basePath}/storyboard.json`, projectBlob);
      if (sb.error) uploadWarnings.push(`스토리보드: ${sb.error.message}`);
      else storyboardUrl = bucket.getPublicUrl(sb.data.path).data.publicUrl;

      // 2. 스토리보드 시트 + 씬 이미지 ZIP
      setProgress('이미지 에셋 압축 · 업로드 중...');
      let assetsUrl: string | null = null;
      if (attachments.sheets > 0 || attachments.images > 0) {
        const JSZip = (await import('jszip')).default;
        const zip = new JSZip();
        const sheetFolder = zip.folder('storyboard');
        const sceneFolder = zip.folder('scenes');
        for (const [idx, sheet] of (project.grid_images || []).entries()) {
          if (!sheet) continue;
          const blob = await sceneImageToBlob(sheet);
          if (blob) sheetFolder?.file(`Sheet_${String(idx + 1).padStart(2, '0')}.png`, blob);
        }
        for (const [idx, scene] of project.scenes.entries()) {
          if (!scene.image_url) continue;
          const blob = await sceneImageToBlob(scene.image_url);
          if (blob) sceneFolder?.file(`Cut_${String(idx + 1).padStart(2, '0')}.png`, blob);
        }
        const zipBlob = await zip.generateAsync({ type: 'blob' });
        const up = await bucket.upload(`${basePath}/assets.zip`, zipBlob);
        if (up.error) uploadWarnings.push(`이미지 에셋: ${up.error.message}`);
        else assetsUrl = bucket.getPublicUrl(up.data.path).data.publicUrl;
      }

      // 3. 이미 생성된 씬 영상 URL + 사용자 추가 첨부
      setProgress('첨부 파일 정리 중...');
      const extraUrls: string[] = project.scenes
        .map((s) => s.video_url)
        .filter((u): u is string => !!u && /^https?:\/\//.test(u));

      for (const file of extraFiles) {
        const up = await bucket.upload(`${basePath}/extra_${file.name}`, file);
        if (up.error) uploadWarnings.push(`${file.name}: ${up.error.message}`);
        else extraUrls.push(bucket.getPublicUrl(up.data.path).data.publicUrl);
      }

      // 4. 의뢰 레코드 저장
      setProgress('의뢰 접수 중...');
      const payload = {
        project_id: project.id,
        project_title: project.title,
        requester_name: name.trim(),
        requester_email: email.trim(),
        user_id: user?.id || null,
        aspect_ratio: project.aspect_ratio || '16:9',
        scene_count: project.scenes.length || project.scene_count || 0,
        purpose: services.map((s) => s.label).join(' · '),
        additional_notes: notes.trim() || null,
        storyboard_url: storyboardUrl,
        assets_url: assetsUrl,
        extra_file_urls: extraUrls.length > 0 ? extraUrls : null,
        storyboard_downloaded: !!storyboardUrl,
        assets_downloaded: !!assetsUrl,
      };

      const { data: row, error: insertError } = await supabase
        .from('production_requests')
        .insert(payload)
        .select()
        .single();

      if (insertError) {
        setError(`의뢰 접수에 실패했습니다: ${insertError.message}`);
        setPhase('form');
        return;
      }

      // 5. 관리자 메일 발송 — 실패해도 접수 자체는 유효하므로 경고만 남긴다.
      setProgress('담당자에게 알림 발송 중...');
      const { error: fnError } = await supabase.functions.invoke('send-production-request', {
        body: row ?? payload,
      });
      if (fnError) {
        console.warn('send-production-request failed:', fnError);
        setEmailFailed(true);
      }

      if (uploadWarnings.length > 0) {
        console.warn('production request upload warnings:', uploadWarnings);
      }
      track('commission_requested', {
        services: services.map((s) => s.id).join(','),
        scene_count: project.scenes.length,
        has_storyboard: !!storyboardUrl,
        has_assets: !!assetsUrl,
        extra_files: extraFiles.length,
      });
      setPhase('done');
    } catch (err) {
      console.error('commission submit error:', err);
      setError('의뢰 전송 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
      setPhase('form');
    }
  };

  const close = () => {
    if (phase === 'sending') return;
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-[250] flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-md"
      onClick={close}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white border border-zinc-200 rounded-[2.5rem] w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[88vh]"
      >
        {phase === 'done' ? (
          <div className="p-10 text-center space-y-5">
            <div className="w-20 h-20 rounded-full bg-[#E8F4F0] border border-[#B9D8CD] flex items-center justify-center mx-auto">
              <CheckCircle2 size={38} className="text-[#007568]" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black tracking-tight text-zinc-900">의뢰가 접수되었습니다</h3>
              <p className="text-sm text-zinc-500 leading-relaxed">
                담당자가 첨부된 스토리보드와 요청사항을 확인한 뒤<br />
                <strong className="text-zinc-700">{email}</strong> 으로 견적을 보내드립니다.
              </p>
              {emailFailed && (
                <p className="text-xs text-[#007568] font-bold">
                  알림 메일 발송은 실패했지만 의뢰는 정상 접수되었습니다. 담당자가 관리자 콘솔에서 확인합니다.
                </p>
              )}
              {MOCK_MODE && (
                <p className="text-xs text-zinc-400">디자인(가계정) 모드 — 실제로 저장·발송되지 않았습니다.</p>
              )}
            </div>
            <button
              onClick={onClose}
              className="w-full py-4 bg-primary hover:bg-[#005D53] rounded-full text-sm font-black text-white transition-all shadow-[0_8px_20px_rgba(0,117,104,0.25)]"
            >
              닫기
            </button>
            <BuyPizzaLink />
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="p-6 border-b border-zinc-100 flex items-start justify-between gap-4">
              <div>
                <div className="text-[10px] font-black uppercase tracking-widest text-primary">Expert Commission</div>
                <h3 className="text-xl font-black tracking-tight text-zinc-900 mt-1">전문가에게 의뢰하기</h3>
                <p className="text-xs text-zinc-500 mt-1">{project.title}</p>
              </div>
              <button
                onClick={close}
                disabled={phase === 'sending'}
                className="p-2 rounded-xl text-zinc-400 hover:bg-zinc-100 hover:text-zinc-900 disabled:opacity-40"
                aria-label="close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 space-y-6 overflow-y-auto flex-1">
              {/* 자동 첨부 */}
              <section className="space-y-2.5">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">자동으로 함께 전달됩니다</h4>
                <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 space-y-2.5">
                  <AttachRow icon={LayoutGrid} label="스토리보드 시트" value={`${attachments.sheets}장`} on={attachments.sheets > 0} />
                  <AttachRow icon={ImageIcon} label="씬 이미지" value={`${attachments.images}장`} on={attachments.images > 0} />
                  <AttachRow icon={FileJson} label="스크립트 · 씬 구성" value={`${attachments.scenes}씬`} on={attachments.scenes > 0} />
                  <AttachRow icon={Film} label="생성된 영상" value={attachments.videos > 0 ? `${attachments.videos}개` : '없음'} on={attachments.videos > 0} />

                  {extraFiles.map((file, idx) => (
                    <div key={idx} className="flex items-center justify-between text-sm text-[#007568]">
                      <div className="flex items-center gap-3 min-w-0">
                        <Paperclip size={16} className="shrink-0" />
                        <span className="truncate">{file.name}</span>
                        <span className="text-[9px] text-zinc-400 shrink-0">({(file.size / 1024 / 1024).toFixed(1)}MB)</span>
                      </div>
                      <button
                        onClick={() => setExtraFiles((cur) => cur.filter((_, i) => i !== idx))}
                        className="p-1 text-zinc-400 hover:text-zinc-900"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full py-2.5 border border-dashed border-zinc-300 rounded-xl text-xs font-bold text-zinc-400 hover:text-primary hover:border-primary/50 transition-all flex items-center justify-center gap-2"
                  >
                    <Paperclip size={14} /> 참고 자료 추가 (최대 20MB)
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      pickFiles(Array.from(e.target.files || []));
                      e.target.value = '';
                    }}
                  />
                </div>
              </section>

              {/* 원하는 서비스 */}
              <section className="space-y-2.5">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">원하는 서비스 <span className="text-primary">*</span></h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {SERVICES.map((s) => {
                    const on = selected.includes(s.id);
                    return (
                      <button
                        key={s.id}
                        onClick={() => toggle(s.id)}
                        className={`text-left p-3.5 rounded-2xl border transition-all ${
                          on ? 'bg-[#E8F4F0] border-[#B9D8CD]' : 'bg-white border-zinc-200 hover:border-zinc-300'
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-4 h-4 rounded-md flex items-center justify-center shrink-0 ${
                              on ? 'bg-primary text-white' : 'border border-zinc-300'
                            }`}
                          >
                            {on && <Check size={11} strokeWidth={4} />}
                          </span>
                          <span className={`text-sm font-black ${on ? 'text-[#005D53]' : 'text-zinc-700'}`}>{s.label}</span>
                        </div>
                        <p className="text-[11px] text-zinc-500 mt-1 pl-6 leading-snug">{s.desc}</p>
                      </button>
                    );
                  })}
                </div>
              </section>

              {/* 추가 요청사항 */}
              <section className="space-y-2">
                <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">추가 요청사항</h4>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="희망 납기, 참고 레퍼런스, 톤앤매너, 사용 매체 등을 적어주세요."
                  className="w-full h-24 bg-white border border-zinc-200 rounded-2xl px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:border-primary resize-none placeholder:text-zinc-400"
                />
              </section>

              {/* 연락처 */}
              <section className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">담당자 이름 <span className="text-primary">*</span></h4>
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="홍길동"
                    className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:border-primary placeholder:text-zinc-400"
                  />
                </div>
                <div className="space-y-2">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-zinc-400">연락받을 이메일 <span className="text-primary">*</span></h4>
                  <input
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-white border border-zinc-200 rounded-2xl px-4 py-3 text-sm text-zinc-900 focus:outline-none focus:border-primary placeholder:text-zinc-400"
                  />
                </div>
              </section>

              {error && (
                <div className="flex items-start gap-2.5 p-3.5 rounded-2xl bg-rose-50 border border-rose-100 text-xs text-rose-700 font-bold">
                  <AlertCircle size={15} className="shrink-0 mt-0.5" />
                  <span className="leading-relaxed">{error}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-zinc-100 space-y-2">
              <button
                onClick={submit}
                disabled={phase === 'sending'}
                className="w-full py-4 bg-primary hover:bg-[#005D53] disabled:opacity-50 rounded-full text-sm font-black text-white flex items-center justify-center gap-2 transition-all shadow-[0_8px_20px_rgba(0,117,104,0.25)] active:scale-[0.99]"
              >
                {phase === 'sending' ? (
                  <><Loader2 size={18} className="animate-spin" /> {progress || '전송 중...'}</>
                ) : (
                  <><Send size={18} /> 견적 문의 보내기</>
                )}
              </button>
              <p className="text-[10px] text-zinc-400 text-center">
                의뢰는 무료이며, 견적 확인 후 진행 여부를 결정하실 수 있습니다.
              </p>
              <BuyPizzaLink />
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// 개발자 피자 후원 — remo-ai-studio 초기부터 있던 소소한 서비스 재입. 밝은 노랑으로 뚜렷하게.
const BuyPizzaLink: React.FC = () => (
  <a
    href="https://buymeacoffee.com/remoimagevo"
    target="_blank"
    rel="noopener noreferrer"
    className="block w-full py-3 mt-1 bg-[#FFDD00] hover:bg-[#FFDD00]/90 rounded-full text-sm font-black flex items-center justify-center gap-2 transition-all active:scale-[0.99] text-black text-center shadow-[0_6px_16px_rgba(255,221,0,0.25)]"
  >
    <span className="text-lg">🍕</span> 개발자에게 피자 사주기
  </a>
);

const AttachRow: React.FC<{
  icon: React.FC<{ size?: number; className?: string }>;
  label: string;
  value: string;
  on: boolean;
}> = ({ icon: Icon, label, value, on }) => (
  <div className={`flex items-center gap-3 text-sm ${on ? 'text-[#005D53]' : 'text-zinc-400'}`}>
    <Icon size={16} className="shrink-0" />
    <span className="font-bold">{label}</span>
    <span className="ml-auto text-xs">{value}</span>
    {on ? <Check size={14} /> : <X size={14} />}
  </div>
);

export default CommissionModal;
