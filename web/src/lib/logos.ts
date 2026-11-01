// Airline logos built into the claude.ai page (it cannot load outside images).
const embedded = () => (globalThis as { __MT_DATA__?: { logos?: Record<string, string> } }).__MT_DATA__?.logos || {};

/** A built-in logo for an airline (IATA code), if there is one. */
export const embeddedLogo = (code?: string): string | undefined => (code ? embedded()[code.toUpperCase()] : undefined);
