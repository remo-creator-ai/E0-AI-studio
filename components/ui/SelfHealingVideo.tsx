// =============================================================
//  SelfHealingVideo — 만료된 Supabase signed URL 을 스스로 복구하는 <video>
//
//  배경:
//    video-history 버킷의 signed URL 은 TTL 1시간. project.scenes[].video_url
//    에 박아 두면 한 시간만 지나도 403 이 되어 플레이어가 "검은 화면" 으로 보인다.
//    마운트 시 일괄 재발급(refreshVideoSignedUrl)만으로는 부족하다 —
//      · 재발급 요청이 실패/누락되면 그 씬만 조용히 검은 화면으로 남고
//      · 오래 켜둔 탭은 세션 도중 다시 만료된다.
//
//  그래서 재생 실패(onError) 시점에 URL 을 한 번 재발급해 스스로 복구하고,
//  복구한 URL 을 onHealed 로 올려보내 호출부가 영구 저장하도록 한다.
//
//  poster 를 넘기면 로딩·복구 중에도 검은 사각형 대신 스틸이 보인다
//  (씬 영상의 첫 프레임 = 씬 이미지라 시각적으로 자연스럽다).
// =============================================================

import React, { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { refreshVideoSignedUrl } from '../../services/videoHistoryService';

export interface SelfHealingVideoProps
  extends Omit<React.VideoHTMLAttributes<HTMLVideoElement>, 'src'> {
  src?: string;
  /** 재발급에 성공했을 때 새 URL 을 알려준다. 호출부가 store/DB 에 반영할 것. */
  onHealed?: (freshUrl: string, staleUrl: string) => void;
}

export const SelfHealingVideo = React.forwardRef<HTMLVideoElement, SelfHealingVideoProps>(
  ({ src, onHealed, onError, preload = 'metadata', ...rest }, ref) => {
    const innerRef = useRef<HTMLVideoElement>(null);
    useImperativeHandle(ref, () => innerRef.current as HTMLVideoElement);

    const [resolved, setResolved] = useState(src);
    // 같은 src 로 무한 재발급 루프에 빠지지 않도록 시도한 URL 을 기억한다.
    const attemptedRef = useRef<string | null>(null);

    useEffect(() => {
      setResolved(src);
      attemptedRef.current = null;
    }, [src]);

    const handleError = useCallback(
      (e: React.SyntheticEvent<HTMLVideoElement, Event>) => {
        onError?.(e);
        const stale = resolved;
        if (!stale || attemptedRef.current === stale) return;
        attemptedRef.current = stale;
        void (async () => {
          const fresh = await refreshVideoSignedUrl(stale);
          if (!fresh || fresh === stale) return; // 재발급 불가(파일 삭제·외부 URL) → 그대로 둔다
          setResolved(fresh);
          onHealed?.(fresh, stale);
        })();
      },
      [resolved, onError, onHealed],
    );

    return <video ref={innerRef} src={resolved || undefined} preload={preload} onError={handleError} {...rest} />;
  },
);
SelfHealingVideo.displayName = 'SelfHealingVideo';
