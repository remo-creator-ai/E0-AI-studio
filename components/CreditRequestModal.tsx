import React, { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Coins, Clock } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import {
  createCreditRequest, listMyCreditRequests, cancelCreditRequest, type CreditRequest,
} from '../services/creditRequestService';

// PRD §9.7 사용자 인앱 크레딧 신청.
// 대기 중(pending) 신청이 있으면 폼 대신 취소 카드를 보여준다(사용자당 pending 1건).

const STATUS_STYLE: Record<CreditRequest['status'], string> = {
  pending:   'bg-[#E5EDFA] text-[#003E99] border-[#C0D4F0]',
  approved:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected:  'bg-zinc-100 text-zinc-500 border-zinc-200',
  cancelled: 'bg-zinc-100 text-zinc-400 border-zinc-200',
};

export const CreditRequestModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const [requests, setRequests] = useState<CreditRequest[]>([]);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (user) setRequests(await listMyCreditRequests(user.id));
  }, [user]);

  useEffect(() => { load(); }, [load]);

  const pending = requests.find((r) => r.status === 'pending');

  const submit = async () => {
    if (!user || busy) return;
    setBusy(true); setError('');
    const res = await createCreditRequest(user.id, user.email ?? '', Number(amount), reason);
    setBusy(false);
    if (!res.ok) { setError(res.error ?? ''); return; }
    setAmount(''); setReason(''); await load();
  };

  const cancel = async (id: string) => {
    if (busy) return;
    setBusy(true);
    await cancelCreditRequest(id);
    setBusy(false);
    await load();
  };

  return (
    <div
      className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-zinc-900/50 backdrop-blur-md"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="relative bg-white border border-zinc-200 rounded-[2rem] w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-6 pb-4 shrink-0 relative">
          <button onClick={onClose} aria-label={t('creditRequest.close')} className="absolute top-5 right-5 p-2 hover:bg-zinc-100 rounded-xl transition-all">
            <X size={18} className="text-zinc-400" />
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-[#E5EDFA] border border-[#C0D4F0] flex items-center justify-center">
              <Coins size={20} className="text-primary" />
            </div>
            <h2 className="text-lg font-black tracking-tight text-zinc-900">{t('creditRequest.title')}</h2>
          </div>
          <p className="text-sm text-zinc-500 leading-relaxed mt-3">{t('creditRequest.subtitle')}</p>
        </div>

        <div className="px-6 pb-6 space-y-5 overflow-y-auto custom-scrollbar">
          {/* 폼 또는 대기 카드 */}
          {pending ? (
            <div className="p-4 rounded-2xl border border-[#C0D4F0] bg-[#EEF3FC] space-y-2">
              <div className="flex items-center gap-2 text-[#003E99]">
                <Clock size={15} />
                <span className="text-sm font-bold">{t('creditRequest.pendingTitle')}</span>
              </div>
              <div className="text-2xl font-black text-primary">{pending.amount.toLocaleString()}</div>
              <p className="text-xs text-zinc-500 leading-relaxed">{pending.reason}</p>
              <p className="text-[11px] text-zinc-400">{t('creditRequest.pendingNote')}</p>
              <button
                onClick={() => cancel(pending.id)}
                disabled={busy}
                className="mt-1 w-full py-2.5 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-full font-bold text-xs text-zinc-600 transition-all active:scale-[0.98] disabled:opacity-50"
              >
                {t('creditRequest.cancel')}
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-bold text-zinc-600">{t('creditRequest.amountLabel')}</label>
                <input
                  type="number" min={1} value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder={t('creditRequest.amountPlaceholder')}
                  className="mt-1.5 w-full px-4 py-3 rounded-2xl border border-zinc-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm transition-all"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-600">{t('creditRequest.reasonLabel')}</label>
                <textarea
                  value={reason} rows={3}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder={t('creditRequest.reasonPlaceholder')}
                  className="mt-1.5 w-full px-4 py-3 rounded-2xl border border-zinc-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none text-sm resize-none transition-all"
                />
              </div>
              {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
              <button
                onClick={submit}
                disabled={busy || !amount || !reason.trim()}
                className="w-full py-3.5 bg-primary hover:bg-[#003E99] disabled:bg-zinc-200 disabled:text-zinc-400 rounded-full font-black text-sm text-white transition-all active:scale-[0.98] shadow-[0_8px_20px_rgba(0,80,191,0.25)] disabled:shadow-none"
              >
                {busy ? t('creditRequest.submitting') : t('creditRequest.submit')}
              </button>
            </div>
          )}

          {/* 이력 */}
          <div>
            <p className="text-xs font-bold text-zinc-500 mb-2">{t('creditRequest.historyTitle')}</p>
            {requests.length === 0 ? (
              <p className="text-xs text-zinc-400 py-3 text-center">{t('creditRequest.empty')}</p>
            ) : (
              <div className="space-y-2">
                {requests.map((r) => (
                  <div key={r.id} className="flex items-center gap-3 p-3 rounded-xl border border-zinc-150 bg-zinc-50/60">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-zinc-800">{r.amount.toLocaleString()}</span>
                        {r.status === 'approved' && r.granted_amount != null && r.granted_amount !== r.amount && (
                          <span className="text-[11px] font-semibold text-emerald-600">
                            {t('creditRequest.granted', { amount: r.granted_amount.toLocaleString() })}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-zinc-400 truncate">{r.reviewer_note || r.reason}</p>
                    </div>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${STATUS_STYLE[r.status]}`}>
                      {t(`creditRequest.status.${r.status}`)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
