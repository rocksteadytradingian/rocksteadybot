const QUOTA_ERROR =
  /(?:^|\b)429\b|quotaExceeded|RESOURCE_EXHAUSTED|rate[- ]?limit|too many requests|quota exceeded/i;

const QUOTA_GUIDANCE =
  "Provider quota was exceeded. Wait before retrying this plugin tool. Do not operate the app in the computer browser as a fallback.";

export function isConnectorQuotaError(message: string): boolean {
  return QUOTA_ERROR.test(message);
}

/** Keep 429 / quotaExceeded from turning into a browser-automation retry storm. */
export function guideConnectorProviderError(message: string): string {
  if (!isConnectorQuotaError(message)) return message;
  if (message.includes(QUOTA_GUIDANCE)) return message;
  return `${message} ${QUOTA_GUIDANCE}`;
}
