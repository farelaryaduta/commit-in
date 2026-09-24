const PLACEHOLDER = "[REDACTED]";

/** Redact private key blocks and well-known secret formats from arbitrary text. */
export function redact(text: string): string {
  return text
    .replace(
      /-----BEGIN[^-]*?PRIVATE KEY[^-]*?-----[\s\S]*?-----END[^-]*?PRIVATE KEY[^-]*?-----/gi,
      PLACEHOLDER,
    )
    .replace(/\bAKIA[0-9A-Z]{16}\b/g, PLACEHOLDER)
    .replace(
      /\b(sk-[A-Za-z0-9_-]{20,}|ghp_[A-Za-z0-9]{30,}|gho_[A-Za-z0-9]{30,}|ghu_[A-Za-z0-9]{30,})\b/g,
      PLACEHOLDER,
    )
    .replace(
      /\b(api[_-]?key|apikey|secret|token|password|passwd|client[_-]?secret)\b(\s*[:=]\s*)(['"]?)([^\s"']{8,})\3?/gi,
      (_match, key: string, sep: string) => `${key}${sep}${PLACEHOLDER}`,
    );
}