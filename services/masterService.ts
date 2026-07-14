// =============================================================
//  마스터 콘솔 서비스 계층
//  MOCK_MODE  → lib/mockMasterData 의 인메모리 데이터로 동작 (디자인/확인용)
//  실제 모드  → Supabase 테이블 + master Edge Function 호출
//               (docs/AUTH_MODEL_TRANSITION.md §5 매핑)
//  컴포넌트는 이 파일만 바라보므로 실제 배선은 여기서 국소적으로 교체된다.
// =============================================================

import { supabase } from '../lib/supabase';
import { MOCK_MODE } from '../lib/mockAuth';
import {
  getMockDb,
  MASTER_MAX_SLOTS,
  MASTER_CREDIT_QUOTA,
  DEFAULT_INITIAL_CREDITS,
  type MasterAccount,
  type CreditTxn,
  type MasterRequest,
  type AccountStatus,
} from '../lib/mockMasterData';

export {
  MASTER_MAX_SLOTS,
  MASTER_CREDIT_QUOTA,
  DEFAULT_INITIAL_CREDITS,
  type MasterAccount,
  type CreditTxn,
  type MasterRequest,
  type AccountStatus,
};

export interface DashboardStats {
  issuedCount: number;
  maxSlots: number;
  activeCount: number;
  suspendedCount: number;
  creditQuota: number;
  creditAllocated: number; // 부여 누계
  creditRemaining: number;
  requestsTotal: number;
  requestsPending: number;
  requestsCompleted: number;
}

export type CreditOp = 'add' | 'deduct' | 'set';

const nowIso = () => new Date().toISOString();
const shortNow = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

function genTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 10; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

// ---------------- 계정 목록 ----------------
export async function listAccounts(): Promise<MasterAccount[]> {
  if (MOCK_MODE) {
    return [...getMockDb().accounts].sort((a, b) => a.login_id.localeCompare(b.login_id));
  }
  // 실제: profiles(발급계정) + user_credits 조인
  const { data, error } = await supabase
    .from('profiles')
    .select('id, login_id, display_name, status, created_at')
    .eq('role', 'user')
    .order('login_id');
  if (error || !data) return [];
  // TODO: user_credits 잔액/최근접속 조인 (별도 뷰 또는 RPC 권장)
  return data.map((p) => ({
    id: p.id,
    login_id: p.login_id ?? '',
    display_name: p.display_name ?? '',
    balance: 0,
    max_credits: 60,
    status: (p.status as AccountStatus) ?? 'active',
    last_active: null,
    created_at: p.created_at,
  }));
}

// ---------------- 대시보드 지표 ----------------
export async function getDashboardStats(): Promise<DashboardStats> {
  const accounts = await listAccounts();
  const requests = await listRequests();
  const activeCount = accounts.filter((a) => a.status === 'active').length;
  const suspendedCount = accounts.filter((a) => a.status === 'suspended').length;
  const allocated = MOCK_MODE ? getMockDb().allocated : 0; // TODO: 실제 부여 누계 집계
  return {
    issuedCount: accounts.length,
    maxSlots: MASTER_MAX_SLOTS,
    activeCount,
    suspendedCount,
    creditQuota: MASTER_CREDIT_QUOTA,
    creditAllocated: allocated,
    creditRemaining: MASTER_CREDIT_QUOTA - allocated,
    requestsTotal: requests.length,
    requestsPending: requests.filter((r) => r.status === 'pending').length,
    requestsCompleted: requests.filter((r) => r.status === 'completed').length,
  };
}

// ---------------- 계정 생성 ----------------
export interface CreateAccountInput {
  login_id: string;
  display_name: string;
  password: string;
  initial_credits: number;
}

export async function createAccount(input: CreateAccountInput): Promise<{ ok: boolean; error?: string }> {
  const loginId = input.login_id.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(loginId)) {
    return { ok: false, error: '아이디는 영문 소문자/숫자/._- 조합 3~32자여야 합니다.' };
  }
  if (input.password.length < 8) {
    return { ok: false, error: '비밀번호는 8자 이상이어야 합니다.' };
  }

  if (MOCK_MODE) {
    const mdb = getMockDb();
    if (mdb.accounts.length >= MASTER_MAX_SLOTS) return { ok: false, error: '20개 슬롯이 모두 찼습니다.' };
    if (mdb.accounts.some((a) => a.login_id === loginId)) return { ok: false, error: '이미 존재하는 아이디입니다.' };
    mdb.accounts.push({
      id: `mock-${loginId}`,
      login_id: loginId,
      display_name: input.display_name.trim() || loginId,
      balance: input.initial_credits,
      max_credits: 60,
      status: 'active',
      last_active: null,
      created_at: nowIso().slice(0, 10),
    });
    mdb.allocated += input.initial_credits;
    return { ok: true };
  }

  const { data, error } = await supabase.functions.invoke('master-create-account', {
    body: { login_id: loginId, password: input.password, display_name: input.display_name },
  });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true };
}

// ---------------- 상태 변경 (정지/활성화) ----------------
export async function setAccountStatus(id: string, status: AccountStatus): Promise<{ ok: boolean; error?: string }> {
  if (MOCK_MODE) {
    const a = getMockDb().accounts.find((x) => x.id === id);
    if (!a) return { ok: false, error: '계정을 찾을 수 없습니다.' };
    a.status = status;
    return { ok: true };
  }
  const { error } = await supabase.from('profiles').update({ status }).eq('id', id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ---------------- 비밀번호 재발급 (임시 비번 1회 반환) ----------------
export async function resetPassword(id: string): Promise<{ ok: boolean; temp_password?: string; error?: string }> {
  if (MOCK_MODE) {
    const a = getMockDb().accounts.find((x) => x.id === id);
    if (!a) return { ok: false, error: '계정을 찾을 수 없습니다.' };
    return { ok: true, temp_password: genTempPassword() };
  }
  const { data, error } = await supabase.functions.invoke('master-reset-password', { body: { user_id: id } });
  if (error) return { ok: false, error: error.message };
  if (data?.error) return { ok: false, error: data.error };
  return { ok: true, temp_password: data?.temp_password };
}

// ---------------- 크레딧 조정 ----------------
export async function adjustCredit(
  id: string,
  op: CreditOp,
  amount: number,
  reason: string
): Promise<{ ok: boolean; balance?: number; error?: string }> {
  if (amount < 0) return { ok: false, error: '수량은 0 이상이어야 합니다.' };

  if (MOCK_MODE) {
    const mdb = getMockDb();
    const a = mdb.accounts.find((x) => x.id === id);
    if (!a) return { ok: false, error: '계정을 찾을 수 없습니다.' };

    let delta = 0;
    let newBalance = a.balance;
    if (op === 'add') { delta = amount; newBalance = a.balance + amount; }
    else if (op === 'deduct') { delta = -Math.min(amount, a.balance); newBalance = a.balance + delta; }
    else { delta = amount - a.balance; newBalance = amount; }

    // 충전(부여)은 잔여 한도 이내에서만
    if (delta > 0 && mdb.allocated + delta > MASTER_CREDIT_QUOTA) {
      return { ok: false, error: `잔여 부여 한도(${(MASTER_CREDIT_QUOTA - mdb.allocated).toLocaleString()})를 초과합니다.` };
    }

    a.balance = newBalance;
    if (delta > 0) mdb.allocated += delta; // 부여 누계는 증가만
    mdb.txns.unshift({
      id: `t-${Date.now()}`,
      account_login_id: a.login_id,
      type: 'manual',
      description: reason || (op === 'deduct' ? '마스터 차감' : op === 'set' ? '마스터 잔액 설정' : '마스터 지급'),
      amount: delta,
      balance_after: newBalance,
      created_at: shortNow(),
    });
    return { ok: true, balance: newBalance };
  }

  // TODO(실제): 부여 누계 검증 + credit_transactions 기록을 원자적으로 처리하는
  //             admin_adjust_credit RPC 신설 필요 (masters.credit_quota 대비 배분 검증).
  return { ok: false, error: '실제 크레딧 조정 RPC(admin_adjust_credit)가 아직 구현되지 않았습니다.' };
}

// ---------------- 사용 이력 ----------------
export interface TxnFilter {
  account_login_id?: string; // 'all' or specific
  type?: 'all' | 'deduct' | 'manual';
}

export async function listTransactions(filter?: TxnFilter): Promise<CreditTxn[]> {
  if (MOCK_MODE) {
    let rows = [...getMockDb().txns];
    if (filter?.account_login_id && filter.account_login_id !== 'all') {
      rows = rows.filter((r) => r.account_login_id === filter.account_login_id);
    }
    if (filter?.type && filter.type !== 'all') {
      rows = rows.filter((r) => (filter.type === 'deduct' ? r.type === 'deduct' : r.type !== 'deduct'));
    }
    return rows;
  }
  const { data, error } = await supabase
    .from('credit_transactions')
    .select('id, user_id, type, description, amount, balance_after, created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error || !data) return [];
  // TODO: user_id → login_id 매핑(뷰/조인)
  return data.map((t) => ({
    id: t.id,
    account_login_id: t.user_id,
    type: (t.type as CreditTxn['type']) ?? 'deduct',
    description: t.description ?? '',
    amount: t.amount,
    balance_after: t.balance_after,
    created_at: t.created_at,
  }));
}

// ---------------- 의뢰 기록 ----------------
export async function listRequests(): Promise<MasterRequest[]> {
  if (MOCK_MODE) {
    return [...getMockDb().requests];
  }
  const { data, error } = await supabase.rpc('admin_get_all_requests');
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    account_login_id: String(r.requester_name ?? ''),
    project_title: String(r.project_title ?? ''),
    purpose: String(r.purpose ?? ''),
    recipient_email: String(r.requester_email ?? 'momo.ai.fren@gmail.com'),
    status: (r.status as MasterRequest['status']) ?? 'pending',
    attachments: [],
    created_at: String(r.created_at ?? ''),
  }));
}

export async function updateRequestStatus(id: string, status: MasterRequest['status']): Promise<{ ok: boolean }> {
  if (MOCK_MODE) {
    const r = getMockDb().requests.find((x) => x.id === id);
    if (r) r.status = status;
    return { ok: true };
  }
  const { error } = await supabase.rpc('admin_update_request_status', { p_request_id: id, p_status: status });
  return { ok: !error };
}

export function transactionsToCsv(rows: CreditTxn[]): string {
  const header = '일시,계정,유형,내용,변동,잔액';
  const lines = rows.map((r) =>
    [r.created_at, r.account_login_id, r.type, `"${r.description.replace(/"/g, '""')}"`, r.amount, r.balance_after].join(',')
  );
  return [header, ...lines].join('\n');
}
