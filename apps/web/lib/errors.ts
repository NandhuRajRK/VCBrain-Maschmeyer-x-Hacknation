import { ApiError } from "./api";

export type ErrorContext = "application" | "assistant" | "company" | "dashboard" | "search" | "voice";

const FALLBACKS: Record<ErrorContext, string> = {
  application: "We could not analyze this application. Your entries are still here, so you can try again.",
  assistant: "Iskra could not answer right now. Please try again in a moment.",
  company: "We could not load this company analysis. Return to the pipeline and try again.",
  dashboard: "We could not load the investment pipeline. Check the API connection and refresh.",
  search: "Iskra could not complete that search. Adjust the query or try again.",
  voice: "Iskra could not process that recording. Please try a shorter recording.",
};

export function userError(error: unknown, context: ErrorContext): string {
  if (error instanceof DOMException && error.name === "NotAllowedError") {
    return "Microphone access is blocked. Allow microphone access in your browser settings and try again.";
  }
  if (error instanceof ApiError) {
    if (error.status === 401 || error.status === 403) return "Your session does not have access to this workspace. Sign in again or ask your firm administrator.";
    if (error.status === 404) return context === "company" ? "This company is no longer available in the current workspace." : "The requested record could not be found.";
    if (error.status === 409) return "That record already exists or was changed by a teammate. Refresh and try again.";
    if (error.status === 413) return "That file is too large. Upload a smaller document and try again.";
    if (error.status === 422) return "Some submitted information is invalid. Review the highlighted fields and try again.";
    if (error.status === 429) return "The analysis service is at its current limit. Wait a moment and try again.";
    if (error.status >= 500) return "The analysis service encountered a problem. Your data is safe; please try again shortly.";
  }
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) {
    return "Iskra cannot reach the API. Confirm the backend is running, then try again.";
  }
  return FALLBACKS[context];
}
