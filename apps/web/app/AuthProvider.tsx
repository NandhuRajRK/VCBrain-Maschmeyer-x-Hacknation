"use client";

import { ClerkProvider, useAuth, useClerk, useUser } from "@clerk/nextjs";
import { createContext, useContext, useEffect } from "react";
import { setAuthTokenProvider } from "../lib/auth-token";

type WorkspaceAuth = { configured: boolean; name: string; userId: string | null; signOut: () => Promise<void> };
const AuthContext = createContext<WorkspaceAuth>({ configured: false, name: "Nandhu", userId: "demo-user", signOut: async () => {} });

function ClerkBridge({ children }: { children: React.ReactNode }) {
  const { getToken } = useAuth();
  const { signOut } = useClerk();
  const { user } = useUser();
  useEffect(() => {
    setAuthTokenProvider(() => getToken());
    return () => setAuthTokenProvider(null);
  }, [getToken]);
  const name = user?.fullName || user?.firstName || user?.primaryEmailAddress?.emailAddress || "Investor";
  return <AuthContext.Provider value={{ configured: true, name, userId: user?.id ?? null, signOut: () => signOut({ redirectUrl: "/sign-in" }) }}>{children}</AuthContext.Provider>;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!key) {
    return <AuthContext.Provider value={{ configured: false, name: process.env.NEXT_PUBLIC_USER_NAME || "Nandhu", userId: "demo-user", signOut: async () => {} }}>{children}</AuthContext.Provider>;
  }
  return <ClerkProvider publishableKey={key}><ClerkBridge>{children}</ClerkBridge></ClerkProvider>;
}

export function useWorkspaceAuth() {
  return useContext(AuthContext);
}
