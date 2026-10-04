/* Files the API sends back (templates, exports): their name from Content-Disposition, and saving them. */

/**
 * The file name in a Content-Disposition header: `filename*=UTF-8''…` (RFC 5987, how the API sends Chinese names)
 * first, then a plain `filename="…"`; null when there is none.
 */
export function attachmentName(header: string | null | undefined): string | null {
  if (!header) return null;
  const star = /filename\*\s*=\s*(?:UTF-8|utf-8)?'[^']*'([^;]+)/.exec(header);
  if (star) {
    try { return decodeURIComponent(star[1]!.trim()); } catch { /* fall through to the plain name */ }
  }
  const plain = /filename\s*=\s*"([^"]*)"|filename\s*=\s*([^;]+)/.exec(header);
  const name = (plain?.[1] ?? plain?.[2])?.trim();
  return name || null;
}

/** Saves a downloaded file under the given name. */
export function saveFile(blob: Blob, fileName: string): void {
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 10_000);
}
