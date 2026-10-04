/* Files the admin API sends back (import templates): fetched through the API client, saved under the API's file name. */

/**
 * The file name in a Content-Disposition header. Prefers the RFC 5987 `filename*=UTF-8''…` form the API uses for
 * Chinese names, then a plain `filename="…"`; null when there is neither.
 */
export function fileNameFromDisposition(header: string | null | undefined): string | null {
  if (!header) return null;
  const extended = /filename\*\s*=\s*([^']*)'[^']*'([^;]+)/i.exec(header);
  if (extended) {
    try {
      return decodeURIComponent(extended[2]!.trim().replace(/^"|"$/g, '')) || null;
    } catch {
      // Malformed percent-encoding: fall through to the plain form.
    }
  }
  const plain = /filename\s*=\s*("([^"]*)"|[^;]+)/i.exec(header);
  const name = (plain?.[2] ?? plain?.[1])?.trim();
  return name || null;
}

/** Saves a blob through a temporary link, as a browser download. */
export function saveBlob(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}

/**
 * Saves the body of an API call made with `parseAs: 'blob'`, e.g.
 * `downloadFile(api.GET('/api/admin/org/import-template', { parseAs: 'blob' }), '組織架構匯入範本.xlsx')`.
 * Errors were already thrown as ApiRequestError by the client.
 */
export async function downloadFile(call: Promise<{ data?: Blob; response: Response }>, fallbackName: string): Promise<void> {
  const { data, response } = await call;
  if (!data) throw new Error('Empty download');
  saveBlob(data, fileNameFromDisposition(response.headers.get('Content-Disposition')) ?? fallbackName);
}
