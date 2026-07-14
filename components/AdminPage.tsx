import React, { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuthStore } from '../store/authStore';
import { getAllAdminConfig, setAdminConfig, isAdmin, type AdminConfigKey } from '../services/adminConfigService';
import {
  listAccounts,
  getDashboardStats,
  createAccount,
  setAccountStatus,
  resetPassword,
  adjustCredit,
  listTransactions,
  listRequests,
  updateRequestStatus,
  transactionsToCsv,
  MASTER_MAX_SLOTS,
  DEFAULT_INITIAL_CREDITS,
  type MasterAccount,
  type CreditTxn,
  type MasterRequest,
  type DashboardStats,
  type CreditOp,
} from '../services/masterService';
import { MOCK_MODE } from '../lib/mockAuth';
import {
  Shield, Key, Eye, EyeOff, CheckCircle2, AlertCircle, Loader2, Save,
  ClipboardList, LayoutDashboard, Users, History, Plus, Ban, Power,
  RotateCcw, CreditCard, Copy, Download, X,
} from 'lucide-react';

/* ============================= API Keys config ============================= */
interface ApiKeyField { key: AdminConfigKey; label: string; placeholder: string; }
const API_KEY_FIELDS: ApiKeyField[] = [
  { key: 'gemini_api_key', label: 'Gemini API Key', placeholder: 'AIza...' },
  { key: 'kling_access_key_id', label: 'Kling Access Key ID', placeholder: 'ak-...' },
  { key: 'kling_access_key_secret', label: 'Kling Access Key Secret', placeholder: 'sk-...' },
];

type AdminTab = 'dashboard' | 'accounts' | 'usage' | 'requests' | 'api-keys';

const REQ_STATUS: Record<MasterRequest['status'], { label: string; cls: string }> = {
  pending: { label: '대기', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  in_progress: { label: '진행', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
  completed: { label: '완료', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  cancelled: { label: '취소', cls: 'bg-zinc-100 text-zinc-500 border-zinc-200' },
};

/* ============================= Main ============================= */
export const AdminPage: React.FC = () => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const userIsAdmin = isAdmin(user?.email ?? undefined);
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
          <Shield className="w-16 h-16 text-red-500 mx-auto" />
          <h2 className="text-xl font-bold text-zinc-900">{t('admin.unauthorized')}</h2>
          <p className="text-zinc-500 text-sm">{t('admin.unauthorizedDesc')}</p>
        </div>
      </div>
    );
  }

  const TABS: { id: AdminTab; label: string; icon: React.ReactNode }[] = [
    { id: 'dashboard', label: '대시보드', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'accounts', label: '계정 관리', icon: <Users className="w-4 h-4" /> },
    { id: 'usage', label: '사용 이력', icon: <History className="w-4 h-4" /> },
    { id: 'requests', label: '의뢰 기록', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'api-keys', label: 'API 키', icon: <Key className="w-4 h-4" /> },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFB] text-zinc-900 p-8 overflow-y-auto">
      <div className="max-w-5xl mx-auto space-y-8">
        {/* Header */}
        <div className="bg-violet-50 border border-violet-200 rounded-[2rem] p-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 bg-primary/20 rounded-xl flex items-center justify-center">
              <Shield className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-extrabold tracking-tight text-zinc-900">관리자 콘솔</h1>
              <p className="text-sm text-zinc-500 mt-1">오픈놀 · 발급계정 · 크레딧 · 의뢰 관리</p>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-zinc-400">
            <span className="px-2 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold">MASTER</span>
            <span>{user?.email}</span>
            {MOCK_MODE && (
              <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-bold ml-1">디자인(가계정) 모드 · 샘플 데이터</span>
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
        {activeTab === 'usage' && <UsageTab />}
        {activeTab === 'requests' && <RequestsTab />}
        {activeTab === 'api-keys' && <ApiKeysTab />}
      </div>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 bg-white border border-emerald-200 text-zinc-900 rounded-2xl px-5 py-3 shadow-2xl">
          <span className="w-2 h-2 rounded-full bg-green-400 shadow-[0_0_8px_#22c55e]" />
          <span className="text-sm font-bold">{toast}</span>
        </div>
      )}
    </div>
  );
};

/* ============================= Dashboard Tab ============================= */
const StatCard: React.FC<{ label: string; value: React.ReactNode; sub?: React.ReactNode; badge?: string }> = ({ label, value, sub, badge }) => (
  <div className="bg-white border border-zinc-100 rounded-2xl p-5">
    <div className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest flex items-center gap-2">
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
          label="발급 계정"
          value={<>{stats.issuedCount}<span className="text-lg text-zinc-400"> / {stats.maxSlots}</span></>}
          sub={<><b className="text-emerald-600">활성 {stats.activeCount}</b> · <span className="text-amber-600">정지 {stats.suspendedCount}</span></>}
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
          sub={<><span className="text-amber-600">대기 {stats.requestsPending}</span> · <b className="text-emerald-600">완료 {stats.requestsCompleted}</b></>}
        />
      </div>

      {/* 한도 배분 현황 */}
      <div className="bg-white border border-zinc-100 rounded-2xl p-5">
        <div className="flex justify-between items-baseline mb-2">
          <div className="text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest">한도 배분 현황</div>
          <div className="text-xs text-zinc-500">
            배분 <b className="text-zinc-900">{stats.creditAllocated.toLocaleString()}</b> / 한도 <b className="text-zinc-900">{stats.creditQuota.toLocaleString()}</b>
            <span className="text-zinc-400"> ({pct.toFixed(1)}%)</span>
          </div>
        </div>
        <div className="h-2.5 rounded-full bg-zinc-100 overflow-hidden">
          <div className="h-full rounded-full bg-gradient-to-r from-primary to-cyan-400 shadow-[0_0_24px_rgba(109,40,217,0.25)]" style={{ width: `${Math.min(100, pct)}%` }} />
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
              <th className="text-left font-extrabold px-4 py-3 border-b border-zinc-100">최근 활동</th>
              <th className="text-left font-extrabold px-4 py-3 border-b border-zinc-100">계정</th>
              <th className="text-right font-extrabold px-4 py-3 border-b border-zinc-100">변동</th>
              <th className="text-right font-extrabold px-4 py-3 border-b border-zinc-100">시각</th>
            </tr>
          </thead>
          <tbody>
            {txns.map((tx) => (
              <tr key={tx.id} className="border-b border-zinc-100 last:border-0">
                <td className="px-4 py-3 text-zinc-700">{tx.description}</td>
                <td className="px-4 py-3 font-mono text-zinc-900">{tx.account_login_id}</td>
                <td className={`px-4 py-3 text-right font-mono font-bold ${tx.amount < 0 ? 'text-red-500' : 'text-emerald-600'}`}>
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

/* ============================= Accounts Tab ============================= */
const AccountsTab: React.FC<{ showToast: (m: string) => void }> = ({ showToast }) => {
  const [accounts, setAccounts] = useState<MasterAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [creditFor, setCreditFor] = useState<MasterAccount | null>(null);
  const [reveal, setReveal] = useState<{ login: string; pw: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    listAccounts().then((a) => { setAccounts(a); setLoading(false); });
  }, []);
  useEffect(() => { load(); }, [load]);

  const atCap = accounts.length >= MASTER_MAX_SLOTS;

  const toggleStatus = async (a: MasterAccount) => {
    setBusy(a.id);
    const next = a.status === 'active' ? 'suspended' : 'active';
    const res = await setAccountStatus(a.id, next);
    setBusy(null);
    if (res.ok) { load(); showToast(`${a.login_id} ${next === 'suspended' ? '정지' : '활성화'} 완료`); }
    else showToast(res.error ?? '실패');
  };

  const doReset = async (a: MasterAccount) => {
    setBusy(a.id);
    const res = await resetPassword(a.id);
    setBusy(null);
    if (res.ok && res.temp_password) setReveal({ login: a.login_id, pw: res.temp_password });
    else showToast(res.error ?? '재발급 실패');
  };

  return (
    <div className="bg-white border border-zinc-100 rounded-[2rem] p-8">
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900">계정 관리</h2>
          <p className="text-sm text-zinc-400 mt-1">발급 {accounts.length} / {MASTER_MAX_SLOTS} · 삭제 없이 정지로 이력 보존</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          disabled={atCap}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-white hover:bg-[#5B21B6] shadow-[0_8px_20px_rgba(109,40,217,0.25)] disabled:bg-zinc-100 disabled:text-zinc-400 disabled:shadow-none font-bold text-sm transition-all"
        >
          <Plus className="w-4 h-4" /> 계정 생성
        </button>
      </div>

      {loading ? <TabLoader /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead>
              <tr className="text-[10px] uppercase tracking-wider text-zinc-400">
                <th className="text-left font-extrabold px-3 py-3 border-b border-zinc-100">아이디</th>
                <th className="text-left font-extrabold px-3 py-3 border-b border-zinc-100">표시명</th>
                <th className="text-right font-extrabold px-3 py-3 border-b border-zinc-100">크레딧</th>
                <th className="text-left font-extrabold px-3 py-3 border-b border-zinc-100">상태</th>
                <th className="text-left font-extrabold px-3 py-3 border-b border-zinc-100">최근접속</th>
                <th className="text-right font-extrabold px-3 py-3 border-b border-zinc-100">관리</th>
              </tr>
            </thead>
            <tbody>
              {accounts.map((a) => (
                <tr key={a.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-3 font-mono text-zinc-900 font-semibold">{a.login_id}</td>
                  <td className="px-3 py-3 text-zinc-700 font-bold">{a.display_name}</td>
                  <td className={`px-3 py-3 text-right font-mono font-extrabold ${a.balance > 0 ? 'text-zinc-900' : 'text-zinc-400'}`}>{a.balance}</td>
                  <td className="px-3 py-3">
                    {a.status === 'active'
                      ? <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-emerald-50 text-emerald-700 border border-emerald-200">활성</span>
                      : <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-zinc-100 text-zinc-500 border border-zinc-200">정지</span>}
                  </td>
                  <td className="px-3 py-3 text-zinc-400">{a.last_active ?? '—'}</td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-1.5 justify-end">
                      <button onClick={() => setCreditFor(a)} title="크레딧 관리"
                        className="w-8 h-8 rounded-lg border border-zinc-200 bg-white text-zinc-500 hover:text-zinc-900 hover:border-primary/40 flex items-center justify-center transition-all">
                        <CreditCard className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => toggleStatus(a)} disabled={busy === a.id}
                        className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold border transition-all ${
                          a.status === 'active'
                            ? 'border-zinc-200 text-zinc-700 hover:bg-zinc-50'
                            : 'border-primary bg-primary text-white'
                        }`}>
                        {busy === a.id ? <Loader2 className="w-3 h-3 animate-spin" /> : a.status === 'active' ? <span className="flex items-center gap-1"><Ban className="w-3 h-3" />정지</span> : <span className="flex items-center gap-1"><Power className="w-3 h-3" />활성화</span>}
                      </button>
                      <button onClick={() => doReset(a)} disabled={busy === a.id}
                        className="px-2.5 py-1.5 rounded-lg text-[11px] font-bold border border-zinc-200 text-zinc-700 hover:bg-zinc-50 transition-all flex items-center gap-1">
                        <RotateCcw className="w-3 h-3" />비번재발급
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-5 text-xs text-zinc-400 bg-zinc-50 border border-zinc-100 border-l-2 border-l-primary rounded-r-xl px-4 py-3">
        20개 도달 시 <b className="text-zinc-600">계정 생성</b> 버튼 비활성 · 삭제 없이 <b className="text-zinc-600">정지(이력 보존)</b>만 제공
      </div>

      {createOpen && <CreateAccountModal onClose={() => setCreateOpen(false)} onCreated={(msg) => { setCreateOpen(false); load(); showToast(msg); }} onReveal={setReveal} />}
      {creditFor && <CreditModal account={creditFor} onClose={() => setCreditFor(null)} onDone={(msg) => { setCreditFor(null); load(); showToast(msg); }} />}
      {reveal && <RevealModal login={reveal.login} pw={reveal.pw} onClose={() => setReveal(null)} />}
    </div>
  );
};

/* ============================= Create Account Modal ============================= */
const CreateAccountModal: React.FC<{ onClose: () => void; onCreated: (msg: string) => void; onReveal: (r: { login: string; pw: string }) => void }> = ({ onClose, onCreated }) => {
  const [loginId, setLoginId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [credits, setCredits] = useState(DEFAULT_INITIAL_CREDITS);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const gen = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    let s = ''; for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
    setPassword(s);
  };

  const submit = async () => {
    setError(null); setSaving(true);
    const res = await createAccount({ login_id: loginId, display_name: displayName, password, initial_credits: credits });
    setSaving(false);
    if (res.ok) onCreated(`${loginId.toLowerCase()} 계정 생성 완료`);
    else setError(res.error ?? '생성 실패');
  };

  return (
    <ModalShell eyebrow="New Account" title="발급 계정 생성" desc="아이디는 마스터가 직접 지정합니다" onClose={onClose}>
      <Field label="아이디 (직접 지정)">
        <input value={loginId} onChange={(e) => setLoginId(e.target.value)} placeholder="sodam-daejeon" className={inputCls} />
      </Field>
      <Field label="표시명">
        <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="소담-대전점" className={inputCls} />
      </Field>
      <Field label="초기 비밀번호">
        <div className="flex gap-2">
          <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="8자 이상" className={inputCls} />
          <button onClick={gen} className="px-3 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50 whitespace-nowrap">⟳ 자동생성</button>
        </div>
        <p className="text-[11px] text-zinc-400 mt-1.5">임시 비번 자동생성 → 최초 로그인 시 변경 유도</p>
      </Field>
      <Field label="초기 크레딧">
        <input type="number" value={credits} onChange={(e) => setCredits(Number(e.target.value))} className={inputCls} />
        <p className="text-[11px] text-zinc-400 mt-1.5">기본 60 고정 (기존값 유지)</p>
      </Field>
      {error && <p className="text-[12px] font-bold text-red-500 flex items-center gap-1.5 mb-2"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={saving} className="flex-1 py-3 rounded-full bg-primary text-white hover:bg-[#5B21B6] shadow-[0_8px_20px_rgba(109,40,217,0.25)] disabled:opacity-50 font-black text-sm flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} 생성
        </button>
        <button onClick={onClose} className="px-5 py-3 rounded-full bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 font-bold text-sm">취소</button>
      </div>
    </ModalShell>
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
    if (res.ok) onDone(`${account.login_id} 크레딧 ${op === 'add' ? '충전' : op === 'deduct' ? '차감' : '설정'} 완료`);
    else setError(res.error ?? '실패');
  };

  const opBtn = (v: CreditOp, label: string) => (
    <button onClick={() => setOp(v)} className={`flex-1 py-2 rounded-lg text-xs font-bold border transition-all ${op === v ? 'bg-primary border-primary text-white' : 'border-zinc-200 text-zinc-500 hover:bg-zinc-50'}`}>{label}</button>
  );

  return (
    <ModalShell eyebrow={`Credit · ${account.login_id}`} title="크레딧 관리" desc={account.display_name} onClose={onClose}>
      <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-4 text-center mb-4">
        <div className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-widest">현재 잔액</div>
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
      {error && <p className="text-[12px] font-bold text-red-500 flex items-center gap-1.5 mb-2"><AlertCircle className="w-3.5 h-3.5" />{error}</p>}
      <div className="flex gap-2 pt-1">
        <button onClick={submit} disabled={saving} className="flex-1 py-3 rounded-full bg-primary text-white hover:bg-[#5B21B6] shadow-[0_8px_20px_rgba(109,40,217,0.25)] disabled:opacity-50 font-black text-sm flex items-center justify-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null} 적용
        </button>
        <button onClick={onClose} className="px-5 py-3 rounded-full bg-white border border-zinc-200 text-zinc-700 hover:bg-zinc-50 font-bold text-sm">닫기</button>
      </div>
    </ModalShell>
  );
};

/* ============================= Password Reveal Modal ============================= */
const RevealModal: React.FC<{ login: string; pw: string; onClose: () => void }> = ({ login, pw, onClose }) => {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(pw); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { /* noop */ }
  };
  return (
    <ModalShell eyebrow={`Reset · ${login}`} title="임시 비밀번호 발급" desc="이 비밀번호는 지금 한 번만 표시됩니다" onClose={onClose}>
      <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 text-center mb-3">
        <div className="text-[10px] text-amber-700 font-extrabold uppercase tracking-widest mb-1">임시 비밀번호</div>
        <div className="font-mono text-2xl font-black tracking-widest text-zinc-900">{pw}</div>
      </div>
      <button onClick={copy} className="w-full py-3 rounded-xl border border-zinc-200 bg-white text-sm font-bold text-zinc-700 hover:bg-zinc-50 flex items-center justify-center gap-2 mb-2">
        {copied ? <><CheckCircle2 className="w-4 h-4 text-green-400" /> 복사됨</> : <><Copy className="w-4 h-4" /> 복사</>}
      </button>
      <ol className="text-[11px] text-zinc-500 space-y-1.5 mb-3">
        <li className="flex gap-2"><span className="text-primary font-black">1</span> 이 비밀번호를 복사해 해당 발급계정에 전달하세요.</li>
        <li className="flex gap-2"><span className="text-primary font-black">2</span> 창을 닫으면 다시 볼 수 없습니다 (재발급만 가능).</li>
      </ol>
      <button onClick={onClose} className="w-full py-3 rounded-full bg-primary text-white hover:bg-[#5B21B6] shadow-[0_8px_20px_rgba(109,40,217,0.25)] font-black text-sm">확인 (닫기)</button>
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
    listTransactions({ account_login_id: accFilter, type: typeFilter }).then((r) => { setRows(r); setLoading(false); });
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
          <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900">사용 이력</h2>
          <p className="text-sm text-zinc-400 mt-1">계정별 크레딧 소진·지급 로그</p>
        </div>
        <button onClick={exportCsv} className="flex items-center gap-2 px-4 py-2 bg-white border border-zinc-200 hover:bg-zinc-50 rounded-xl text-sm font-bold text-zinc-700 transition-all">
          <Download className="w-4 h-4" /> CSV 내보내기
        </button>
      </div>

      <div className="flex gap-2 mb-4 flex-wrap">
        <select value={accFilter} onChange={(e) => setAccFilter(e.target.value)} className={selCls}>
          <option value="all">계정 전체</option>
          {accounts.map((a) => <option key={a.id} value={a.login_id}>{a.login_id}</option>)}
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
                <th className="text-left font-extrabold px-3 py-3 border-b border-zinc-100">일시</th>
                <th className="text-left font-extrabold px-3 py-3 border-b border-zinc-100">계정</th>
                <th className="text-left font-extrabold px-3 py-3 border-b border-zinc-100">유형</th>
                <th className="text-left font-extrabold px-3 py-3 border-b border-zinc-100">내용</th>
                <th className="text-right font-extrabold px-3 py-3 border-b border-zinc-100">변동</th>
                <th className="text-right font-extrabold px-3 py-3 border-b border-zinc-100">잔액</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-zinc-100 last:border-0">
                  <td className="px-3 py-3 text-zinc-500 whitespace-nowrap">{r.created_at}</td>
                  <td className="px-3 py-3 font-mono text-zinc-900">{r.account_login_id}</td>
                  <td className="px-3 py-3">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-black ${r.type === 'deduct' ? 'bg-zinc-100 text-zinc-500' : 'bg-primary/20 text-primary'}`}>{r.type}</span>
                  </td>
                  <td className="px-3 py-3 text-zinc-700">{r.description}</td>
                  <td className={`px-3 py-3 text-right font-mono font-bold ${r.amount < 0 ? 'text-red-500' : 'text-emerald-600'}`}>{r.amount > 0 ? '+' : ''}{r.amount}</td>
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
        <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900">의뢰 기록</h2>
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
                  <th className="text-left font-extrabold px-3 py-3 border-b border-zinc-100">일시</th>
                  <th className="text-left font-extrabold px-3 py-3 border-b border-zinc-100">의뢰 계정</th>
                  <th className="text-left font-extrabold px-3 py-3 border-b border-zinc-100">목적</th>
                  <th className="text-left font-extrabold px-3 py-3 border-b border-zinc-100">상태</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} onClick={() => setSelected(r)}
                    className={`border-b border-zinc-100 last:border-0 cursor-pointer transition-colors ${selected?.id === r.id ? 'bg-primary/5' : 'hover:bg-zinc-100'}`}>
                    <td className="px-3 py-3 text-zinc-500 whitespace-nowrap">{r.created_at}</td>
                    <td className="px-3 py-3 font-mono text-zinc-900">{r.account_login_id}</td>
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
                ['의뢰 계정', selected.account_login_id],
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
                  <div className="text-[10px] text-zinc-400 font-extrabold uppercase tracking-widest mt-4 mb-2">첨부</div>
                  {selected.attachments.map((f) => (
                    <div key={f} className="flex items-center gap-2 bg-white border border-zinc-200 rounded-lg px-3 py-2 text-xs text-zinc-700 font-mono mb-1.5">{f}</div>
                  ))}
                </>
              )}
              <div className="flex gap-2 mt-4">
                <button onClick={() => setStatus(selected, 'completed')} className="flex-1 py-2.5 rounded-full bg-primary hover:bg-[#5B21B6] shadow-[0_8px_20px_rgba(109,40,217,0.25)] text-white font-bold text-xs">완료 처리</button>
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
        <h2 className="text-2xl font-extrabold tracking-tight text-zinc-900">{t('admin.apiKeysTitle')}</h2>
      </div>
      <div className="space-y-6">
        {API_KEY_FIELDS.map((field) => (
          <div key={field.key} className="bg-zinc-50 rounded-xl p-5 border border-zinc-100">
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-semibold text-zinc-700">{field.label}</label>
              {status[field.key] === 'success' && <span className="flex items-center gap-1 text-xs text-emerald-600 font-bold"><CheckCircle2 className="w-3 h-3" /> {t('common.savedStatus')}</span>}
              {status[field.key] === 'error' && <span className="flex items-center gap-1 text-xs text-red-500 font-bold"><AlertCircle className="w-3 h-3" /> {t('common.failed')}</span>}
              {values[field.key] && !status[field.key] && <span className="flex items-center gap-1 text-xs text-emerald-600"><CheckCircle2 className="w-3 h-3" /> {t('common.configured')}</span>}
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
                className="px-5 py-3 rounded-full bg-primary text-white hover:bg-[#5B21B6] shadow-[0_8px_20px_rgba(109,40,217,0.25)] disabled:bg-zinc-100 disabled:text-zinc-400 disabled:shadow-none font-semibold flex items-center gap-2 shrink-0">
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
    <label className="block text-[10px] font-extrabold text-zinc-400 uppercase tracking-widest mb-1.5">{label}</label>
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
