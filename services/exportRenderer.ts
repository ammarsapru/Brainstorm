import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import {
  ExportBlock,
  ExportBlockStyle,
  ExportDraft,
} from './exportDraftTypes';
import { EXPORT_PAGE_HEIGHT, EXPORT_PAGE_WIDTH } from './exportDraftService';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MM = 2.8346;
const ML = 18 * MM;
const MR = 18 * MM;
const MT = 16 * MM;
const MB = 16 * MM;
const CW = PAGE_W - ML - MR;

const C_TEXT = rgb(24 / 255, 24 / 255, 27 / 255);
const C_MUTED = rgb(100 / 255, 116 / 255, 139 / 255);
const C_FAINT = rgb(203 / 255, 213 / 255, 225 / 255);
const C_RULE = rgb(226 / 255, 232 / 255, 240 / 255);
const C_PANEL = rgb(248 / 255, 250 / 255, 252 / 255);
const C_BRAND = rgb(79 / 255, 70 / 255, 229 / 255);
const C_CODE_BG = rgb(245 / 255, 247 / 255, 250 / 255);
const C_WHITE = rgb(1, 1, 1);

interface Fonts {
  sans: PDFFont;
  sansBold: PDFFont;
  sansItalic: PDFFont;
  serif: PDFFont;
  serifBold: PDFFont;
  mono: PDFFont;
}

interface ImageData {
  bytes: Uint8Array;
  mime: string;
}

const sanitize = (text: string): string =>
  text.replace(/[^\x20-\xFF\n]/g, '').replace(/\t/g, ' ');

const lineHeight = (size: number): number => size * 1.35;

const fontForStyle = (fonts: Fonts, style: ExportBlockStyle): PDFFont => {
  if (style.fontFamily === 'mono') return fonts.mono;
  if (style.fontFamily === 'serif') return style.bold ? fonts.serifBold : fonts.serif;
  if (style.italic) return fonts.sansItalic;
  return style.bold ? fonts.sansBold : fonts.sans;
};

const wrapText = (text: string, font: PDFFont, size: number, maxW: number): string[] => {
  const clean = sanitize(text);
  if (!clean.trim()) return [];
  const lines: string[] = [];
  clean.split('\n').forEach(paragraph => {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push('');
      return;
    }
    let current = '';
    words.forEach(word => {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > maxW && current) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    });
    if (current) lines.push(current);
  });
  return lines;
};

const drawTextLine = (
  page: PDFPage,
  text: string,
  x: number,
  yTop: number,
  font: PDFFont,
  size: number,
  color = C_TEXT,
  maxW?: number,
  align: 'left' | 'center' | 'right' = 'left',
) => {
  const clean = sanitize(text);
  if (!clean) return;
  let drawX = x;
  if (maxW) {
    const width = font.widthOfTextAtSize(clean, size);
    if (align === 'center') drawX = x + Math.max(0, (maxW - width) / 2);
    if (align === 'right') drawX = x + Math.max(0, maxW - width);
  }
  page.drawText(clean, { x: drawX, y: PAGE_H - yTop - size, font, size, color });
};

const drawWrapped = (
  page: PDFPage,
  text: string,
  x: number,
  yTop: number,
  maxW: number,
  maxH: number,
  font: PDFFont,
  size: number,
  color = C_TEXT,
  align: 'left' | 'center' | 'right' = 'left',
): number => {
  const lines = wrapText(text, font, size, maxW);
  const lh = lineHeight(size);
  let cursor = yTop;
  for (const line of lines) {
    if (cursor + lh > yTop + maxH) break;
    drawTextLine(page, line, x, cursor, font, size, color, maxW, align);
    cursor += lh;
  }
  return cursor;
};

const fitImage = (img: PDFImage, maxW: number, maxH: number): { width: number; height: number } => {
  const scale = Math.min(maxW / img.width, maxH / img.height, 1);
  return { width: img.width * scale, height: img.height * scale };
};

const loadImageData = async (url: string): Promise<ImageData | null> => {
  try {
    const res = await fetch(url);
    if (res.ok) {
      const bytes = new Uint8Array(await res.arrayBuffer());
      const mime = res.headers.get('content-type') || (url.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg');
      return { bytes, mime };
    }
  } catch {
    // Fall through to canvas path.
  }

  return new Promise(resolve => {
    const image = new Image();
    const timer = window.setTimeout(() => resolve(null), 6000);
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      window.clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.naturalWidth;
        canvas.height = image.naturalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(image, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        const binary = atob(dataUrl.split(',')[1]);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        resolve({ bytes, mime: 'image/jpeg' });
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => {
      window.clearTimeout(timer);
      resolve(null);
    };
    image.src = url;
  });
};

const embedImage = async (doc: PDFDocument, url: string): Promise<PDFImage | null> => {
  const data = await loadImageData(url);
  if (!data) return null;
  try {
    if (data.mime.includes('png')) return await doc.embedPng(data.bytes);
    return await doc.embedJpg(data.bytes);
  } catch {
    try {
      return await doc.embedPng(data.bytes);
    } catch {
      try {
        return await doc.embedJpg(data.bytes);
      } catch {
        return null;
      }
    }
  }
};

const drawCover = async (doc: PDFDocument, fonts: Fonts, draft: ExportDraft) => {
  const page = doc.addPage([PAGE_W, PAGE_H]);
  const logo = await embedImage(doc, '/brainstorm-logo.png');
  const logoSize = 92;
  const logoTop = 192;

  if (logo) {
    page.drawImage(logo, {
      x: PAGE_W / 2 - logoSize / 2,
      y: PAGE_H - logoTop - logoSize,
      width: logoSize,
      height: logoSize,
    });
  } else {
    drawTextLine(page, 'Brainstorm', ML, logoTop + 22, fonts.sansBold, 30, C_BRAND, CW, 'center');
  }

  const titleLines = wrapText(draft.title || 'Untitled Session', fonts.sansBold, 28, CW);
  let cursor = logoTop + logoSize + 38;
  titleLines.slice(0, 3).forEach(line => {
    drawTextLine(page, line, ML, cursor, fonts.sansBold, 28, C_TEXT, CW, 'center');
    cursor += lineHeight(28);
  });

  const meta = [
    `${draft.chapters.length} chapters`,
    `${draft.sourceCardIds.length} cards`,
    new Date(draft.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  ].join('  |  ');
  drawTextLine(page, meta, ML, cursor + 18, fonts.sans, 10, C_MUTED, CW, 'center');

  page.drawLine({
    start: { x: ML, y: MB + 34 },
    end: { x: PAGE_W - MR, y: MB + 34 },
    thickness: 0.5,
    color: C_RULE,
  });
  drawTextLine(page, 'Compiled from your Brainstorm canvas', ML, PAGE_H - MB - 22, fonts.sans, 9, C_MUTED, CW, 'center');
};

const drawContents = (doc: PDFDocument, fonts: Fonts, draft: ExportDraft) => {
  let page = doc.addPage([PAGE_W, PAGE_H]);
  let cursor = MT;
  const ensure = (needed: number) => {
    if (cursor + needed > PAGE_H - MB) {
      page = doc.addPage([PAGE_W, PAGE_H]);
      cursor = MT;
    }
  };

  drawTextLine(page, 'Contents', ML, cursor, fonts.sansBold, 22);
  cursor += 32;
  page.drawLine({ start: { x: ML, y: PAGE_H - cursor }, end: { x: PAGE_W - MR, y: PAGE_H - cursor }, thickness: 0.4, color: C_RULE });
  cursor += 16;

  draft.chapters.forEach((chapter, chapterIndex) => {
    const chapterTitle = `${chapterIndex + 1}. ${chapter.title}`;
    const chapterLines = wrapText(chapterTitle, fonts.sansBold, 11, CW);
    ensure(chapterLines.length * lineHeight(11) + 8);
    chapterLines.forEach(line => {
      drawTextLine(page, line, ML, cursor, fonts.sansBold, 11);
      cursor += lineHeight(11);
    });
    chapter.sections.slice(0, 8).forEach(section => {
      const lines = wrapText(section.title, fonts.sans, 9, CW - 18);
      ensure(lines.length * lineHeight(9) + 2);
      lines.forEach((line, lineIndex) => {
        drawTextLine(page, `${lineIndex === 0 ? '- ' : '  '}${line}`, ML + 16, cursor, fonts.sans, 9, C_MUTED);
        cursor += lineHeight(9);
      });
    });
    cursor += 8;
  });

  if (draft.appendix.length) {
    ensure(24);
    drawTextLine(page, `Appendix (${draft.appendix.length})`, ML, cursor, fonts.sansBold, 10, C_MUTED);
  }
};

const drawBlockFrame = (page: PDFPage, x: number, yTop: number, w: number, h: number) => {
  page.drawRectangle({
    x,
    y: PAGE_H - yTop - h,
    width: w,
    height: h,
    borderColor: C_RULE,
    borderWidth: 0.4,
    color: rgb(1, 1, 1),
  });
};

const drawTableBlock = (
  page: PDFPage,
  block: ExportBlock,
  fonts: Fonts,
  x: number,
  yTop: number,
  w: number,
  h: number,
) => {
  drawBlockFrame(page, x, yTop, w, h);
  let cursor = yTop + 8;
  if (block.title) {
    drawTextLine(page, block.title, x + 8, cursor, fonts.sansBold, 9, C_TEXT, w - 16);
    cursor += 18;
  }
  const rows = block.rows || [];
  const colCount = Math.max(1, ...rows.map(row => row.length));
  const colW = (w - 16) / colCount;
  const rowH = 18;
  rows.slice(0, Math.floor((h - 32) / rowH)).forEach((row, rowIndex) => {
    row.forEach((cell, colIndex) => {
      const cx = x + 8 + colIndex * colW;
      page.drawRectangle({
        x: cx,
        y: PAGE_H - cursor - rowH + 4,
        width: colW,
        height: rowH,
        borderColor: C_RULE,
        borderWidth: 0.25,
        color: rowIndex === 0 ? C_PANEL : C_WHITE,
      });
      drawTextLine(page, cell || '', cx + 3, cursor, rowIndex === 0 ? fonts.sansBold : fonts.sans, 7, C_TEXT, colW - 6);
    });
    cursor += rowH;
  });
};

const drawTextBlock = (
  page: PDFPage,
  block: ExportBlock,
  fonts: Fonts,
  x: number,
  yTop: number,
  w: number,
  h: number,
) => {
  const font = fontForStyle(fonts, block.style);
  const titleFont = block.style.fontFamily === 'serif' ? fonts.serifBold : fonts.sansBold;
  const size = block.style.fontSize;
  const padding = block.type === 'heading' ? 0 : 8;
  let cursor = yTop + padding;
  const bodyH = h - padding * 2;

  if (block.type !== 'heading' && block.title) {
    drawTextLine(page, block.title, x + padding, cursor, titleFont, Math.min(12, size + 1), C_TEXT, w - padding * 2, block.style.align || 'left');
    cursor += lineHeight(Math.min(12, size + 1)) + 3;
  }

  const content = block.type === 'pdf'
    ? block.extractedText || block.content || 'Original PDF pages will be appended after the compiled document.'
    : block.content || block.title || '';

  if (block.type === 'code') {
    page.drawRectangle({ x, y: PAGE_H - yTop - h, width: w, height: h, color: C_CODE_BG, borderColor: C_RULE, borderWidth: 0.4 });
  }

  drawWrapped(
    page,
    content,
    x + padding,
    cursor,
    w - padding * 2,
    Math.max(0, bodyH - (cursor - yTop)),
    font,
    size,
    block.type === 'link' ? C_BRAND : C_TEXT,
    block.style.align || 'left',
  );
};

const drawImageBlock = async (
  doc: PDFDocument,
  page: PDFPage,
  block: ExportBlock,
  fonts: Fonts,
  x: number,
  yTop: number,
  w: number,
  h: number,
) => {
  drawBlockFrame(page, x, yTop, w, h);
  let captionH = 0;
  if (block.title) {
    captionH = 22;
    drawTextLine(page, block.title, x + 8, yTop + 8, fonts.sansBold, 9, C_TEXT, w - 16);
  }
  if (!block.url) {
    drawTextLine(page, 'Image unavailable', x + 8, yTop + captionH + 18, fonts.sans, 9, C_MUTED);
    return;
  }
  const image = await embedImage(doc, block.url);
  if (!image) {
    drawTextLine(page, 'Image could not be loaded', x + 8, yTop + captionH + 18, fonts.sans, 9, C_MUTED);
    return;
  }
  const maxW = w - 16;
  const maxH = h - captionH - 16;
  const fitted = fitImage(image, maxW, maxH);
  page.drawImage(image, {
    x: x + (w - fitted.width) / 2,
    y: PAGE_H - yTop - captionH - 8 - fitted.height,
    width: fitted.width,
    height: fitted.height,
  });
};

const drawExportBlock = async (
  doc: PDFDocument,
  page: PDFPage,
  block: ExportBlock,
  fonts: Fonts,
) => {
  if (!block.layout) return;
  const sx = PAGE_W / EXPORT_PAGE_WIDTH;
  const sy = PAGE_H / EXPORT_PAGE_HEIGHT;
  const x = block.layout.x * sx;
  const yTop = block.layout.y * sy;
  const w = block.layout.width * sx;
  const h = block.layout.height * sy;

  if (block.type === 'image') {
    await drawImageBlock(doc, page, block, fonts, x, yTop, w, h);
    return;
  }
  if (block.type === 'table') {
    drawTableBlock(page, block, fonts, x, yTop, w, h);
    return;
  }
  if (block.type !== 'heading') drawBlockFrame(page, x, yTop, w, h);
  drawTextBlock(page, block, fonts, x, yTop, w, h);
};

const appendOriginalPdfPages = async (doc: PDFDocument, draft: ExportDraft) => {
  const pdfBlocks = draft.pages
    .flatMap(page => page.blocks)
    .filter(block => block.type === 'pdf' && block.url && block.appendOriginalPages);

  for (const block of pdfBlocks) {
    try {
      const res = await fetch(block.url!);
      if (!res.ok) continue;
      const src = await PDFDocument.load(await res.arrayBuffer(), { ignoreEncryption: true });
      const copied = await doc.copyPages(src, src.getPageIndices());
      copied.forEach(page => doc.addPage(page));
    } catch {
      const page = doc.addPage([PAGE_W, PAGE_H]);
      drawTextLine(page, `Could not append original PDF: ${block.title || block.url}`, ML, MT, await doc.embedFont(StandardFonts.Helvetica), 10, C_MUTED, CW);
    }
  }
};

const addFooters = (doc: PDFDocument, fonts: Fonts, title: string) => {
  const pages = doc.getPages();
  const label = title.length > 42 ? `${title.slice(0, 39)}...` : title;
  pages.forEach((page, index) => {
    if (index === 0) return;
    const footerY = MB - 3 * MM;
    page.drawLine({
      start: { x: ML, y: footerY + 3 },
      end: { x: PAGE_W - MR, y: footerY + 3 },
      thickness: 0.25,
      color: C_RULE,
    });
    page.drawText(sanitize(label), { x: ML, y: footerY, font: fonts.sans, size: 8, color: C_FAINT });
    const num = `${index} / ${pages.length - 1}`;
    const numW = fonts.sans.widthOfTextAtSize(num, 8);
    page.drawText(num, { x: PAGE_W - MR - numW, y: footerY, font: fonts.sans, size: 8, color: C_FAINT });
  });
};

export const renderExportDraftToPdf = async (draft: ExportDraft): Promise<Uint8Array> => {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    sans: await doc.embedFont(StandardFonts.Helvetica),
    sansBold: await doc.embedFont(StandardFonts.HelveticaBold),
    sansItalic: await doc.embedFont(StandardFonts.HelveticaOblique),
    serif: await doc.embedFont(StandardFonts.TimesRoman),
    serifBold: await doc.embedFont(StandardFonts.TimesRomanBold),
    mono: await doc.embedFont(StandardFonts.Courier),
  };

  await drawCover(doc, fonts, draft);
  drawContents(doc, fonts, draft);

  for (const draftPage of draft.pages) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    for (const block of draftPage.blocks) {
      await drawExportBlock(doc, page, block, fonts);
    }
  }

  await appendOriginalPdfPages(doc, draft);
  addFooters(doc, fonts, draft.title);
  return doc.save();
};

export const downloadPdfBytes = (bytes: Uint8Array, name: string) => {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.dispatchEvent(new CustomEvent('brainstorm:pdf-exported', {
    detail: { name, byteLength: bytes.byteLength },
  }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
};

export const exportDraftFileName = (draft: ExportDraft): string =>
  `${(draft.title || 'brainstorm').replace(/[^\w\- ]+/g, '_')}-brainstorm.pdf`;
