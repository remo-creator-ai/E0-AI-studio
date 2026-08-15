import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useModal } from '../components/ui/ModalProvider';
import { genErrorContent, genErrorSummary, type GenContext } from '../lib/genErrorMessages';

/**
 * 생성 실패를 사용자용 모달로 띄운다.
 *
 * 호출부는 원문을 직접 만지지 않는다:
 *   catch (e) { await showGenError(e, 'image'); }
 *
 * 영어 원문은 모달 하단에 접혀 들어가므로 디버깅 정보도 잃지 않는다.
 */
export function useGenErrorAlert() {
  const { alert } = useModal();
  const { t } = useTranslation();

  return useCallback(
    (error: unknown, ctx: GenContext) => {
      const c = genErrorContent(error, ctx, t);
      // 원문이 이미 한국어 안내문이면(예: '로그인이 필요합니다...') 접어둘 이유가 없다.
      const showDetail = /[A-Za-z]{4,}/.test(c.detail) && c.detail !== c.body;
      return alert(c.body, {
        type: 'error',
        title: c.title,
        hint: c.hint,
        code: c.code,
        detail: showDetail ? c.detail : undefined,
      });
    },
    [alert, t]
  );
}

/**
 * 배치 대시보드·씬 카드처럼 한 줄만 들어가는 자리용 요약 문자열.
 * 모달을 띄우지 않고 job.error 같은 상태에 저장할 때 쓴다.
 */
export function useGenErrorSummary() {
  const { t } = useTranslation();
  return useCallback((error: unknown) => genErrorSummary(error, t), [t]);
}
