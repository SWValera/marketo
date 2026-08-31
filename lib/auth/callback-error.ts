export type AuthCallbackError = "expired" | "invalid";

export function classifyAuthCallbackError(error: { message?: string; code?: string } | null): AuthCallbackError {
  const description = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
  return /expired|otp_expired|token.*old/.test(description) ? "expired" : "invalid";
}
