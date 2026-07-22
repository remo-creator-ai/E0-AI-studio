import React, { useCallback, useEffect, useState } from 'react';
import { X, Send, XCircle, CheckCircle2, Clock, Ban, ShieldCheck } from 'lucide-react';
import { supabase } from '../lib/supabase';

// PRD v1.4 §9.7 사용자 인앱 크레딧 신청
// - 신청 폼: 요청 수량(기본 1000, 양의 정수) + 사유(필수) + 신원 정보(이름/회사/전화 · 개인정보 확인용)
// - 이력: 본인 신청 목록 (pending/approved/rejected/cancelled)
// - pending 1건 취소 가능 (RPC cancel_credit_request)

type Status = 'pending' | 'approved' | 'rejected' | 'cancelled';

interface RequestRow {
  id: string;
  amount: number;
  reason: string | null;
  applicant_name: string | null;
  company_name: string | null;
  phone: string | null;
  status: Status;
  granted_amount: number | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

interface Props {
  userId: string;
  onClose: () => void;
}

const DEFAULT_AMOUNT = 1000;

const STATUS_META: Record<Status, { label: string; className: string; Icon: React.ComponentType<{ size?: number }> }> = {
  pending:   { label: '대기 중',  className: 'bg-amber-50 text-amber-700 border-amber-200',       Icon: Clock },
  approved:  { label: '승인 완료', className: 'bg-emerald-50 text-emerald-700 border-emerald-200', Icon: CheckCircle2 },
  rejected:  { label: '반려',     className: 'bg-rose-50 text-rose-700 border-rose-200',           Icon: XCircle },
  cancelled: { label: '취소됨',   className: 'bg-zinc-100 text-zinc-600 border-zinc-200',          Icon: Ban },
};

export const CreditRequestModal: React.FC<Props> = ({ userId, onClose }) => {
  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [amount, setAmount] = useState<string>(String(DEFAULT_AMOUNT));
  const [applicantName, setApplicantName] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [phone, setPhone] = useState('');
  const [reason, setReason] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('credit_requests')
      .select('id, amount, reason, applicant_name, company_name, phone, status, granted_amount, reviewer_note, reviewed_at, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setRows((data ?? []) as RequestRow[]);
    // 최근 로우가 있으면 신원 정보를 폼에 프리필 (매번 다시 안 쓰게)
    const last = (data ?? []).find((r: RequestRow) => r.applicant_name || r.company_name || r.phone);
    if (last) {
      setApplicantName((prev) => prev || last.applicant_name || '');
      setCompanyName((prev) => prev || last.company_name || '');
      setPhone((prev) => prev || last.phone || '');
    }
  }, [userId]);

  useEffect(() => { load(); }, [load]);

  const hasPending = rows.some((r) => r.status === 'pending');

  const submit = async () => {
    setError(null); setNotice(null);
    const n = Number(amount);
    if (!Number.isInteger(n) || n <= 0) { setError('요청 수량은 1 이상의 정수여야 합니다.'); return; }
    if (!applicantName.trim()) { setError('신청자 이름을 입력해 주세요.'); return; }
    if (!companyName.trim()) { setError('회사명을 입력해 주세요.'); return; }
    if (!phone.trim()) { setError('전화번호를 입력해 주세요.'); return; }
    if (!reason.trim()) { setError('사유를 입력해 주세요.'); return; }
    if (hasPending) { setError('이미 처리 대기 중인 신청이 있습니다. 처리 후 다시 신청해 주세요.'); return; }

    setSubmitting(true);
    const { error } = await supabase.from('credit_requests').insert({
      user_id: userId,
      amount: n,
      reason: reason.trim(),
      applicant_name: applicantName.trim(),
      company_name: companyName.trim(),
      phone: phone.trim(),
      status: 'pending',
    });
    setSubmitting(false);
    if (error) {
      if (error.code === '23505') {
        setError('이미 처리 대기 중인 신청이 있습니다.');
      } else {
        setError(error.message);
      }
      return;
    }
    setReason('');
    setAmount(String(DEFAULT_AMOUNT));
    setNotice('신청이 접수되었습니다. 마스터가 검토 후 잔액에 반영합니다.');
    load();
  };

  const cancel = async (id: string) => {
    setError(null);
    const { error } = await supabase.rpc('cancel_credit_request', { p_request_id: id });
    if (error) { setError(error.message); return; }
    load();
  };

  return (
    <div className="fixed inset-0 z-[190] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-5 border-b border-zinc-100 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-primary">Credit Request</p>
            <h2 className="text-lg font-black text-zinc-900 mt-1">크레딧 신청</h2>
            <p className="text-xs text-zinc-500 mt-1">마스터가 검토 후 승인 시 잔액에 반영됩니다. (동시 대기 1건 제한)</p>
          </div>
          <button onClick={onClose} className="shrink-0 w-9 h-9 rounded-full hover:bg-zinc-100 flex items-center justify-center text-zinc-400 hover:text-zinc-700">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-6 overflow-y-auto">
          {/* Form */}
          <section>
            <h3 className="text-xs font-black text-zinc-800 mb-3">새 신청</h3>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">요청 수량 (크레딧)</label>
                <input
                  type="number"
                  value={amount}
                  readOnly
                  disabled
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm font-black bg-zinc-100 text-zinc-700 cursor-not-allowed"
                />
                <p className="text-[10px] text-zinc-400 mt-1">현재 요청 수량은 <span className="font-bold text-zinc-500">{DEFAULT_AMOUNT.toLocaleString()} 크레딧</span>으로 고정입니다.</p>
              </div>

              {/* 신원 정보 (개인정보 확인용) */}
              <div className="rounded-xl border border-zinc-200 p-3 bg-zinc-50/60 space-y-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-zinc-600">
                  <ShieldCheck size={12} className="text-primary" />
                  신청자 정보 (개인정보 확인 용도로만 사용)
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">신청자 이름</label>
                    <input
                      type="text"
                      value={applicantName}
                      onChange={(e) => setApplicantName(e.target.value)}
                      disabled={submitting || hasPending}
                      placeholder="홍길동"
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-zinc-100 disabled:text-zinc-400"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">회사명</label>
                    <input
                      type="text"
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      disabled={submitting || hasPending}
                      placeholder="예: 소담스퀘어"
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-zinc-100 disabled:text-zinc-400"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">전화번호</label>
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      disabled={submitting || hasPending}
                      placeholder="010-0000-0000"
                      className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-zinc-100 disabled:text-zinc-400"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-zinc-500 uppercase tracking-wider">사유</label>
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  disabled={submitting || hasPending}
                  placeholder="필요한 이유를 간단히 작성해 주세요."
                  rows={3}
                  className="mt-1 w-full px-3 py-2 rounded-lg border border-zinc-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-zinc-50 disabled:text-zinc-400 resize-none"
                />
              </div>

              {error && <p className="text-xs text-rose-600 font-bold">{error}</p>}
              {notice && <p className="text-xs text-emerald-700 font-bold">{notice}</p>}
              <div className="flex items-center justify-between pt-1">
                <p className="text-[11px] text-zinc-400">
                  {hasPending ? '처리 대기 중인 신청이 있어 새 신청은 잠시 후 가능합니다.' : '승인 결과는 잔액과 이력에 반영됩니다.'}
                </p>
                <button
                  onClick={submit}
                  disabled={submitting || hasPending}
                  className="px-5 py-2 rounded-xl text-sm font-black text-white bg-primary hover:brightness-110 transition-all active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  <Send size={14} /> {submitting ? '접수 중…' : '신청'}
                </button>
              </div>
            </div>
          </section>

          {/* History */}
          <section>
            <h3 className="text-xs font-black text-zinc-800 mb-3">신청 이력</h3>
            {loading ? (
              <p className="text-xs text-zinc-400">불러오는 중…</p>
            ) : rows.length === 0 ? (
              <p className="text-xs text-zinc-400">아직 신청 이력이 없습니다.</p>
            ) : (
              <ul className="divide-y divide-zinc-100 border border-zinc-200 rounded-xl overflow-hidden">
                {rows.map((r) => {
                  const meta = STATUS_META[r.status];
                  const Icon = meta.Icon;
                  const dt = new Date(r.created_at);
                  const dtLabel = `${dt.getMonth() + 1}/${dt.getDate()} ${String(dt.getHours()).padStart(2, '0')}:${String(dt.getMinutes()).padStart(2, '0')}`;
                  const grantedLabel = r.granted_amount != null && r.granted_amount !== r.amount
                    ? `→${r.granted_amount.toLocaleString()}`
                    : '';
                  const details = [r.applicant_name, r.company_name, r.phone].filter(Boolean).join(' · ');
                  const tooltip = [
                    details,
                    r.reason ? `사유: ${r.reason}` : '',
                    r.reviewer_note ? `검토: ${r.reviewer_note}` : '',
                  ].filter(Boolean).join('\n');
                  return (
                    <li
                      key={r.id}
                      title={tooltip || undefined}
                      className="flex items-center gap-2 px-3 py-2 text-xs hover:bg-zinc-50"
                    >
                      <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider border ${meta.className}`}>
                        <Icon size={10} /> {meta.label}
                      </span>
                      <span className="shrink-0 font-black text-zinc-900 tabular-nums">
                        {r.amount.toLocaleString()}
                        {grantedLabel && <span className="text-emerald-700 font-bold ml-0.5">{grantedLabel}</span>}
                        <span className="text-zinc-400 font-medium ml-0.5">cr</span>
                      </span>
                      {details && <span className="shrink-0 text-zinc-500 truncate max-w-[140px]">{details}</span>}
                      {r.reason && <span className="min-w-0 flex-1 text-zinc-600 truncate">— {r.reason}</span>}
                      {!r.reason && <span className="flex-1" />}
                      <span className="shrink-0 text-[10px] text-zinc-400 tabular-nums">{dtLabel}</span>
                      {r.status === 'pending' && (
                        <button
                          onClick={() => cancel(r.id)}
                          className="shrink-0 text-[10px] font-bold text-rose-600 hover:text-rose-800 hover:bg-rose-50 px-1.5 py-0.5 rounded"
                        >
                          취소
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
