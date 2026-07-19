let tokenProvider: (() => Promise<string | null>) | null = null;

export function setAuthTokenProvider(provider: (() => Promise<string | null>) | null) {
  tokenProvider = provider;
}

export async function authToken(): Promise<string | null> {
  return tokenProvider ? tokenProvider() : null;
}
