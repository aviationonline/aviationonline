/**
 * Formats a redirect or destination URL safely.
 * If the user provides a domain without http:// or https:// (e.g. "home.aviationonline.net"),
 * it automatically prepends "https://" so browsers don't treat it as a relative link.
 */
export function formatRedirectUrl(url?: string): string {
  if (!url) return 'https://aviationonline.fr/login';
  const trimmed = url.trim();
  if (!trimmed) return 'https://aviationonline.fr/login';

  // Relative path within the app
  if (trimmed.startsWith('/')) {
    return trimmed;
  }

  // Already includes protocol
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  // Domain like home.aviationonline.net -> https://home.aviationonline.net
  return `https://${trimmed}`;
}

export function isExternalUrl(url?: string): boolean {
  if (!url) return false;
  const formatted = formatRedirectUrl(url);
  return formatted.startsWith('http://') || formatted.startsWith('https://');
}
