export type PasswordResetProof =
  | { method: "better-auth"; token: string }
  | { method: "supabase-access"; accessToken: string }
  | { method: "supabase-hash"; tokenHash: string };

function paramsFrom(value: string) {
  const trimmed = value.startsWith("?") || value.startsWith("#") ? value.slice(1) : value;
  return new URLSearchParams(trimmed);
}

export function resetPasswordTokenFromSearch(search: string) {
  return paramsFrom(search).get("token")?.trim() || null;
}

export function passwordResetProofFromLocation(
  search: string,
  hash = "",
): PasswordResetProof | null {
  const query = paramsFrom(search);
  const fragment = paramsFrom(hash.includes("=") ? hash : "");
  const tokenHash = (query.get("token_hash") ?? fragment.get("token_hash"))?.trim();
  const type = (query.get("type") ?? fragment.get("type"))?.trim();
  if (tokenHash && (!type || type === "recovery")) {
    return { method: "supabase-hash", tokenHash };
  }
  const accessToken = fragment.get("access_token")?.trim();
  if (accessToken && (fragment.get("type") === "recovery" || !fragment.get("type"))) {
    return { method: "supabase-access", accessToken };
  }
  const token = query.get("token")?.trim();
  if (token) return { method: "better-auth", token };
  return null;
}

export function resetPasswordBody(proof: PasswordResetProof, password: string) {
  if (proof.method === "better-auth") return { newPassword: password, token: proof.token };
  if (proof.method === "supabase-hash") {
    return { newPassword: password, tokenHash: proof.tokenHash };
  }
  return { newPassword: password, accessToken: proof.accessToken };
}
