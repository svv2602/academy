// Build-time constants, substituted by `define` in vite.config.ts (TECH-10).
/** The day of the build, YYYY-MM-DD (UTC). */
declare const __BUILD_DATE__: string;
/** `git rev-parse --short HEAD` at build time, or "no-git" when the sources were built without git. */
declare const __BUILD_COMMIT__: string;
/**
 * The revision of Pip's model (public/models/pip/: the first 12 hex of the SHA-256 of its files), or "none" when the
 * build has no such folder. It names the cache his files are kept in (vite.config.ts PIP_DIR, src/game/pip-load.ts).
 */
declare const __PIP_REV__: string;
