import { IDENTITY_FILE_MAX_CHARS } from "@rakazo/core";
import type { MemoryDocument } from "@rakazo/contracts";
import type { ReactNode } from "react";

export function identityDocumentByPath(
  documents: readonly MemoryDocument[],
  path: string,
): MemoryDocument | undefined {
  const needle = path.toLowerCase();
  return documents.find(
    (document) => document.path.replaceAll("\\", "/").split("/").pop()?.toLowerCase() === needle,
  );
}

export function IdentityMarkdownField({
  path,
  hint,
  value,
  onChange,
  className = "mt-4 block text-[14px] text-[var(--rk-muted)]",
}: {
  path: string;
  hint: ReactNode;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={className}>
      <span className="font-mono text-[13px] text-[var(--rk-ink)]">{path}</span>
      <span className="mt-0.5 block text-[12.5px] text-[var(--rk-muted-2)]">{hint}</span>
      <textarea
        value={value}
        maxLength={IDENTITY_FILE_MAX_CHARS}
        onChange={(event) => onChange(event.target.value)}
        rows={7}
        data-testid={`identity-file-${path.toLowerCase()}`}
        className="mt-2 w-full rounded-[11px] border border-[var(--rk-hairline-strong)] bg-transparent px-3.5 py-3 font-mono text-[13px] leading-5 text-[var(--rk-ink)]"
      />
    </label>
  );
}
