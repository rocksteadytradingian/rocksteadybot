const LINGUI_ID = /^[A-Za-z0-9+/]{6}$/;
const ENGLISH_WORD = /^[A-Z][a-z]{5}$/;

function readableCopy(value: string | undefined): string | undefined {
  const message = value?.trim() ?? "";
  if (!message) return undefined;
  // Production Lingui looks up a 6-character id and renders that id when the
  // catalog has no entry (ROjpWW for "Can't reach the server" without a period).
  if (LINGUI_ID.test(message) && !ENGLISH_WORD.test(message)) return undefined;
  return message;
}

function isUnreachable(message: string) {
  return /fetch failed|failed to fetch|networkerror|load failed|network request failed|econnrefused/i.test(
    message,
  );
}

function isInvalidCredentials(
  error: { message?: string | null; code?: string | null } | null | undefined,
) {
  return /invalid email or password|INVALID_EMAIL_OR_PASSWORD/i.test(
    `${error?.code ?? ""} ${error?.message ?? ""}`,
  );
}

export function authErrorMessage(
  error: { message?: string | null; code?: string | null } | null | undefined,
  fallback: string,
  unreachable: string,
  invalidCredentials = "Invalid email or password",
): string {
  const message = error?.message?.trim() ?? "";
  if (isUnreachable(message)) {
    return readableCopy(unreachable) ?? readableCopy(fallback) ?? "Can't reach the server.";
  }
  if (isInvalidCredentials(error)) {
    return readableCopy(invalidCredentials) ?? "Invalid email or password";
  }
  return (
    readableCopy(message) ??
    readableCopy(error?.code ?? undefined) ??
    readableCopy(fallback) ??
    "Could not continue"
  );
}
