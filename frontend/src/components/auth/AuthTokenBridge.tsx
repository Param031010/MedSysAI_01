import { useEffect } from "react";
import { useAuth } from "@clerk/clerk-react";
import { setAuthTokenGetter } from "@/services/client";

/**
 * Mounted once near the app root. `services/client.ts` can't call Clerk's
 * `useAuth()` hook directly (it's plain functions, not components), so this
 * pushes the current session's `getToken` into that module whenever it
 * changes, letting every `apiFetch`/`apiUpload` call attach a fresh token.
 */
export function AuthTokenBridge() {
  const { getToken, isSignedIn } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(isSignedIn ? () => getToken() : null);
    return () => setAuthTokenGetter(null);
  }, [getToken, isSignedIn]);

  return null;
}
