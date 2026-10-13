/** Read only OAuth errors, never expose callback tokens or raw provider messages. */
export function getAuthRedirectError(search: string, hash: string): string | null {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  const code = query.get('error_code') ?? fragment.get('error_code')
    ?? query.get('error') ?? fragment.get('error');
  if (!code) return null;
  if (code === 'access_denied') return 'GOOGLE_ACCESS_DENIED';
  if (code === 'server_error' || code === 'unexpected_failure') return 'GOOGLE_CALLBACK_FAILED';
  return 'GOOGLE_LOGIN_FAILED';
}
