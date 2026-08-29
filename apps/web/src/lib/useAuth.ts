"use client";

import { useEffect, useState } from "react";

export function useAuthToken(): string | null {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem("an_wa_token");
    if (!stored) {
      window.location.href = "/login";
      return;
    }
    setToken(stored);
  }, []);

  return token;
}

export function logout() {
  window.localStorage.removeItem("an_wa_token");
  window.location.href = "/login";
}
