import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { getAllAdminConfig, setAdminConfig, type AdminConfigKey } from '../services/adminConfigService';
import {
  listAccounts,
  getDashboardStats,
  adjustCredit,
  listTransactions,
  listRequests,
  updateRequestStatus,
  transactionsToCsv,
  type MasterAccount,
  type CreditTxn,
  type MasterRequest,
  type DashboardStats,
  type CreditOp,
} from '../services/masterService';
import {
  listAllCreditRequests,
  approveCreditRequest,
  rejectCreditRequest,
  getMasterCreditPool,
  type CreditRequest,
  type CreditPool,
} from '../services/creditRequestService';
import { MOCK_MODE } from '../lib/mockAuth';
import {
  Shield, Key, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Save,
  ClipboardList, LayoutDashboard, Users, History, CreditCard, Download, X,
} from 'lucide-react';

/* ============================= API Keys config ============================= */
interface ApiKeyField { key: AdminConfigKey; label: string; placeholder: string; }
const API_KEY_FIELDS: ApiKeyField[] = [
  { key: 'gemini_api_key', label: 'Gemini API Key', placeholder: 'AIza...' },
  { key: 'kling_access_key_id', label: 'Kling Access Key ID', placeholder: 'ak-...' },
  { key: 'kling_access_key_secret', label: 'Kling Access Key Secret', placeholder: 'sk-...' },
];

type AdminTab = 'dashboard' | 'accounts' | 'credit-requests' | 'usage' | 'requests' | 'api-keys';

const REQ_STATUS: Record<MasterRequest['status'], { label: string; cls: string }> = {
  pending: { label: '대기', cls: 'bg-[#F1F5F9] text-[#475569] border-[#CBD5E1]' },
  in_progress: { label: '진행', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed: { label: '완료', cls: 'bg-[#E5EDFA] text-[#003E99] border-[#C0D4F0]' },
  cancelled: { label: '취소', cls: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
};

/* ============================= Main ============================= */
export const AdminPage: React.FC = () => {
  const { t } = useTranslation();
  const user = useAuthStore((s) => s.user);
  const userIsAdmin = useAuthStore((s) => s.isMaster);
  const [activeTab, setActiveTab] = useState<AdminTab>('dashboard');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3200);
  }, []);

  if (!userIsAdmin) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="w-16 h-16 text-zinc-500 mx-auto" />
          <h2 className="text-xl font-bold text-zinc-900">{t('admin.unauthorized')}</h2>
          <p className="text-zinc-500 text-sm">{t('admin.unauthorizedDesc')}</p>
        </div>
      </div>
    );
  }

  const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: '대시보드', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'accounts', label: '계정 관리', icon: <Users className="w-4 h-4" /> },
    { id: 'credit-requests', label: '크레딧 신청', icon: <CreditCard className="w-4 h-4" /> },
    { id: 'usage', label: '사용 이력', icon: <History className="w-4 h-4" /> },
    { id: 'requests', label: '의뢰 기록', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'api-keys', label: 'API 키', icon: <Key className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#F5F7FA] text-zinc-900 p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-[#EEF3FC] border border-[#C0D4F0] rounded-[2rem] p-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-black tracking-tight text-zinc-900">관리자 콘솔</h1>
              <p className="text-sm text-zinc-500 mt-1">오픈놀 · 가입 사용자 · 크레딧 · 의뢰 관리</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="px-2 py-1 bg-[#E5EDFA] text-[#003E99] border border-[#C0D4F0] rounded-full font-bold">MASTER</span>
            <span>{user?.email}</span>
            {MOCK_MODE && (
              <span className="px-2 py-1 bg-[#E5EDFA] text-[#003E99] border border-[#C0D4F0] rounded-full font-bold ml-1">디자인(가계정) 모드 · 샘플 데이터</span>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 border-b border-zinc-200 overflow-x-auto">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-5 py-3 rounded-t-xl font-bold text-sm transition-all whitespace-nowrap ${
                activeTab === tab.id
                  ? 'bg-white border border-zinc-200 border-b-white text-zinc-900 -mb-px'
                  : 'text-zinc-400 hover:text-zinc-600'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'dashboard' && <DashboardTab />}
        {activeTab === 'accounts' && <AccountsTab showToast={showToast} />}
        {activeTab === 'credit-requests' && <CreditRequestsTab showToast={showToast} />}
        {activeTab === 'usage' && <UsageTab />}
        {activeTab === 'requests' && <RequestsTab />}
        {activeTab === 'api-keys' && <ApiKeysTab />}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border border-[#C0D4F0] text-zinc-900 rounded-2xl px-5 py-3 shadow-2xl">
          <span className="w-2 h-2 rounded-full bg-[#0050BF] shadow-[0_0_8px_#0050BF]" />
          <span className="text-sm font-bold">{toast}</span>
        </div>
      )}
    </div>
  );
};

/* ============================= Dashboard Tab ============================= */
const StatCard: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; badge?: string }> = ({ label, value, sub, badge }) => (
  <div className="bg-white border border-zinc-100 rounded-2xl p-5">
    <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest flex items-center gap-2">
      {label}
      {badge && <span className="px-1.5 py-0.5 bg-primary/20 text-primary rounded-full text-[8px]">{badge}</span>}
    </div>
    <div className="text-4xl font-black tracking-tighter mt-2 mb-1 text-zinc-900">{value}</div>
    {sub && <div className="text-xs text-zinc-500">{sub}</div>}
  </div>
);

const DashboardTab: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [txns, setTxns] = useState<CreditTxn[]>([]);

  useEffect(() => {
    getDashboardStats().then(setStats);
    listTransactions().then((rows) => setTxns(rows.slice(0, 5)));
  }, []);

  if (!stats) return <TabLoader />;
  const pct = stats.creditQuota ? (stats.creditAllocated / stats.creditQuota) * 100 : 0;

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="가입 사용자"
          value={stats.signupCount}
          sub={<span className="text-[#475569]">구글 셀프가입 누계</span>}
        />
        <StatCard
          label="크레딧 부여 한도"
          badge="REMO 설정"
          value={stats.creditQuota.toLocaleString()}
          sub={<>배분 <b className="text-zinc-900">{stats.creditAllocated.toLocaleString()}</b> · 잔여 <span className="text-primary">{stats.creditRemaining.toLocaleString()}</span></>}
        />
        <StatCard
          label="누적 의뢰"
          value={stats.requestsTotal}
          sub={<><span className="text-[#0050BF]">대기 {stats.requestsPending}</span> · <b className="text-[#0050BF]">완료 {stats.requestsCompleted}</b></>}
        />
      </div>

      {/* 한도 배분 현황 */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-5">
        <div className="flex justify-between items-baseline mb-2">
          <div className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">한도 배분 현황</div>
          <div className="text-xs text-zinc-500">
            배분 <b className="text-zinc-900">{stats.creditAllocated.toLocaleString()}</b> / 한도 <b className="text-zinc-900">{stats.creditQuota.toLocaleString()}</b>
            <span className="text-zinc-400"> ({pct.toFixed(1)}%)</span>
          </div>
        </div>
        <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-cyan-400 shadow-[0_0_24px_rgba(0,80,191,0.25)]" style={{ width: `${Math.min(100, pct)}%` }} />
        </div>
        <p className="text-[11px] text-zinc-400 mt-2">
          <b className="text-primary">부여 누계 방식</b> — 지금까지 부여한 총합이 한도를 초과할 수 없음(계정이 소진해도 회복 없음). 한도 변경은 <b className="text-zinc-600">리모와 협의</b> 후 조정.
        </p>
      </div>

      {/* 최근 활동 */}
      <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-zinc-400">
              <th className="text-left font-black px-4 py-3 border-b border-zinc-100">최근 활동</th>
              <th className="text-left font-black px-4 py-3 border-b border-zinc-100">계정</th>
              <th className="text-right font-black px-4 py-3 border-b border-zinc-100">변동</th>
              <th className="text-right font-black px-4 py-3 border-b border-zinc-100">시각</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((tx) => (
              <tr key={tx.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-4 py-3 text-zinc-700">{tx.description}</td>
                <td className="px-4 py-3 font-mono text-zinc-900">{tx.account_email}</td>
                <td className={`px-4 py-3 text-right font-mono font-bold ${tx.amount < 0 ? 'text-zinc-500' : 'text-[#0050BF]'}`}>
                  {tx.amount > 0 ? '+' : ''}{tx.amount}
                </td>
                <td className="px-4 py-3 text-right text-zinc-400">{tx.created_at}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

/* ============================= Credit Requests Tab ============================= */
const CR_STATUS: Record<CreditRequest['status'], string> = {
  pending:   'bg-[#E5EDFA] text-[#003E99] border-[#C0D4F0]',
  approved:  'bg-emerald-50 text-emerald-700 border-emerald-200',
  rejected:  'bg-zinc-100 text-zinc-500 border-zinc-200',
  cancelled: 'bg-zinc-100 text-zinc-400 border-zinc-200',
};
const CR_STATUS_LABEL: Record<CreditRequest['status'], string> = {
  pending: '대기', approved: '승인', rejected: '반려', cancelled: '취소',
};

const CreditRequestsTab: React.FC<{ showToast: (m: string) => void }> = ({ showToast }) => {
  const [pool, setPool] = useState<CreditPool | null>(null);
  const [reqs, setReqs] = useState<CreditRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [grant, setGrant] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    const [p, r] = await Promise.all([getMasterCreditPool(), listAllCreditRequests()]);
    setPool(p); setReqs(r); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const approve = async (req: CreditRequest) => {
    const amt = Number(grant[req.id] ?? req.amount);
    if (!amt || amt <= 0) { showToast('지급 수량을 확인하세요.'); return; }
    setBusyId(req.id);
    const res = await approveCreditRequest(req, amt, '크레딧 신청 승인');
    setBusyId(null);
    if (!res.ok) { showToast(res.error ?? '지급에 실패했습니다.'); return; }
    showToast(`${amt.toLocaleString()} 크레딧 지급 완료`);
    await load();
  };
  // 반려 사유는 MVP 에서 고정 문구. 사유 입력 UI 는 후속(REQUEST-09).
  const reject = async (req: CreditRequest) => {
    setBusyId(req.id);
    const res = await rejectCreditRequest(req.id, '마스터 반려');
    setBusyId(null);
    if (res.ok) { showToast('반려 처리했습니다.'); await load(); }
    else showToast(res.error ?? '반려에 실패했습니다.');
  };

  if (loading) return <TabLoader />;
  const pendingCount = reqs.filter((r) => r.status === 'pending').length;

  return (
    <div className="space-y-5">
      {pool && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <StatCard label="지급 한도" value={pool.limit.toLocaleString()} />
          <StatCard label="부여 누계" value={pool.granted.toLocaleString()} />
          <StatCard label="잔여" value={<span className="text-primary">{pool.remaining.toLocaleString()}</span>} />
        </div>
      )}

      <div className="bg-white border border-zinc-100 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-zinc-100 flex items-center gap-2">
          <span className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">크레딧 신청 대기함</span>
          {pendingCount > 0 && (
            <span className="px-1.5 py-0.5 bg-primary text-white rounded-full text-[9px] font-black">{pendingCount}</span>
          )}
        </div>
        {reqs.length === 0 ? (
          <p className="text-sm text-zinc-400 text-center py-10">신청 내역이 없습니다.</p>
        ) : (
          <div className="divide-y divide-zinc-100">
            {reqs.map((req) => (
              <div key={req.id} className="p-4 flex flex-col sm:flex-row sm:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-zinc-900 truncate">{req.user_email || req.user_id}</span>
                    <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold border ${CR_STATUS[req.status]}`}>
                      {CR_STATUS_LABEL[req.status]}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-500 mt-0.5 line-clamp-2">{req.reason}</p>
                  <p className="text-[11px] text-zinc-400 mt-0.5">
                    요청 {req.amount.toLocaleString()}
                    {req.granted_amount != null && <> · 지급 <b className="text-zinc-600">{req.granted_amount.toLocaleString()}</b></>}
                    {' · '}{req.created_at}
                  </p>
                </div>
                {req.status === 'pending' && (
                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number" min={1}
                      value={grant[req.id] ?? String(req.amount)}
                      onChange={(e) => setGrant((g) => ({ ...g, [req.id]: e.target.value }))}
                      className="w-20 px-2 py-1.5 rounded-lg border border-zinc-200 text-sm text-right focus:border-primary outline-none"
                    />
                    <button onClick={() => approve(req)} disabled={busyId === req.id}
                      className="px-3 py-1.5 bg-primary hover:bg-[#003E99] text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50">
                      승인
                    </button>
                    <button onClick={() => reject(req)} disabled={busyId === req.id}
                      className="px-3 py-1.5 bg-white border border-zinc-200 hover:bg-zinc-50 text-zinc-600 rounded-lg text-xs font-bold transition-all disabled:opacity-50">
                      반려
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

/* ============================= Accounts Tab ============================= */
const AccountsTab: React.FC<{ showToast: (m: string) => void }> = ({ showToast }) => {
  const [accounts, setAccounts] = useState<MasterAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [creditFor, setCreditFor] = useState<MasterAccount | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listAccounts().then((a) => { setAccounts(a); setLoading(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="bg-white border border-zinc-100 rounded-[2rem] p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-zinc-900">계정 관리</h2>
          <p className="text-sm text-zinc-400 mt-1">구글 셀프가입 사용자 {accounts.length}명 · 가입 시 자동 20 크레딧 부여</p>
        </div>
      </div>

      {loading ? <TabLoader /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-zinc-400">
                <th className="text-left font-black px-3 py-3 border-b border-zinc-100">이메일</th>
                <th className="text-left font-black px-3 py-3 border-b border-zinc-100">표시명</th>
                <th className="text-right font-black px-3 py-3 border-b border-zinc-100">크레딧</th>
                <th className="text-left font-black px-3 py-3 border-b border-zinc-100">최근접속</th>
                <th className="text-right font-black px-3 py-3 border-b border-zinc-100">관리</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-3 font-mono text-zinc-900 font-semibold">{a.email}</td>
                  <td className="px-3 py-3 text-zinc-700 font-bold">{a.display_name}</td>
                  <td className={`px-3 py-3 text-right font-mono font-black ${a.balance > 0 ? 'text-zinc-900' : 'text-zinc-400'}`}>{a.balance}</td>
                  <td className="px-3 py-3 text-zinc-400">{a.last_active ?? '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => setCreditFor(a)} title="크레딧 관리"
                        className="w-8 h-8 rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-900 hover:border-primary/40 flex items-center justify-center transition-all">
                        <CreditCard className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {creditFor && <CreditModal account={creditFor} onClose={() => setCreditFor(null)} onDone={(msg) => { setCreditFor(null); load(); showToast(msg); }} />}
    </div>
  );
};

/* ============================= Credit Modal ============================= */
const CreditModal: React.FC<{ account: MasterAccount; onClose: () => void; onDone: (msg: string) => void }> = ({ account, onClose, onDone }) => {
  const [op, setOp] = useState<CreditOp>('add');
  const [amount, setAmount] = useState(100);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError(null); setSaving(true);
    const res = await adjustCredit(account.id, op, amount, reason);
    setSaving(false);
    if (res.ok) onDone(`${account.email} 크레딧 ${op === 'add' ? '충전' : op === 'deduct' ? '차감' : '설정'} 완료`);
    else setError(res.error ?? '실패');
  };

  const opBtn = (v: CreditOp, label: string) => (
    <button onClick={() => setOp(v)} className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${op === v ? 'bg-primary border-primary text-white' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}>{label}</button>
  );

  return (
    <ModalShell eyebrow={`Credit · ${account.email}`} title="크레딧 관리" desc={account.display_name} onClose={onClose}>
      <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-center mb-4">
        <div className="text-[10px] text-zinc-400 font-black uppercase tracking-widest">현재 잔액</div>
        <div className="text-3xl font-black tracking-tighter text-zinc-900">{account.balance}</div>
      </div>
      <Field label="작업">
        <div className="flex gap-2">{opBtn('add', '＋ 충전')}{opBtn('deduct', '－ 차감')}{opBtn('set', '＝ 설정')}</div>
      </Field>
      <Field label="수량">
        <input type="number" value={amount} onChange={(e) => setAmount(Number(e.target.value))} className={inputCls} />
        <p className="text-[11px] text-zinc-400 mt-1.5">충전은 마스터 잔여 부여 한도 이내에서만 가능</p>
      </Field>
      <Field label="사유 (로그 기록)">
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="7월 정기 지급" className={inputCls} />
      </Field>
      {error && <p className="text-[12px] font-bold text-zinc-500 flex items-center gap-1.5 mb-2"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={saving} className="flex-1 py-3 rounded-full bg-primary text-white hover:bg-[#003E99] shadow-[0_8px_20px_rgba(0,80,191,0.25)] disabled:opacity-50 font-black text-sm flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} 적용
        </button>
        <button onClick={onClose} className="px-5 py-3 rounded-full bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 font-bold text-sm">닫기</button>
      </div>
    </ModalShell>
  );
};

/* ============================= Usage Tab ============================= */
const UsageTab: React.FC = () => {
  const [rows, setRows] = useState<CreditTxn[]>([]);
  const [accounts, setAccounts] = useState<MasterAccount[]>([]);
  const [accFilter, setAccFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'deduct' | 'manual'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => { listAccounts().then(setAccounts); }, []);
  useEffect(() => {
    setLoading(true);
    listTransactions({ account_email: accFilter, type: typeFilter }).then((r) => { setRows(r); setLoading(false); });
  }, [accFilter, typeFilter]);

  const exportCsv = () => {
    const csv = transactionsToCsv(rows);
    const blob = new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = 'usage.csv'; link.click();
    URL.revokeObjectURL(url);
  };

  const selCls = 'bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-700 focus:outline-none focus:border-primary';

  return (
    <div className="bg-white border border-zinc-100 rounded-[2rem] p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-zinc-900">사용 이력</h2>
          <p className="text-sm text-zinc-400 mt-1">계정별 크레딧 소진·지급 로그</p>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl text-sm font-bold text-zinc-700 transition-all">
          <Download className="w-4 h-4" /> CSV 내보내기
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <select value={accFilter} onChange={(e) => setAccFilter(e.target.value)} className={selCls}>
          <option value="all">계정 전체</option>
          {accounts.map((a) => <option key={a.id} value={a.email}>{a.email}</option>)}
        </select>
        <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as 'all' | 'deduct' | 'manual')} className={selCls}>
          <option value="all">유형 전체</option>
          <option value="deduct">소진(deduct)</option>
          <option value="manual">지급(manual)</option>
        </select>
      </div>

      {loading ? <TabLoader /> : rows.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 text-sm">이력이 없습니다.</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[600px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-zinc-400">
                <th className="text-left font-black px-3 py-3 border-b border-zinc-100">일시</th>
                <th className="text-left font-black px-3 py-3 border-b border-zinc-100">이메일</th>
                <th className="text-left font-black px-3 py-3 border-b border-zinc-100">유형</th>
                <th className="text-left font-black px-3 py-3 border-b border-zinc-100">내용</th>
                <th className="text-right font-black px-3 py-3 border-b border-zinc-100">변동</th>
                <th className="text-right font-black px-3 py-3 border-b border-zinc-100">잔액</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-3 text-zinc-500 whitespace-nowrap">{r.created_at}</td>
                  <td className="px-3 py-3 font-mono text-zinc-900">{r.account_email}</td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${r.type === 'deduct' ? 'bg-zinc-100 text-zinc-500' : 'bg-primary/20 text-primary'}`}>{r.type}</span>
                  </td>
                  <td className="px-3 py-3 text-zinc-700">{r.description}</td>
                  <td className={`px-3 py-3 text-right font-mono font-bold ${r.amount < 0 ? 'text-zinc-500' : 'text-[#0050BF]'}`}>{r.amount > 0 ? '+' : ''}{r.amount}</td>
                  <td className="px-3 py-3 text-right font-mono text-zinc-700">{r.balance_after}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 text-xs text-zinc-400 bg-zinc-50 border border-zinc-100 border-l-2 border-l-primary rounded-r-xl px-4 py-3">
        영상 생성(30/100)은 <b className="text-zinc-600">차단 상태이므로 이력에 나타나지 않음</b> — 소진 항목은 스토리보드·업스케일·스크립트뿐
      </div>
    </div>
  );
};

/* ============================= Requests Tab ============================= */
const RequestsTab: React.FC = () => {
  const [rows, setRows] = useState<MasterRequest[]>([]);
  const [selected, setSelected] = useState<MasterRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    listRequests().then((r) => { setRows(r); setSelected((prev) => prev ?? r[0] ?? null); setLoading(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const setStatus = async (r: MasterRequest, status: MasterRequest['status']) => {
    await updateRequestStatus(r.id, status);
    setRows((prev) => prev.map((x) => x.id === r.id ? { ...x, status } : x));
    setSelected((prev) => prev && prev.id === r.id ? { ...prev, status } : prev);
  };

  return (
    <div className="bg-white border border-zinc-100 rounded-[2rem] p-8">
      <div className="mb-6">
        <h2 className="text-2xl font-black tracking-tight text-zinc-900">의뢰 기록</h2>
        <p className="text-sm text-zinc-400 mt-1">수신 주소 고정 · <span className="font-mono text-zinc-500">momo.ai.fren@gmail.com</span></p>
      </div>

      {loading ? <TabLoader /> : rows.length === 0 ? (
        <div className="text-center py-16 text-zinc-400 text-sm">의뢰가 없습니다.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
          {/* List */}
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[10px] uppercase tracking-wider text-zinc-400">
                  <th className="text-left font-black px-3 py-3 border-b border-zinc-100">일시</th>
                  <th className="text-left font-black px-3 py-3 border-b border-zinc-100">의뢰 이메일</th>
                  <th className="text-left font-black px-3 py-3 border-b border-zinc-100">목적</th>
                  <th className="text-left font-black px-3 py-3 border-b border-zinc-100">상태</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r)}
                    className={`border-b border-zinc-100 last:border-0 cursor-pointer transition-colors ${selected?.id === r.id ? 'bg-primary/5' : 'hover:bg-zinc-100'}`}>
                    <td className="px-3 py-3 text-zinc-500 whitespace-nowrap">{r.created_at}</td>
                    <td className="px-3 py-3 font-mono text-zinc-900">{r.account_email}</td>
                    <td className="px-3 py-3 text-zinc-700">{r.project_title} / {r.purpose}</td>
                    <td className="px-3 py-3"><span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${REQ_STATUS[r.status].cls}`}>{REQ_STATUS[r.status].label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Detail drawer */}
          {selected && (
            <div className="bg-zinc-50 border border-zinc-100 rounded-2xl p-5 h-fit">
              <div className="text-[10px] text-primary font-black uppercase tracking-widest">의뢰 상세</div>
              <h4 className="text-base font-black tracking-tight mt-1.5 mb-4 text-zinc-900">{selected.project_title}</h4>
              {[
                ['의뢰 이메일', selected.account_email],
                ['의뢰 일시', selected.created_at],
                ['수신 주소', selected.recipient_email],
                ['목적', selected.purpose],
              ].map(([k, v]) => (
                <div key={k} className="flex justify-between py-2 border-b border-zinc-100 text-xs">
                  <span className="text-zinc-400">{k}</span>
                  <span className="text-zinc-900 font-bold text-right">{v}</span>
                </div>
              ))}
              <div className="flex justify-between py-2 border-b border-zinc-100 text-xs">
                <span className="text-zinc-400">상태</span>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-black border ${REQ_STATUS[selected.status].cls}`}>{REQ_STATUS[selected.status].label}</span>
              </div>
              {selected.attachments.length > 0 && (
                <>
                  <div className="text-[10px] text-zinc-400 font-black uppercase tracking-widest mt-4 mb-2">첨부</div>
                  {selected.attachments.map((f) => (
                    <div key={f} className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-700 font-mono mb-1.5">{f}</div>
                  ))}
                </>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={() => setStatus(selected, 'completed')} className="flex-1 py-2.5 rounded-full bg-primary hover:bg-[#003E99] shadow-[0_8px_20px_rgba(0,80,191,0.25)] text-white font-bold text-xs">완료 처리</button>
                <button onClick={() => setStatus(selected, 'cancelled')} className="px-4 py-2.5 rounded-full bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 font-bold text-xs">취소</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

/* ============================= API Keys Tab ============================= */
const ApiKeysTab: React.FC = () => {
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, string>>({});
  const [visibility, setVisibility] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, 'success' | 'error'>>({});

  useEffect(() => { getAllAdminConfig().then((c) => { setValues(c); setLoading(false); }); }, []);

  const save = async (key: AdminConfigKey) => {
    const v = values[key];
    if (!v?.trim()) return;
    setSaving(key);
    const ok = await setAdminConfig(key, v.trim());
    setStatus((p) => ({ ...p, [key]: ok ? 'success' : 'error' }));
    setSaving(null);
    setTimeout(() => setStatus((p) => { const n = { ...p }; delete n[key]; return n; }), 3000);
  };

  if (loading) return <TabLoader />;

  return (
    <div className="bg-white border border-zinc-100 rounded-[2rem] p-8">
      <div className="flex items-center gap-3 mb-8">
        <Key className="w-7 h-7 text-primary" />
        <h2 className="text-2xl font-black tracking-tight text-zinc-900">{t('admin.apiKeysTitle')}</h2>
      </div>
      <div className="space-y-6">
        {API_KEY_FIELDS.map((field) => (
          <div key={field.key} className="bg-zinc-50 rounded-xl p-5 border border-zinc-100">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-zinc-700">{field.label}</label>
              {status[field.key] === 'success' && <span className="flex items-center gap-1 text-xs text-[#0050BF] font-bold"><CheckCircle2 className="w-3 h-3" /> {t('common.savedStatus')}</span>}
              {status[field.key] === 'error' && <span className="flex items-center gap-1 text-xs text-zinc-500 font-bold"><AlertCircle className="w-3 h-3" /> {t('common.failed')}</span>}
              {values[field.key] && !status[field.key] && <span className="flex items-center gap-1 text-xs text-[#0050BF]"><CheckCircle2 className="w-3 h-3" /> {t('common.configured')}</span>}
            </div>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <input
                  type={visibility[field.key] ? 'text' : 'password'}
                  value={values[field.key] || ''}
                  onChange={(e) => setValues((p) => ({ ...p, [field.key]: e.target.value }))}
                  placeholder={field.placeholder}
                  className="w-full bg-white border border-zinc-200 rounded-xl px-4 py-3 text-zinc-900 placeholder-zinc-400 font-mono text-sm focus:outline-none focus:border-primary pr-12"
                />
                <button onClick={() => setVisibility((p) => ({ ...p, [field.key]: !p[field.key] }))}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-900">
                  {visibility[field.key] ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              <button onClick={() => save(field.key)} disabled={saving === field.key || !values[field.key]?.trim()}
                className="px-5 py-3 rounded-full bg-primary text-white hover:bg-[#003E99] shadow-[0_8px_20px_rgba(0,80,191,0.25)] disabled:bg-zinc-100 disabled:text-zinc-400 disabled:shadow-none font-semibold flex items-center gap-2 shrink-0">
                {saving === field.key ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {t('common.save')}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

/* ============================= Shared bits ============================= */
const inputCls = 'w-full bg-white border border-zinc-200 rounded-xl px-3.5 py-3 text-zinc-900 placeholder-zinc-400 text-sm focus:outline-none focus:border-primary transition-colors';

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="mb-3.5">
    <label className="block text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-1.5">{label}</label>
    {children}
  </div>
);

const ModalShell: React.FC<{ eyebrow: string; title: string; desc?: string; onClose: () => void; children: React.ReactNode }> = ({ eyebrow, title, desc, onClose, children }) => (
  <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-zinc-900/40 backdrop-blur-md" onClick={onClose}>
    <div className="w-full max-w-md bg-white border border-zinc-200 rounded-[1.4rem] overflow-hidden shadow-2xl" onClick={(e) => e.stopPropagation()}>
      <div className="px-6 pt-6 pb-3 relative">
        <button onClick={onClose} className="absolute right-4 top-4 text-zinc-400 hover:text-zinc-900"><X className="w-5 h-5" /></button>
        <div className="text-[10px] font-black text-primary uppercase tracking-widest">{eyebrow}</div>
        <h4 className="text-lg font-black tracking-tight mt-1.5 text-zinc-900">{title}</h4>
        {desc && <p className="text-xs text-zinc-400 mt-0.5">{desc}</p>}
      </div>
      <div className="px-6 pb-6">{children}</div>
    </div>
  </div>
);

const TabLoader: React.FC = () => (
  <div className="flex items-center justify-center py-16">
    <Loader2 className="w-8 h-8 text-primary animate-spin" />
  </div>
);
