// =============================================================
//  동영상 생성 큐 (전역, 컴포넌트 언마운트 시에도 유지)
//
//  왜 전역인가?
//    사용자가 동영상 생성 중에 다른 메뉴로 넘어가도, 생성은 백그라운드로
//    계속되어야 하고, 다시 돌아왔을 때 진행 상황과 완료된 결과가 그대로
//    보여야 한다. 컴포넌트 지역 state 로는 이 요구를 못 채운다.
//
//  Kling 스타일:
//    새로 생성할 때마다 큐 아래에 카드가 추가되고, 이전 결과는 그대로 남아
//    스크롤로 훑어볼 수 있다. `newest === last` (오래된 것이 위, 최신이 아래).
// =============================================================

import { create } from 'zustand';
import type { ConcreteAspect, VideoDuration } from '../services/videoStudioService';

export type VideoJobStatus = 'generating' | 'done' | 'failed';

export interface VideoJob {
  id: string;                     // 클라이언트 UUID (히스토리 id 와 별개)
  status: VideoJobStatus;
  prompt: string;
  aspect: ConcreteAspect;
  durationSec: VideoDuration;
  hasStartFrame: boolean;
  hasEndFrame: boolean;
  createdAt: number;
  /** 완료 시 signed URL (히스토리에서 복원된 값). 실패 시 undefined. */
  videoUrl?: string;
  /** 완료 시 video_generation_history.id — 리믹스/삭제에 사용. */
  historyId?: string;
  /** 실패 시 사용자에게 보여줄 짧은 메시지. */
  error?: string;
}

interface VideoGenStore {
  jobs: VideoJob[];
  addJob: (input: Omit<VideoJob, 'createdAt' | 'status' | 'videoUrl' | 'historyId' | 'error'>) => void;
  updateJob: (id: string, patch: Partial<VideoJob>) => void;
  removeJob: (id: string) => void;
  /** 완료·실패한 카드만 정리 (진행 중은 남긴다). */
  clearFinished: () => void;
}

export const useVideoGenStore = create<VideoGenStore>((set) => ({
  jobs: [],
  addJob: (input) =>
    set((s) => ({
      jobs: [
        ...s.jobs,
        { ...input, createdAt: Date.now(), status: 'generating' as const },
      ],
    })),
  updateJob: (id, patch) =>
    set((s) => ({
      jobs: s.jobs.map((j) => (j.id === id ? { ...j, ...patch } : j)),
    })),
  removeJob: (id) =>
    set((s) => ({
      jobs: s.jobs.filter((j) => j.id !== id),
    })),
  clearFinished: () =>
    set((s) => ({
      jobs: s.jobs.filter((j) => j.status === 'generating'),
    })),
}));
