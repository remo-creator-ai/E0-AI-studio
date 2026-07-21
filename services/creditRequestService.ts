// =============================================================
//  인앱 크레딧 신청 서비스 (PRD §9.7)
//  MOCK_MODE  → lib/mockMasterData 인메모리
//  실제 모드  → credit_requests 테이블(RLS) + 024 RPC
//  컴포넌트는 이 파일만 바라본다.
// =============================================================

import { supabase } from '../lib/supabase';
import { MOCK_MODE } from '../lib/mockAuth';
import { getMockDb, MASTER_CREDIT_QUOTA } from '../lib/mockMasterData';

export interface CreditRequest {
  id: string;
  user_id: string;
  user_email: string;        // 마스터 대기함 표시용(실제 모드는 profiles 조인)
  amount: number;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  granted_amount: number | null;
  reviewer_note: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export interface CreditPool {
  limit: number;
  granted: number;
  remaining: number;
}

const shortNow = () => new Date().toISOString().slice(0, 16).replace('T', ' ');

// ---------------- 사용자: 신청 생성 ----------------
export async function createCreditRequest(
  userId: string,
  userEmail: string,
  amount: number,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!amount || amount <= 0) return { ok: false, error: '요청 수량은 1 이상이어야 합니다.' };
  if (!reason.trim()) return { ok: false, error: '신청 사유를 입력해 주세요.' };

  if (MOCK_MODE) {
    const db = getMockDb();
    if (db.creditRequests.some((r) => r.user_id === userId && r.status === 'pending')) {
      return { ok: false, error: '이미 대기 중인 신청이 있습니다.' };
    }
    db.creditRequests.unshift({
      id: `cr-${Date.now()}`, user_id: userId, user_email: userEmail,
      amount, reason: reason.trim(), status: 'pending',
      granted_amount: null, reviewer_note: null, reviewed_at: null, created_at: shortNow(),
    });
    return { ok: true };
  }

  const { error } = await supabase
    .from('credit_requests')
    .insert({ user_id: userId, amount, reason: reason.trim() });
  if (error) {
    // 부분 UNIQUE(사용자당 pending 1건) 위반 등
    if (error.code === '23505') return { ok: false, error: '이미 대기 중인 신청이 있습니다.' };
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

// ---------------- 사용자: 내 신청 이력 ----------------
export async function listMyCreditRequests(userId: string): Promise<CreditRequest[]> {
  if (MOCK_MODE) {
    return getMockDb().creditRequests
      .filter((r) => r.user_id === userId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  }
  const { data, error } = await supabase
    .from('credit_requests')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false });
  if (error || !data) return [];
  return data.map((r) => toCreditRequest(r));
}

// ---------------- 사용자: 신청 취소 ----------------
export async function cancelCreditRequest(id: string): Promise<boolean> {
  if (MOCK_MODE) {
    const r = getMockDb().creditRequests.find((x) => x.id === id);
    if (r && r.status === 'pending') { r.status = 'cancelled'; return true; }
    return false;
  }
  const { data, error } = await supabase.rpc('cancel_credit_request', { p_request_id: id });
  return !error && data === true;
}

// ---------------- 마스터: 대기함(전체 신청) ----------------
export async function listAllCreditRequests(): Promise<CreditRequest[]> {
  if (MOCK_MODE) {
    return [...getMockDb().creditRequests].sort((a, b) => {
      // pending 먼저, 그다음 최신순
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return b.created_at.localeCompare(a.created_at);
    });
  }
  const { data, error } = await supabase
    .from('credit_requests')
    .select('*')
    .order('status', { ascending: true }) // 알파벳상 approved<cancelled<pending<rejected, UI에서 재정렬
    .order('created_at', { ascending: false });
  if (error || !data) return [];

  // user_id → email 매핑 (마스터는 013 정책으로 profiles 전체 조회 가능)
  const ids = [...new Set(data.map((r) => r.user_id))];
  const emailMap = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await supabase.from('profiles').select('id, email').in('id', ids);
    (profs ?? []).forEach((p) => emailMap.set(p.id, p.email ?? ''));
  }
  return data
    .map((r) => toCreditRequest(r, emailMap.get(r.user_id) ?? ''))
    .sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1;
      if (a.status !== 'pending' && b.status === 'pending') return 1;
      return b.created_at.localeCompare(a.created_at);
    });
}

// ---------------- 마스터: 신청 승인(조정 지급) ----------------
export async function approveCreditRequest(
  req: CreditRequest,
  grantAmount: number,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!grantAmount || grantAmount <= 0) return { ok: false, error: '지급 수량은 1 이상이어야 합니다.' };

  if (MOCK_MODE) {
    const db = getMockDb();
    if (db.allocated + grantAmount > MASTER_CREDIT_QUOTA) {
      return { ok: false, error: `잔여 지급 한도(${(MASTER_CREDIT_QUOTA - db.allocated).toLocaleString()})를 초과합니다.` };
    }
    const r = db.creditRequests.find((x) => x.id === req.id);
    if (!r || r.status !== 'pending') return { ok: false, error: '이미 처리된 신청입니다.' };
    r.status = 'approved'; r.granted_amount = grantAmount; r.reviewer_note = reason; r.reviewed_at = shortNow();
    db.allocated += grantAmount;
    // 수혜 계정 잔액/이력 반영(목 계정이 목록에 있으면)
    const acc = db.accounts.find((a) => a.email === req.user_email);
    if (acc) {
      acc.balance += grantAmount;
      db.txns.unshift({ id: `t-${Date.now()}`, account_email: acc.email, type: 'manual', description: reason || '크레딧 신청 승인', amount: grantAmount, balance_after: acc.balance, created_at: shortNow() });
    }
    return { ok: true };
  }

  const { data, error } = await supabase.rpc('master_grant_credit', {
    p_user_id: req.user_id, p_amount: grantAmount, p_reason: reason, p_request_id: req.id,
  });
  if (error) return { ok: false, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.ok) return { ok: false, error: row?.error ?? '지급에 실패했습니다.' };
  return { ok: true };
}

// ---------------- 마스터: 신청 반려 ----------------
export async function rejectCreditRequest(id: string, note: string): Promise<{ ok: boolean; error?: string }> {
  if (MOCK_MODE) {
    const r = getMockDb().creditRequests.find((x) => x.id === id);
    if (!r || r.status !== 'pending') return { ok: false, error: '이미 처리된 신청입니다.' };
    r.status = 'rejected'; r.reviewer_note = note; r.reviewed_at = shortNow();
    return { ok: true };
  }
  const { data, error } = await supabase.rpc('reject_credit_request', { p_request_id: id, p_note: note });
  if (error) return { ok: false, error: error.message };
  return { ok: data === true };
}

// ---------------- 마스터: pool 현황 ----------------
export async function getMasterCreditPool(): Promise<CreditPool> {
  if (MOCK_MODE) {
    const db = getMockDb();
    return { limit: MASTER_CREDIT_QUOTA, granted: db.allocated, remaining: MASTER_CREDIT_QUOTA - db.allocated };
  }
  const { data, error } = await supabase.rpc('get_master_credit_pool');
  const row = Array.isArray(data) ? data[0] : data;
  if (error || !row) return { limit: MASTER_CREDIT_QUOTA, granted: 0, remaining: MASTER_CREDIT_QUOTA };
  return { limit: row.pool_limit, granted: row.granted, remaining: row.remaining };
}

// ---------------- helpers ----------------
function toCreditRequest(r: Record<string, unknown>, email = ''): CreditRequest {
  return {
    id: String(r.id),
    user_id: String(r.user_id),
    user_email: email,
    amount: Number(r.amount),
    reason: String(r.reason ?? ''),
    status: (r.status as CreditRequest['status']) ?? 'pending',
    granted_amount: r.granted_amount == null ? null : Number(r.granted_amount),
    reviewer_note: r.reviewer_note == null ? null : String(r.reviewer_note),
    reviewed_at: r.reviewed_at == null ? null : String(r.reviewed_at),
    created_at: String(r.created_at ?? ''),
  };
}
