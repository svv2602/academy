// Build-time constants, substituted by `define` in vite.config.ts (TECH-10).
/** The day of the build, YYYY-MM-DD (UTC). */
declare const __BUILD_DATE__: string;
/** `git rev-parse --short HEAD` at build time, or "no-git" when the sources were built without git. */
declare const __BUILD_COMMIT__: string;
