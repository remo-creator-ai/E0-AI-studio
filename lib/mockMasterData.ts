// =============================================================
//  마스터 콘솔 디자인용 목 데이터 (MOCK_MODE 전용)
//  실제 백엔드가 붙기 전, 계정/크레딧/이력/의뢰 화면을 디자인·확인하기 위한
//  인메모리 샘플 데이터. 생성/정지/크레딧 조정이 세션 동안 반영된다.
//  (새로고침하면 초기값으로 리셋 — 디자인 확인 용도)
// =============================================================

export const MASTER_MAX_SLOTS = 20;
export const MASTER_CREDIT_QUOTA = 60000; // REMO가 설정하는 부여 한도(누계)
export const DEFAULT_INITIAL_CREDITS = 60;

export type AccountStatus = 'active' | 'suspended';
export type TxnType = 'deduct' | 'manual' | 'refund';

export interface MasterAccount {
  id: string;
  login_id: string;
  display_name: string;
  balance: number;
  max_credits: number;
  status: AccountStatus;
  last_active: string | null;
  created_at: string;
}

export interface CreditTxn {
  id: string;
  account_login_id: string;
  type: TxnType;
  description: string;
  amount: number;
  balance_after: number;
  created_at: string;
}

export interface MasterRequest {
  id: string;
  account_login_id: string;
  project_title: string;
  purpose: string;
  recipient_email: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  attachments: string[];
  created_at: string;
}

function acc(
  login_id: string,
  display_name: string,
  balance: number,
  status: AccountStatus,
  last_active: string | null,
  created_at: string
): MasterAccount {
  return { id: `mock-${login_id}`, login_id, display_name, balance, max_credits: 60, status, last_active, created_at };
}

// 발급계정 12개 (활성 10 · 정지 2) — 시안 수치와 정합
const SEED_ACCOUNTS: MasterAccount[] = [
  acc('sodam-gangnam', '소담-강남점', 320, 'active', '2026-07-09', '2026-05-02'),
  acc('sodam-hongdae', '소담-홍대점', 0, 'suspended', '2026-07-01', '2026-05-02'),
  acc('sodam-busan', '소담-부산점', 150, 'active', '2026-07-08', '2026-05-10'),
  acc('sodam-daegu', '소담-대구점', 240, 'active', '2026-07-07', '2026-05-12'),
  acc('sodam-incheon', '소담-인천점', 60, 'active', '2026-07-06', '2026-05-18'),
  acc('sodam-suwon', '소담-수원점', 410, 'active', '2026-07-05', '2026-05-20'),
  acc('sodam-jeju', '소담-제주점', 55, 'active', '2026-07-04', '2026-06-01'),
  acc('sodam-ilsan', '소담-일산점', 0, 'suspended', '2026-06-20', '2026-06-01'),
  acc('sodam-pangyo', '소담-판교점', 180, 'active', '2026-07-09', '2026-06-08'),
  acc('sodam-sinchon', '소담-신촌점', 95, 'active', '2026-07-03', '2026-06-11'),
  acc('sodam-yeouido', '소담-여의도점', 300, 'active', '2026-07-02', '2026-06-15'),
  acc('sodam-gwangju', '소담-광주점', 130, 'active', '2026-06-30', '2026-06-22'),
];

const SEED_TXNS: CreditTxn[] = [
  { id: 't1', account_login_id: 'sodam-gangnam', type: 'deduct', description: '스토리보드 생성 (Nano Banana 2)', amount: -3, balance_after: 317, created_at: '2026-07-09 14:22' },
  { id: 't2', account_login_id: 'sodam-gangnam', type: 'deduct', description: '4K 업스케일 (CUT #3)', amount: -5, balance_after: 320, created_at: '2026-07-09 14:05' },
  { id: 't3', account_login_id: 'sodam-gangnam', type: 'manual', description: '7월 정기 지급 (마스터)', amount: 100, balance_after: 325, created_at: '2026-07-08 10:00' },
  { id: 't4', account_login_id: 'sodam-gangnam', type: 'deduct', description: '스크립트 생성', amount: -1, balance_after: 225, created_at: '2026-07-07 16:40' },
  { id: 't5', account_login_id: 'sodam-busan', type: 'deduct', description: '스토리보드 생성', amount: -3, balance_after: 150, created_at: '2026-07-08 11:12' },
  { id: 't6', account_login_id: 'sodam-hongdae', type: 'manual', description: '초기 크레딧 부여', amount: 60, balance_after: 60, created_at: '2026-05-02 09:00' },
];

const SEED_REQUESTS: MasterRequest[] = [
  { id: 'r1', account_login_id: 'sodam-busan', project_title: '부산점 홍보영상', purpose: '광고 / 홍보', recipient_email: 'momo.ai.fren@gmail.com', status: 'pending', attachments: ['storyboard.json', 'assets.zip'], created_at: '2026-07-09 15:10' },
  { id: 'r2', account_login_id: 'sodam-gangnam', project_title: '강남점 오픈', purpose: 'SNS', recipient_email: 'momo.ai.fren@gmail.com', status: 'completed', attachments: ['storyboard.json'], created_at: '2026-07-07 11:30' },
  { id: 'r3', account_login_id: 'sodam-hongdae', project_title: '홍대점 이벤트', purpose: '매장', recipient_email: 'momo.ai.fren@gmail.com', status: 'completed', attachments: ['storyboard.json', 'assets.zip'], created_at: '2026-07-05 09:15' },
];

// 부여 누계(평생 총량) — 시안 대시보드의 배분 4,420 기준 초기값
const SEED_ALLOCATED = 4420;

// ---- 인메모리 가변 상태 (세션 동안 유지) ----
interface MockDb {
  accounts: MasterAccount[];
  txns: CreditTxn[];
  requests: MasterRequest[];
  allocated: number; // 부여 누계
}

let db: MockDb | null = null;

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v));
}

export function getMockDb(): MockDb {
  if (!db) {
    db = {
      accounts: clone(SEED_ACCOUNTS),
      txns: clone(SEED_TXNS),
      requests: clone(SEED_REQUESTS),
      allocated: SEED_ALLOCATED,
    };
  }
  return db;
}
