import { useEffect, useState } from 'react';
import { useAuthStore } from '../store/authStore';
import { isAdmin, isMaster } from '../services/adminConfigService';

/** 관리자 메뉴·화면 노출 여부.
 *  VITE_ADMIN_EMAIL 은 배포 환경에 빠질 수 있으므로, DB 의 마스터 역할(is_master)도
 *  함께 본다. 실제 권한은 여전히 RLS/is_master() 가 강제한다. */
export function useIsMaster(): boolean {
  const user = useAuthStore((s) => s.user);
  const byEmail = isAdmin(user?.email ?? undefined);
  const [byRole, setByRole] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setByRole(false);
    if (!user) return;
    isMaster().then((ok) => { if (!cancelled) setByRole(ok); });
    return () => { cancelled = true; };
  }, [user?.id]);

  return byEmail || byRole;
}
