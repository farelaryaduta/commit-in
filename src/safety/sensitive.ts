/** Paths whose content is treated as sensitive and never sent to a provider. */
const SENSITIVE_PATTERNS: RegExp[] = [
  /\.env$/, // base .env
  /\.env\.(?!example$|sample$|template$)[^.]+$/, // .env.* except documented ones
  /\.env\.local$/, // covered above, listed for clarity
  /\.pem$/,
  /\.key$/,
  /\.p12$/,
  /\.pfx$/,
  /(?:^|\/)id_rsa/,
  /(?:^|\/)id_ed25519/,
  /credentials\.json$/,
  /secrets\.[^.]+$/,
  /serviceAccount[^/]*\.json$/,
];

/**
 * Whether a staged path points to sensitive content (keys, secrets).
 * Returns the configured reason, or `undefined` when not sensitive.
 */
export function sensitiveReason(path: string): string | undefined {
  const normalized = path.replace(/\\/g, "/");
  for (const re of SENSITIVE_PATTERNS) {
    if (re.test(normalized)) {
      return re.source;
    }
  }
  return undefined;
}

export function isSensitive(path: string): boolean {
  return sensitiveReason(path) !== undefined;
}