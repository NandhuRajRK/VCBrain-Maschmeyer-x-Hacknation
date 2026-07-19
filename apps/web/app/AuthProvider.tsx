"use client";

import { ClerkProvider, useAuth, useClerk, useUser } from "@clerk/nextjs";
import { createContext, useContext, useEffect } from "react";
import { setAuthTokenProvider } from "../lib/auth-token";

type WorkspaceAuth = {
  configured: boolean;
  ready: boolean;
  name: string;
  userId: string | null;
  organizationId: string | null;
  organizationName: string;
  signOut: () => Promise<void>;
};
const AuthContext = createContext<WorkspaceAuth>({ configured: false, ready: true, name: "Analyst", userId: "demo-user", organizationId: null, organizationName: "Demo workspace", signOut: async () => {} });

function ClerkBridge({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded: authLoaded, orgId } = useAuth();
  const { signOut } = useClerk();
  const { user, isLoaded: userLoaded } = useUser();
  useEffect(() => {
    setAuthTokenProvider(() => getToken());
    return () => setAuthTokenProvider(null);
  }, [getToken]);
  const name = user?.fullName || user?.firstName || "Investor";
  return <AuthContext.Provider value={{
    configured: true,
    ready: authLoaded && userLoaded,
    name,
    userId: user?.id ?? null,
    organizationId: orgId ?? null,
    organizationName: orgId ? "Firm workspace" : "Choose a workspace",
    signOut: () => signOut({ redirectUrl: "/sign-in" }),
  }}>{children}</AuthContext.Provider>;
}

export default function AuthProvider({ children }: { children: React.ReactNode }) {
  const key = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  if (!key) {
    return <AuthContext.Provider value={{ configured: false, ready: true, name: process.env.NEXT_PUBLIC_USER_NAME || "Analyst", userId: "demo-user", organizationId: null, organizationName: "Demo workspace", signOut: async () => {} }}>{children}</AuthContext.Provider>;
  }
  return <ClerkProvider publishableKey={key}><ClerkBridge>{children}</ClerkBridge></ClerkProvider>;
}

export function useWorkspaceAuth() {
  return useContext(AuthContext);
}
