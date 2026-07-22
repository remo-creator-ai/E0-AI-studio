// =============================================================
//  마스터 콘솔 서비스 계층
//  MOCK_MODE  → lib/mockMasterData 의 인메모리 데이터로 동작 (디자인/확인용)
//  실제 모드  → Supabase 테이블 호출 (구글 셀프가입 사용자 기준)
//  컴포넌트는 이 파일만 바라보므로 실제 배선은 여기서 국소적으로 교체된다.
// =============================================================

import { supabase } from '../lib/supabase';
import { MOCK_MODE } from '../lib/mockAuth';
import {
  getMockDb,
  MASTER_CREDIT_QUOTA,
  SIGNUP_INITIAL_CREDITS,
  type MasterAccount,
  type CreditTxn,
  type MasterRequest,
} from '../lib/mockMasterData';

export {
  MASTER_CREDIT_QUOTA,
  SIGNUP_INITIAL_CREDITS,
  type MasterAccount,
  type CreditTxn,
  type MasterRequest,
};

export interface DashboardStats {
  signupCount: number;
  creditQuota: number;
  creditAllocated: number; // 부여 누계
  creditRemaining: number;
  requestsTotal: number;
  requestsPending: number;
  requestsCompleted: number;
  // 크레딧 신청 (사용자 인앱 신청, §9.7)
  creditRequestsPending: number;
  creditRequestsTotal: number;
}

export interface CreditRequestRow {
  id: string;
  user_id: string;
  user_email: string;
  amount: number;
  reason: string | null;
  applicant_name: string | null;
  company_name: string | null;
  phone: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  granted_amount: number | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type CreditOp = 'add' | 'deduct' | 'set';

const shortNow = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

// ---------------- 가입 사용자 목록 (구글 셀프가입) ----------------
export async function listAccounts(): Promise<MasterAccount[]> {
  if (MOCK_MODE) {
    return [...getMockDb().accounts].sort((a, b) => a.email.localeCompare(b.email));
  }
  // 실제: profiles + user_credits + manual_grant 누계를 서버측에서 SECURITY DEFINER 로 조인
  const { data, error } = await supabase.rpc('list_accounts_with_credits');
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => ({
    id: String(r.id),
    email: String(r.email ?? ''),
    display_name: String(r.display_name ?? ''),
    balance: Number(r.balance ?? 0),
    max_credits: Number(r.max_credits ?? SIGNUP_INITIAL_CREDITS),
    last_active: (r.last_active as string) ?? null,
    created_at: String(r.created_at),
  }));
}

// ---------------- 대시보드 지표 ----------------
export async function getDashboardStats(): Promise<DashboardStats> {
  const accounts = await listAccounts();
  const requests = await listRequests();

  let allocated = 0;
  if (MOCK_MODE) {
    allocated = getMockDb().allocated;
  } else {
    // 실제: master_quota_remaining() 로부터 역산
    const { data, error } = await supabase.rpc('master_quota_remaining');
    if (!error && typeof data === 'number') {
      allocated = Math.max(MASTER_CREDIT_QUOTA - data, 0);
    }
  }

  // 크레딧 신청 카운트
  let creditRequestsPending = 0;
  let creditRequestsTotal = 0;
  if (!MOCK_MODE) {
    const [pendingRes, totalRes] = await Promise.all([
      supabase.from('credit_requests').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      supabase.from('credit_requests').select('*', { count: 'exact', head: true }),
    ]);
    creditRequestsPending = pendingRes.count ?? 0;
    creditRequestsTotal = totalRes.count ?? 0;
  }

  return {
    signupCount: accounts.length,
    creditQuota: MASTER_CREDIT_QUOTA,
    creditAllocated: allocated,
    creditRemaining: MASTER_CREDIT_QUOTA - allocated,
    requestsTotal: requests.length,
    requestsPending: requests.filter((r) => r.status === 'pending').length,
    requestsCompleted: requests.filter((r) => r.status === 'completed').length,
    creditRequestsPending,
    creditRequestsTotal,
  };
}

// ---------------- 크레딧 신청 (마스터 대기함) ----------------
export async function listCreditRequests(status?: 'pending' | 'all'): Promise<CreditRequestRow[]> {
  if (MOCK_MODE) return [];
  let q = supabase
    .from('credit_requests')
    .select('id, user_id, amount, reason, applicant_name, company_name, phone, status, granted_amount, reviewer_note, reviewed_at, created_at, profiles!credit_requests_user_id_fkey(email)')
    .order('created_at', { ascending: false });
  if (status === 'pending' || status === undefined) {
    q = q.eq('status', 'pending');
  }
  const { data, error } = await q;
  if (error || !data) return [];
  return (data as Array<Record<string, unknown>>).map((r) => {
    const prof = r.profiles as { email?: string } | null;
    return {
      id: String(r.id),
      user_id: String(r.user_id),
      user_email: String(prof?.email ?? ''),
      amount: Number(r.amount ?? 0),
      reason: (r.reason as string) ?? null,
      applicant_name: (r.applicant_name as string) ?? null,
      company_name: (r.company_name as string) ?? null,
      phone: (r.phone as string) ?? null,
      status: r.status as CreditRequestRow['status'],
      granted_amount: r.granted_amount == null ? null : Number(r.granted_amount),
      reviewer_note: (r.reviewer_note as string) ?? null,
      reviewed_at: (r.reviewed_at as string) ?? null,
      created_at: String(r.created_at),
    };
  });
}

export async function approveCreditRequest(
  requestId: string,
  grantedAmount: number | null,
  note: string | null
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('approve_credit_request', {
    p_request_id: requestId,
    p_granted_amount: grantedAmount,
    p_note: note,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function rejectCreditRequest(
  requestId: string,
  note: string
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase.rpc('reject_credit_request', {
    p_request_id: requestId,
    p_note: note,
  });
  return error ? { ok: false, error: error.message } : { ok: true };
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
      account_email: a.email,
      type: 'manual',
      description: reason || (op === 'deduct' ? '마스터 차감' : op === 'set' ? '마스터 잔액 설정' : '마스터 지급'),
      amount: delta,
      balance_after: newBalance,
      created_at: shortNow(),
    });
    return { ok: true, balance: newBalance };
  }

  // 실제 모드: PRD v1.4 §9.2 MASTER-04 에 따라 지급('add') 만 허용
  if (op !== 'add') {
    return { ok: false, error: '지급(add) 만 허용됩니다. 차감·강제 설정은 정책상 제거되었습니다.' };
  }
  const { data, error } = await supabase.rpc('admin_grant_credit', {
    p_target_user_id: id,
    p_amount: amount,
    p_note: reason,
  });
  if (error) return { ok: false, error: error.message };
  const row = (data as Array<{ balance: number }> | null)?.[0];
  return { ok: true, balance: row?.balance };
}

// ---------------- 사용 이력 ----------------
export interface TxnFilter {
  account_email?: string; // 'all' or specific
  type?: 'all' | 'deduct' | 'manual';
}

export async function listTransactions(filter?: TxnFilter): Promise<CreditTxn[]> {
  if (MOCK_MODE) {
    let rows = [...getMockDb().txns];
    if (filter?.account_email && filter.account_email !== 'all') {
      rows = rows.filter((r) => r.account_email === filter.account_email);
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
  // TODO: user_id → email 매핑(뷰/조인)
  return data.map((t) => ({
    id: t.id,
    account_email: t.user_id,
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
    account_email: String(r.requester_email ?? ''),
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
  const header = '일시,이메일,유형,내용,변동,잔액';
  const lines = rows.map((r) =>
    [r.created_at, r.account_email, r.type, `"${r.description.replace(/"/g, '""')}"`, r.amount, r.balance_after].join(',')
  );
  return [header, ...lines].join('\n');
}
