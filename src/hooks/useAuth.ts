import { useState, useCallback } from 'react';

const HASH = import.meta.env.VITE_PASSWORD_HASH as string | undefined;
const SESSION_KEY = 'maps_private_auth';

async function sha256(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function useAuth() {
  const [authenticated, setAuthenticated] = useState(
    () => sessionStorage.getItem(SESSION_KEY) === 'true',
  );

  const hasPassword = !!HASH;

  const verify = useCallback(async (password: string): Promise<boolean> => {
    if (!HASH) return false;
    const hash = await sha256(password.trim());
    if (hash === HASH) {
      sessionStorage.setItem(SESSION_KEY, 'true');
      setAuthenticated(true);
      return true;
    }
    return false;
  }, []);

  const logout = useCallback(() => {
    sessionStorage.removeItem(SESSION_KEY);
    setAuthenticated(false);
  }, []);

  return { authenticated, hasPassword, verify, logout };
}
