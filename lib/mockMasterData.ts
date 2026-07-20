// =============================================================
//  마스터 콘솔 디자인용 목 데이터 (MOCK_MODE 전용)
//  실제 백엔드가 붙기 전, 가입 사용자·크레딧·이력·의뢰 화면을 디자인·확인하기 위한
//  인메모리 샘플 데이터. 크레딧 지급이 세션 동안 반영된다.
//  (새로고침하면 초기값으로 리셋 — 디자인 확인 용도)
// =============================================================

export const MASTER_CREDIT_QUOTA = 60000; // REMO가 설정하는 부여 한도(누계)
export const SIGNUP_INITIAL_CREDITS = 20; // 구글 가입 시 자동 부여 크레딧

export type TxnType = 'deduct' | 'manual' | 'refund';

export interface MasterAccount {
  id: string;
  email: string;
  display_name: string;
  balance: number;
  max_credits: number;
  last_active: string | null;
  created_at: string;
}

export interface CreditTxn {
  id: string;
  account_email: string;
  type: TxnType;
  description: string;
  amount: number;
  balance_after: number;
  created_at: string;
}

export interface MasterRequest {
  id: string;
  account_email: string;
  project_title: string;
  purpose: string;
  recipient_email: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  attachments: string[];
  created_at: string;
}

function acc(
  email: string,
  display_name: string,
  balance: number,
  last_active: string | null,
  created_at: string
): MasterAccount {
  return { id: `mock-${email}`, email, display_name, balance, max_credits: 20, last_active, created_at };
}

// 구글로 가입한 사용자 12명 — 시안 수치와 정합
const SEED_ACCOUNTS: MasterAccount[] = [
  acc('gangnam.sodam@gmail.com', '소담-강남점', 320, '2026-07-09', '2026-05-02'),
  acc('hongdae.sodam@gmail.com', '소담-홍대점', 0, '2026-07-01', '2026-05-02'),
  acc('busan.sodam@gmail.com', '소담-부산점', 150, '2026-07-08', '2026-05-10'),
  acc('daegu.sodam@gmail.com', '소담-대구점', 240, '2026-07-07', '2026-05-12'),
  acc('incheon.sodam@gmail.com', '소담-인천점', 60, '2026-07-06', '2026-05-18'),
  acc('suwon.sodam@gmail.com', '소담-수원점', 410, '2026-07-05', '2026-05-20'),
  acc('jeju.sodam@gmail.com', '소담-제주점', 55, '2026-07-04', '2026-06-01'),
  acc('ilsan.sodam@gmail.com', '소담-일산점', 0, '2026-06-20', '2026-06-01'),
  acc('pangyo.sodam@gmail.com', '소담-판교점', 180, '2026-07-09', '2026-06-08'),
  acc('sinchon.sodam@gmail.com', '소담-신촌점', 95, '2026-07-03', '2026-06-11'),
  acc('yeouido.sodam@gmail.com', '소담-여의도점', 300, '2026-07-02', '2026-06-15'),
  acc('gwangju.sodam@gmail.com', '소담-광주점', 130, '2026-06-30', '2026-06-22'),
];

const SEED_TXNS: CreditTxn[] = [
  { id: 't1', account_email: 'gangnam.sodam@gmail.com', type: 'deduct', description: '스토리보드 생성 (Nano Banana 2)', amount: -3, balance_after: 317, created_at: '2026-07-09 14:22' },
  { id: 't2', account_email: 'gangnam.sodam@gmail.com', type: 'deduct', description: '4K 업스케일 (CUT #3)', amount: -5, balance_after: 320, created_at: '2026-07-09 14:05' },
  { id: 't3', account_email: 'gangnam.sodam@gmail.com', type: 'manual', description: '7월 정기 지급 (마스터)', amount: 100, balance_after: 325, created_at: '2026-07-08 10:00' },
  { id: 't4', account_email: 'gangnam.sodam@gmail.com', type: 'deduct', description: '스크립트 생성', amount: -1, balance_after: 225, created_at: '2026-07-07 16:40' },
  { id: 't5', account_email: 'busan.sodam@gmail.com', type: 'deduct', description: '스토리보드 생성', amount: -3, balance_after: 150, created_at: '2026-07-08 11:12' },
  { id: 't6', account_email: 'hongdae.sodam@gmail.com', type: 'manual', description: '가입 축하 크레딧', amount: 20, balance_after: 20, created_at: '2026-05-02 09:00' },
];

const SEED_REQUESTS: MasterRequest[] = [
  { id: 'r1', account_email: 'busan.sodam@gmail.com', project_title: '부산점 홍보영상', purpose: '광고 / 홍보', recipient_email: 'momo.ai.fren@gmail.com', status: 'pending', attachments: ['storyboard.json', 'assets.zip'], created_at: '2026-07-09 15:10' },
  { id: 'r2', account_email: 'gangnam.sodam@gmail.com', project_title: '강남점 오픈', purpose: 'SNS', recipient_email: 'momo.ai.fren@gmail.com', status: 'completed', attachments: ['storyboard.json'], created_at: '2026-07-07 11:30' },
  { id: 'r3', account_email: 'hongdae.sodam@gmail.com', project_title: '홍대점 이벤트', purpose: '매장', recipient_email: 'momo.ai.fren@gmail.com', status: 'completed', attachments: ['storyboard.json', 'assets.zip'], created_at: '2026-07-05 09:15' },
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
