// =============================================================
//  음성 생성 · Google Cloud TTS
//
//  - 스크립트 (최대 1500자) · 목소리 프리셋 · 속도/톤 · 재생 · mp3 다운로드
//  - 히스토리: DB 영구 저장 (migration 039 · 30일 TTL · 100개 상한)
//  - 자산 보관함 저장은 하지 않음 (사용자 결정, 2026-08-09)
// =============================================================

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Mic, Play, Pause, Download, Loader2, AlertCircle, Volume2, Wand2, Trash2, Clock, RefreshCw } from 'lucide-react';
import { useModal } from './ui/ModalProvider';
import { useCreditStore } from '../store/creditStore';
import { useAuthStore } from '../store/authStore';
import {
  generateTts, isTtsReady, ttsCreditCost,
  VOICE_PRESETS, DEFAULT_VOICE, TTS_MAX_CHARS,
  type GenerateTtsFailure,
} from '../services/ttsService';
import {
  saveTtsHistory, listTtsHistory, deleteTtsHistoryItem, refreshTtsSignedUrl,
  type TtsHistoryItem,
} from '../services/ttsHistoryService';
import { track } from '../lib/analytics';
import { useTranslation } from 'react-i18next';
import { genErrorSummary } from '../lib/genErrorMessages';

const SAMPLE_SCRIPTS = [
  '안녕하세요, E0 AI Studio입니다. 지금부터 시작합니다.',
  '이 제품은 여러분의 일상을 바꿔줄 특별한 경험을 선사합니다.',
  '단 한 잔의 커피가 오늘 하루를 완벽하게 만들어 드립니다.',
];

const HISTORY_LIMIT = 20;

export const VoiceStudio: React.FC = () => {
  const { alert, confirm } = useModal();
  const balance = useCreditStore((s) => s.balance);
  const hasEnough = useCreditStore((s) => s.hasEnough);
  const deduct = useCreditStore((s) => s.deduct);
  const user = useAuthStore((s) => s.user);

  const [text, setText] = useState('');
  const [voiceId, setVoiceId] = useState(DEFAULT_VOICE.id);
  const [speakingRate, setSpeakingRate] = useState(1.0);
  const [pitch, setPitch] = useState(0);

  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<GenerateTtsFailure | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [apiReady, setApiReady] = useState(true);

  // DB 히스토리 상태 · 재생 대상 · 로딩
  const [current, setCurrent] = useState<TtsHistoryItem | null>(null);
  const [history, setHistory] = useState<TtsHistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const audioRef = React.useRef<HTMLAudioElement | null>(null);

  useEffect(() => { isTtsReady().then(setApiReady).catch(() => setApiReady(true)); }, []);

  // 히스토리 로드 · 유저 있으면 마운트 시 + 만료 signed URL 방어 (첫 아이템만 재발급 시도)
  const loadHistory = useCallback(async () => {
    if (!user?.id) { setHistory([]); return; }
    setHistoryLoading(true);
    try {
      const rows = await listTtsHistory(user.id, HISTORY_LIMIT, 0);
      setHistory(rows);
    } finally {
      setHistoryLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const charCount = text.trim().length;
  const cost = ttsCreditCost(charCount || 1);
  const enough = hasEnough(cost);
  const voice = useMemo(() => VOICE_PRESETS.find((v) => v.id === voiceId) ?? DEFAULT_VOICE, [voiceId]);
  const canGenerate = charCount > 0 && charCount <= TTS_MAX_CHARS && !busy && enough;

  const generate = async () => {
    if (charCount === 0) {
      await alert('스크립트를 입력해 주세요.', { type: 'warning' });
      return;
    }
    if (!user?.id) {
      await alert('로그인이 필요합니다.', { type: 'warning' });
      return;
    }
    setBusy(true);
    setFailure(null);
    setErrorMsg(null);
    try {
      const result = await generateTts({ text, voiceId, speakingRate, pitch });
      if (!result.ok || !result.audioUrl) {
        console.error('[VoiceStudio] 음성 생성 실패:', result.failure, result.message);
        setFailure(result.failure ?? 'error');
        // no_api_key·too_long 은 아래 errorMessage 에서 TTS 전용 문구로 먼저 걸러진다.
        // 여기 저장되는 값은 그 밖의 오류용 fallback 이라 공통 매퍼로 요약한다.
        setErrorMsg(genErrorSummary(result, t));
        track('voice_generated', {
          success: false,
          failure: result.failure ?? 'error',
          voice_id: voiceId,
          char_count: charCount,
        });
        return;
      }
      await deduct(cost, `음성 생성 (${charCount}자 · ${voice.label})`);
      track('voice_generated', {
        success: true,
        voice_id: voiceId,
        voice_tier: voice.tier,
        char_count: result.charCount ?? charCount,
        speaking_rate: speakingRate,
        pitch,
        cost,
      });

      // DB 저장 · 실패해도 사용자가 방금 만든 mp3 는 재생 가능하도록 임시 아이템으로 표시
      const save = await saveTtsHistory({
        ownerId: user.id,
        text: text.trim(),
        voiceId,
        voiceLabel: voice.label,
        charCount: result.charCount ?? charCount,
        speakingRate,
        pitch,
        audioDataUrl: result.audioUrl,
      });

      if (save.ok && save.item) {
        setCurrent(save.item);
        // 히스토리 재로드 (signed URL 최신화 + 100개 상한 트리밍 반영)
        loadHistory();
        setTimeout(() => {
          audioRef.current?.play().catch(() => {});
          setPlayingId(save.item!.id);
        }, 100);
      } else {
        // 저장 실패 시 data URL 로 임시 재생만 (오류 안내)
        console.warn('TTS DB 저장 실패:', save.error);
        const tempItem: TtsHistoryItem = {
          id: `temp-${Date.now()}`,
          owner_id: user.id,
          text: text.trim(),
          voice_id: voiceId,
          voice_label: voice.label,
          char_count: result.charCount ?? charCount,
          speaking_rate: speakingRate,
          pitch,
          storage_path: '',
          url: result.audioUrl,
          created_at: new Date().toISOString(),
        };
        setCurrent(tempItem);
        console.error('[VoiceStudio] 히스토리 저장 실패:', save.error);
        setErrorMsg(`재생은 가능하지만 히스토리 저장에 실패했습니다. ${genErrorSummary(save.error, t)}`);
      }
    } catch (e) {
      console.error('[VoiceStudio] 음성 생성 예외:', e);
      setFailure('error');
      setErrorMsg(genErrorSummary(e, t));
    } finally {
      setBusy(false);
    }
  };

  const togglePlay = async (entry: TtsHistoryItem) => {
    if (!audioRef.current) return;
    if (current?.id === entry.id && playingId === entry.id) {
      audioRef.current.pause();
      setPlayingId(null);
      return;
    }
    // 다른 항목 · 만료된 signed URL 이면 재발급 시도
    let target = entry;
    if (entry.url) {
      const fresh = await refreshTtsSignedUrl(entry.url);
      if (fresh !== entry.url) target = { ...entry, url: fresh };
    }
    setCurrent(target);
    setTimeout(() => {
      audioRef.current?.play().catch(() => {});
      setPlayingId(target.id);
    }, 50);
  };

  const download = (entry: TtsHistoryItem) => {
    const a = document.createElement('a');
    a.href = entry.url;
    a.download = `voice-${new Date(entry.created_at).toISOString().slice(0, 19).replace(/[T:]/g, '-')}.mp3`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const removeHistory = async (entry: TtsHistoryItem) => {
    const ok = await confirm('이 음성을 삭제할까요? 되돌릴 수 없습니다.', { type: 'warning' });
    if (!ok) return;
    // 임시 항목(저장 실패 · id 가 temp-) 은 DB 호출 없이 로컬에서만 제거
    if (entry.id.startsWith('temp-')) {
      if (current?.id === entry.id) setCurrent(null);
      return;
    }
    const success = await deleteTtsHistoryItem(entry.id, entry.storage_path);
    if (!success) {
      await alert('삭제 실패. 잠시 후 다시 시도해 주세요.', { type: 'error' });
      return;
    }
    setHistory((prev) => prev.filter((h) => h.id !== entry.id));
    if (current?.id === entry.id) setCurrent(null);
    if (playingId === entry.id) { audioRef.current?.pause(); setPlayingId(null); }
  };

  const errorMessage = charCount > TTS_MAX_CHARS
    ? `스크립트는 최대 ${TTS_MAX_CHARS}자까지 지원합니다. (현재 ${charCount}자)`
    : !enough && charCount > 0
      ? `크레딧이 부족합니다. (필요 ${cost}cr / 잔액 ${balance}cr)`
      : failure === 'no_api_key'
        ? 'Google TTS 키가 설정되지 않았습니다. 관리자에게 문의하세요.'
        : failure === 'too_long'
          ? `너무 깁니다 (최대 ${TTS_MAX_CHARS}자)`
          : errorMsg;

  return (
    <div className="flex flex-col lg:flex-row gap-6">
      {/* ===== 왼쪽: 설정 패널 ===== */}
      <aside className="w-full lg:w-[380px] lg:shrink-0 flex flex-col bg-white border border-zinc-200 rounded-3xl p-6">
        <div className="mb-5">
          <div className="flex items-center gap-2 mb-1">
            <Mic className="text-primary" size={22} />
            <h1 className="text-2xl font-black tracking-tight text-zinc-900">음성 생성</h1>
          </div>
          <p className="text-xs text-zinc-500">스크립트를 자연스러운 음성으로 변환합니다.</p>
        </div>

        {/* 스크립트 */}
        <label className="text-xs font-bold text-zinc-600 flex items-center justify-between">
          <span>스크립트 <span className="text-primary">*</span></span>
          <span className={`text-[10px] font-normal ${charCount > TTS_MAX_CHARS ? 'text-red-600' : 'text-zinc-400'}`}>
            {charCount} / {TTS_MAX_CHARS}자
          </span>
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="변환할 텍스트를 입력하세요. 짧은 광고 나레이션부터 긴 안내 방송까지 가능합니다."
          rows={7}
          className="mt-1.5 mb-2 w-full px-3 py-2 rounded-xl border border-zinc-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm resize-none"
          disabled={busy}
        />

        {/* 샘플 스크립트 */}
        <div className="flex flex-wrap gap-1.5 mb-5">
          {SAMPLE_SCRIPTS.map((sample, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setText(sample)}
              disabled={busy}
              className="text-[10px] px-2 py-1 rounded-lg bg-zinc-100 hover:bg-zinc-200 text-zinc-600 hover:text-zinc-900 transition-colors disabled:opacity-40 flex items-center gap-1"
            >
              <Wand2 size={9} /> 예시 {i + 1}
            </button>
          ))}
        </div>

        {/* 목소리 */}
        <label className="text-xs font-bold text-zinc-600">목소리</label>
        <div className="mt-1.5 mb-5 grid grid-cols-1 gap-1.5">
          {VOICE_PRESETS.map((v) => {
            const selected = voiceId === v.id;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => setVoiceId(v.id)}
                disabled={busy}
                className={`px-3 py-2.5 rounded-xl border text-left transition-all disabled:opacity-40 ${
                  selected
                    ? 'bg-primary/10 border-primary/40 text-primary'
                    : 'bg-white border-zinc-200 hover:border-primary/40 text-zinc-600'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Volume2 size={13} className="shrink-0" />
                  <span className="text-xs font-bold">{v.label}</span>
                  <span className="ml-auto text-[9px] font-black px-1.5 py-0.5 rounded bg-zinc-100 text-zinc-500">{v.tier}</span>
                </div>
              </button>
            );
          })}
        </div>

        {/* 속도 */}
        <label className="text-xs font-bold text-zinc-600 flex items-center justify-between">
          <span>속도</span>
          <span className="text-[10px] font-normal text-zinc-400 tabular-nums">{speakingRate.toFixed(2)}×</span>
        </label>
        <input
          type="range"
          min="0.5" max="2.0" step="0.05"
          value={speakingRate}
          onChange={(e) => setSpeakingRate(parseFloat(e.target.value))}
          disabled={busy}
          className="mt-1.5 mb-4 w-full accent-primary"
        />

        {/* 톤 (피치) */}
        <label className="text-xs font-bold text-zinc-600 flex items-center justify-between">
          <span>톤</span>
          <span className="text-[10px] font-normal text-zinc-400 tabular-nums">{pitch >= 0 ? '+' : ''}{pitch.toFixed(0)}</span>
        </label>
        <input
          type="range"
          min="-10" max="10" step="1"
          value={pitch}
          onChange={(e) => setPitch(parseFloat(e.target.value))}
          disabled={busy}
          className="mt-1.5 mb-5 w-full accent-primary"
        />

        {/* 생성 버튼 */}
        <button
          onClick={generate}
          disabled={!canGenerate}
          className="mt-2 w-full py-3.5 rounded-2xl bg-gradient-to-r from-primary to-[#248B78] text-white font-black shadow-[0_8px_24px_rgba(0,117,104,0.35)] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
        >
          {busy ? <><Loader2 size={18} className="animate-spin" /> 생성 중...</> : <><Mic size={18} /> 🔥 {cost}cr · 음성 생성</>}
        </button>

        {errorMessage && (
          <div className="mt-3 flex items-start gap-2 p-3 rounded-xl bg-red-50 border border-red-100 text-xs text-red-700">
            <AlertCircle size={13} className="shrink-0 mt-0.5" />
            <span className="leading-relaxed">{errorMessage}</span>
          </div>
        )}

        <p className="mt-3 text-[10px] text-zinc-400 leading-relaxed">
          Google Cloud TTS WaveNet · 100자당 1cr · 월 1M자까지 무료 티어 내
        </p>
      </aside>

      {/* ===== 중앙: 재생 뷰 ===== */}
      <div className="flex-1 flex flex-col gap-4 min-w-0">
        {current ? (
          <div className="bg-white border border-zinc-200 rounded-3xl p-6">
            <div className="flex items-center gap-2 mb-4">
              <Volume2 size={16} className="text-primary" />
              <span className="text-xs font-black uppercase tracking-widest text-zinc-500">현재 재생</span>
              <span className="ml-auto text-[10px] text-zinc-400">{current.voice_label} · {current.char_count}자</span>
            </div>

            <audio
              ref={audioRef}
              src={current.url}
              controls
              onPlay={() => setPlayingId(current.id)}
              onPause={() => setPlayingId(null)}
              onEnded={() => setPlayingId(null)}
              className="w-full mb-4"
            />

            <div className="p-4 bg-zinc-50 rounded-xl mb-4">
              <div className="text-[10px] font-black uppercase tracking-widest text-zinc-400 mb-2">스크립트</div>
              <p className="text-sm text-zinc-800 leading-relaxed whitespace-pre-wrap">{current.text}</p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => download(current)}
                className="flex-1 py-2.5 rounded-xl bg-white border border-zinc-200 hover:border-primary/40 text-sm font-bold text-zinc-700 flex items-center justify-center gap-2 transition-all"
              >
                <Download size={14} /> mp3 다운로드
              </button>
            </div>
          </div>
        ) : (
          <div className="bg-white border border-dashed border-zinc-200 rounded-3xl p-12 text-center">
            <div className="w-16 h-16 rounded-2xl bg-primary/5 mx-auto flex items-center justify-center mb-4">
              <Mic className="text-primary/40" size={30} />
            </div>
            <p className="text-sm text-zinc-500 font-bold">스크립트를 입력하고 생성 버튼을 눌러주세요</p>
            <p className="mt-1 text-[11px] text-zinc-400">한국어 나레이션 · WaveNet 품질</p>
          </div>
        )}
      </div>

      {/* ===== 오른쪽: 히스토리 (DB · 30일 · 100개) ===== */}
      <aside className="w-full lg:w-[300px] lg:shrink-0 flex flex-col bg-white border border-zinc-200 rounded-3xl p-4">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={14} className="text-primary" />
          <h3 className="text-sm font-black text-zinc-900">히스토리</h3>
          <span className="ml-auto text-[10px] text-zinc-400 tabular-nums">{history.length}개</span>
        </div>
        <p className="text-[10px] text-zinc-400 leading-relaxed mb-3">
          30일 뒤 자동 삭제 · 계속 사용하려면 다운로드 하세요.
        </p>

        {!user && (
          <div className="text-xs text-zinc-500 text-center py-8">로그인이 필요합니다.</div>
        )}
        {user && historyLoading && (
          <div className="text-xs text-zinc-500 text-center py-8 flex items-center justify-center gap-2">
            <RefreshCw size={12} className="animate-spin" /> 로딩 중...
          </div>
        )}
        {user && !historyLoading && history.length === 0 && (
          <div className="text-xs text-zinc-400 text-center py-8">아직 생성한 음성이 없습니다.</div>
        )}
        {user && !historyLoading && history.length > 0 && (
          <div className="space-y-2 overflow-y-auto flex-1">
            {history.map((h) => {
              const isPlaying = playingId === h.id;
              const isCurrent = current?.id === h.id;
              return (
                <div
                  key={h.id}
                  className={`rounded-xl border p-2.5 transition-all ${
                    isCurrent ? 'border-primary/40 bg-primary/5' : 'border-zinc-200 hover:border-zinc-300'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <button
                      onClick={() => togglePlay(h)}
                      className="shrink-0 w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center hover:bg-[#005D53]"
                    >
                      {isPlaying ? <Pause size={12} /> : <Play size={12} className="ml-0.5" />}
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] text-zinc-800 line-clamp-2 leading-snug">{h.text}</p>
                      <p className="text-[9px] text-zinc-400 mt-1">
                        {h.voice_label} · {h.char_count}자
                      </p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={() => download(h)}
                        className="p-1 text-zinc-400 hover:text-primary rounded"
                        title="다운로드"
                      >
                        <Download size={11} />
                      </button>
                      <button
                        onClick={() => removeHistory(h)}
                        className="p-1 text-zinc-400 hover:text-red-500 rounded"
                        title="삭제"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </aside>
    </div>
  );
};

export default VoiceStudio;
