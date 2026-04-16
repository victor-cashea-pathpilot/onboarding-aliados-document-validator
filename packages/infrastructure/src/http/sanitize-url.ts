export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) {
    return null;
  }

  const parsed = new URL(url);
  parsed.search = '';
  parsed.hash = '';
  return parsed.toString();
}
