import * as pdfjsLib from 'pdfjs-dist';

let workerSet = false;

function ensureWorker() {
  if (!workerSet) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
      'pdfjs-dist/build/pdf.worker.min.mjs',
      import.meta.url
    ).toString();
    workerSet = true;
  }
}

export async function extractPdfText(url: string, maxPages = 30): Promise<string> {
  ensureWorker();
  const task = pdfjsLib.getDocument({ url, useWorkerFetch: false });
  const pdf = await task.promise;
  const limit = Math.min(pdf.numPages, maxPages);
  const pages: string[] = [];
  for (let i = 1; i <= limit; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    const text = (content.items as Array<{ str: string; hasEOL?: boolean }>)
      .map(item => item.str + (item.hasEOL ? '\n' : ''))
      .join('')
      .replace(/[ \t]+/g, ' ')
      .trim();
    if (text) pages.push(text);
  }
  return pages.join('\n\n');
}
