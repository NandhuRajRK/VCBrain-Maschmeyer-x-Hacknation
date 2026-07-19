export function workspaceUserName(): string {
  if (typeof window === "undefined") return "there";
  return localStorage.getItem("iskra-user-name") || process.env.NEXT_PUBLIC_USER_NAME || "Nandhu";
}

export function timeGreeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}
