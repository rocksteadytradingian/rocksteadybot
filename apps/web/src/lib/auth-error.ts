export const AUTH_UNREACHABLE = "Can't reach the server.";
export const AUTH_INVALID_CREDENTIALS = "Invalid email or password";
export const AUTH_FALLBACK = "Could not continue";

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
  fallback = AUTH_FALLBACK,
  unreachable = AUTH_UNREACHABLE,
  invalidCredentials = AUTH_INVALID_CREDENTIALS,
): string {
  const message = error?.message?.trim() ?? "";
  if (isUnreachable(message)) {
    return readableCopy(unreachable) ?? readableCopy(fallback) ?? AUTH_UNREACHABLE;
  }
  if (isInvalidCredentials(error)) {
    return readableCopy(invalidCredentials) ?? AUTH_INVALID_CREDENTIALS;
  }
  return (
    readableCopy(message) ??
    readableCopy(error?.code ?? undefined) ??
    readableCopy(fallback) ??
    AUTH_FALLBACK
  );
}

export async function probeSameOriginApi(fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    const get = await fetchImpl("/rpc/health", { method: "GET" });
    if (get.ok) return true;
  } catch {
    // Fall through to the POST contract used by older API images.
  }
  try {
    const post = await fetchImpl("/rpc/health", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ json: {} }),
    });
    return post.ok;
  } catch {
    return false;
  }
}
