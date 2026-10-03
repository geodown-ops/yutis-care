/** The PostgreSQL error code (e.g. 23505 unique violation) of a failed query; Drizzle puts the driver error on `cause`. */
export function pgErrorCode(error: unknown): string | undefined {
  for (let e: unknown = error; e && typeof e === 'object'; e = (e as { cause?: unknown }).cause) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === 'string' && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return undefined;
}
