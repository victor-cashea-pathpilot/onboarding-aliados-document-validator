export function getCaseExplorerApiUrl(): string {
  return (
    process.env.CASE_EXPLORER_API_URL ??
    process.env.TS_CASE_EXPLORER_API_URL ??
    'http://127.0.0.1:3000'
  );
}

export function getCaseExplorerApiAudience(): string {
  return process.env.CASE_EXPLORER_API_AUDIENCE ?? getCaseExplorerApiUrl();
}
