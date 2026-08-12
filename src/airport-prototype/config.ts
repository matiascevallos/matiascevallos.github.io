/**
 * Mapbox public token configuration.
 *
 * Priority:
 * 1. window.AIRPORT_PROTOTYPE_CONFIG.MAPBOX_TOKEN (from airport-prototype/config.js)
 * 2. VITE_MAPBOX_TOKEN at build time (local dev via .env)
 *
 * Never commit a real token — use config.example.js as a template.
 */
export function getMapboxToken(): string {
  if (typeof window !== 'undefined' && window.AIRPORT_PROTOTYPE_CONFIG?.MAPBOX_TOKEN) {
    return window.AIRPORT_PROTOTYPE_CONFIG.MAPBOX_TOKEN;
  }
  const envToken = import.meta.env.VITE_MAPBOX_TOKEN;
  if (typeof envToken === 'string' && envToken.length > 0) {
    return envToken;
  }
  return '';
}

export function isValidPublicMapboxToken(token: string): boolean {
  return token.startsWith('pk.') && !token.startsWith('sk.');
}
