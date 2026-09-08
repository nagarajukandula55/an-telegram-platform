"use client";

import { useEffect, useState } from "react";
import { apiLogout, apiRefresh, LoginResult } from "./api";

const ACCESS_TOKEN_KEY = "an_wa_token";
const REFRESH_TOKEN_KEY = "an_wa_refresh_token";

/** Access tokens are short-lived (15m) — refresh proactively once within this margin of expiry. */
const REFRESH_MARGIN_MS = 60_000;

export function storeSession(result: Pick<LoginResult, "accessToken" | "refreshToken">) {
  window.localStorage.setItem(ACCESS_TOKEN_KEY, result.accessToken);
  window.localStorage.setItem(REFRESH_TOKEN_KEY, result.refreshToken);
}

function accessTokenExpiryMs(token: string): number | null {
  try {
    const payload = JSON.parse(atob(token.split(".")[1]));
    return typeof payload.exp === "number" ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

export function useAuthToken(): string | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function ensureFreshToken() {
      const accessToken = window.localStorage.getItem(ACCESS_TOKEN_KEY);
      const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
      if (!accessToken || !refreshToken) {
        window.location.href = "/login";
        return;
      }

      const expiresAt = accessTokenExpiryMs(accessToken);
      const needsRefresh = expiresAt === null || expiresAt - Date.now() < REFRESH_MARGIN_MS;

      if (!needsRefresh) {
        if (!cancelled) setToken(accessToken);
        scheduleNextCheck(expiresAt);
        return;
      }

      try {
        const result = await apiRefresh(refreshToken);
        storeSession(result);
        if (!cancelled) setToken(result.accessToken);
        scheduleNextCheck(accessTokenExpiryMs(result.accessToken));
      } catch {
        window.localStorage.removeItem(ACCESS_TOKEN_KEY);
        window.localStorage.removeItem(REFRESH_TOKEN_KEY);
        window.location.href = "/login";
      }
    }

    function scheduleNextCheck(expiresAt: number | null) {
      const delay = expiresAt === null ? REFRESH_MARGIN_MS : Math.max(expiresAt - Date.now() - REFRESH_MARGIN_MS, 5_000);
      timer = setTimeout(ensureFreshToken, delay);
    }

    void ensureFreshToken();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return token;
}

export function logout() {
  const refreshToken = window.localStorage.getItem(REFRESH_TOKEN_KEY);
  const clearAndRedirect = () => {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
    window.localStorage.removeItem(REFRESH_TOKEN_KEY);
    window.location.href = "/login";
  };
  if (refreshToken) {
    void apiLogout(refreshToken).finally(clearAndRedirect);
  } else {
    clearAndRedirect();
  }
}
