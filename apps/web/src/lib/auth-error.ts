export function authErrorMessage(
  error: { message?: string | null } | null | undefined,
  fallback: string,
  unreachable: string,
): string {
  const message = error?.message?.trim() ?? "";
  if (
    /fetch failed|failed to fetch|networkerror|load failed|network request failed|econnrefused/i.test(
      message,
    )
  ) {
    return unreachable;
  }
  return message || fallback;
}
