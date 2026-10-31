export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** Makes a safe download file name ending in .pdf. */
export function pdfFileName(name: string): string {
  const base = name.trim().replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').slice(0, 120) || 'merged';
  return `${base}.pdf`;
}

export function downloadBlob(url: string, fileName: string): void {
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
}
