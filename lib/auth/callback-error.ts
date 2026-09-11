export type AuthCallbackError = "expired" | "invalid" | "rate_limited" | "unavailable";

export function classifyAuthCallbackError(error: { message?: string; code?: string; status?: number } | null): AuthCallbackError {
  if (error?.status === 429 || ["over_email_send_rate_limit", "over_request_rate_limit", "rate_limit_exceeded"].includes(error?.code ?? "")) return "rate_limited";
  if ((error?.status ?? 0) >= 500 || error?.code === "unexpected_failure") return "unavailable";
  const description = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return /expired|otp_expired|token.*old|flow_state_not_found/.test(description) ? "expired" : "invalid";
}
