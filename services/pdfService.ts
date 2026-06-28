import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFImage } from 'pdf-lib';
import { IdeaCard, Connection } from '../types';
import {
  blocksToRenderable,
  cardHasSubstantiveContent,
  getCardDisplayTitle,
  parseDocContent,
} from '../utils/pdfContentParser';

// ─── Cluster helpers ─────────────────────────────────────────────────────────

interface CardCluster {
  id: string;
  cards: IdeaCard[];
  connections: Connection[];
  isConnected: boolean;
}

export const findCardClusters = (cards: IdeaCard[], connections: Connection[]): CardCluster[] => {
  if (cards.length === 0) return [];

  const adjacencyMap = new Map<string, Set<string>>();
  cards.forEach(card => adjacencyMap.set(card.id, new Set()));
  connections.forEach(conn => {
    adjacencyMap.get(conn.fromId)?.add(conn.toId);
    adjacencyMap.get(conn.toId)?.add(conn.fromId);
  });

  const visited = new Set<string>();
  const clusters: CardCluster[] = [];

  const collectComponent = (startId: string): Set<string> => {
    const component = new Set<string>();
    const stack = [startId];
    while (stack.length > 0) {
      const cardId = stack.pop()!;
      if (visited.has(cardId)) continue;
      visited.add(cardId);
      component.add(cardId);
      (adjacencyMap.get(cardId) || new Set()).forEach(neighborId => {
        if (!visited.has(neighborId)) stack.push(neighborId);
      });
    }
    return component;
  };

  cards.forEach(card => {
    if (visited.has(card.id)) return;
    const component = collectComponent(card.id);
    const componentCards = Array.from(component)
      .map(id => cards.find(c => c.id === id))
      .filter((c): c is IdeaCard => c !== undefined)
      .sort((a, b) => a.y - b.y || a.x - b.x);
    const componentConnections = connections.filter(
      conn => component.has(conn.fromId) && component.has(conn.toId)
    );
    clusters.push({
      id: `cluster-${clusters.length}`,
      cards: componentCards,
      connections: componentConnections,
      isConnected: componentCards.length > 1,
    });
  });

  return clusters;
};

const orderCardsInCluster = (cluster: CardCluster): IdeaCard[] => {
  const { cards, connections } = cluster;
  if (cards.length === 1) return cards;

  const adjacencyMap = new Map<string, IdeaCard[]>();
  cards.forEach(card => adjacencyMap.set(card.id, []));
  connections.forEach(conn => {
    const toCard = cards.find(c => c.id === conn.toId);
    if (toCard) adjacencyMap.get(conn.fromId)?.push(toCard);
  });

  const incomingDegree = new Map<string, number>();
  cards.forEach(card => incomingDegree.set(card.id, 0));
  connections.forEach(conn => {
    incomingDegree.set(conn.toId, (incomingDegree.get(conn.toId) || 0) + 1);
  });

  let startCard = cards.find(c => c.kind === 'label' && incomingDegree.get(c.id) === 0)
    ?? cards.find(c => incomingDegree.get(c.id) === 0)
    ?? cards.reduce((prev, curr) =>
        curr.y < prev.y || (curr.y === prev.y && curr.x < prev.x) ? curr : prev
      );

  const ordered: IdeaCard[] = [];
  const visitedOrder = new Set<string>();
  const traverse = (card: IdeaCard) => {
    if (visitedOrder.has(card.id)) return;
    visitedOrder.add(card.id);
    ordered.push(card);
    (adjacencyMap.get(card.id) || [])
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach(neighbor => traverse(neighbor));
  };
  traverse(startCard!);
  cards.filter(c => !visitedOrder.has(c.id)).forEach(c => traverse(c));
  return ordered;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const MM = 2.8346;          // pts per mm
const PAGE_W = 595.28;      // A4 width in pts
const PAGE_H = 841.89;      // A4 height in pts
const ML = 18 * MM;         // left margin
const MR = 18 * MM;         // right margin
const MT = 16 * MM;         // top margin
const MB = 16 * MM;         // bottom margin
const CW = PAGE_W - ML - MR; // content width

const C_BRAND      = rgb(30/255, 80/255, 200/255);
const C_BRAND_L    = rgb(220/255, 232/255, 255/255);
const C_BLUE_LABEL = rgb(180/255, 210/255, 255/255);
const C_TEXT       = rgb(20/255, 20/255, 20/255);
const C_MUTED      = rgb(110/255, 110/255, 110/255);
const C_FAINT      = rgb(180/255, 180/255, 180/255);
const C_RULE       = rgb(220/255, 220/255, 220/255);
const C_WHITE      = rgb(1, 1, 1);
const C_CODE_BG    = rgb(245/255, 245/255, 245/255);
const C_CODE_TEXT  = rgb(40/255, 40/255, 100/255);

// ─── Helpers ─────────────────────────────────────────────────────────────────

const lh = (size: number) => size * 1.45;

// Replace characters outside WinAnsiEncoding (0x20–0xFF, minus 0x81,0x8D,0x8F,0x90,0x9D)
const sanitize = (t: string) =>
  t.replace(/[^\x20-\xFF]/g, match => {
    if (match === '\n') return ' ';
    return '';
  });

const wrapText = (text: string, font: PDFFont, size: number, maxW: number): string[] => {
  if (!text.trim()) return [];
  const lines: string[] = [];
  for (const para of text.split('\n')) {
    const words = para.split(' ');
    let line = '';
    for (const word of words) {
      const test = line ? `${line} ${word}` : word;
      try {
        if (font.widthOfTextAtSize(sanitize(test), size) > maxW && line) {
          lines.push(line);
          line = word;
        } else {
          line = test;
        }
      } catch {
        line = test;
      }
    }
    lines.push(line);
  }
  return lines;
};

// ─── Page state ───────────────────────────────────────────────────────────────

interface PageCtx {
  doc: PDFDocument;
  fonts: { n: PDFFont; b: PDFFont; i: PDFFont; c: PDFFont };
  page: PDFPage;
  cursor: number; // pts from top
}

const newPage = (ctx: PageCtx): void => {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.cursor = MT;
};

const ensureSpace = (ctx: PageCtx, needed: number): void => {
  if (ctx.cursor + needed > PAGE_H - MB) newPage(ctx);
};

// pdf-lib y=0 is bottom; our cursor is from top
const Y = (ctx: PageCtx, extra = 0) => PAGE_H - ctx.cursor - extra;

const drawText = (
  ctx: PageCtx,
  text: string,
  x: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  rightAlignTo?: number,
) => {
  const s = sanitize(text);
  if (!s) return;
  let xPos = x;
  if (rightAlignTo !== undefined) {
    try { xPos = rightAlignTo - font.widthOfTextAtSize(s, size); } catch { return; }
  }
  try {
    ctx.page.drawText(s, { x: xPos, y: Y(ctx), font, size, color });
  } catch { /* skip unencodable chars */ }
};

const drawRect = (
  ctx: PageCtx,
  x: number,
  yFromTop: number,
  w: number,
  h: number,
  color: ReturnType<typeof rgb>,
) => {
  ctx.page.drawRectangle({ x, y: PAGE_H - yFromTop - h, width: w, height: h, color });
};

const drawRectOutline = (
  ctx: PageCtx,
  x: number,
  yFromTop: number,
  w: number,
  h: number,
  borderColor: ReturnType<typeof rgb>,
  borderWidth = 0.3,
) => {
  ctx.page.drawRectangle({
    x, y: PAGE_H - yFromTop - h, width: w, height: h,
    borderColor, borderWidth, color: rgb(1,1,1),
  });
};

const hRule = (ctx: PageCtx, color = C_RULE, thickness = 0.3) => {
  ctx.page.drawLine({
    start: { x: ML, y: Y(ctx) },
    end:   { x: PAGE_W - MR, y: Y(ctx) },
    thickness, color,
  });
};

const wrappedText = (
  ctx: PageCtx,
  text: string,
  x: number,
  font: PDFFont,
  size: number,
  color: ReturnType<typeof rgb>,
  maxW: number,
) => {
  const lines = wrapText(text, font, size, maxW);
  const lineH = lh(size);
  for (const line of lines) {
    ensureSpace(ctx, lineH);
    drawText(ctx, line, x, font, size, color);
    ctx.cursor += lineH;
  }
};

// ─── Image loading ────────────────────────────────────────────────────────────

interface ImgData { bytes: Uint8Array; w: number; h: number; }

const loadImage = (url: string): Promise<ImgData | null> =>
  new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), 6000);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      clearTimeout(timer);
      try {
        const canvas = document.createElement('canvas');
        canvas.width  = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const c = canvas.getContext('2d');
        if (!c) { resolve(null); return; }
        c.drawImage(img, 0, 0);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        const b64 = dataUrl.split(',')[1];
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        resolve({ bytes, w: img.naturalWidth, h: img.naturalHeight });
      } catch { resolve(null); }
    };
    img.onerror = () => { clearTimeout(timer); resolve(null); };
    img.src = url;
  });

// ─── Download helper ──────────────────────────────────────────────────────────

const downloadPDF = (bytes: Uint8Array, name: string) => {
  const blob = new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 2000);
};

// ─── Master PDF ───────────────────────────────────────────────────────────────

export const generateMasterPDF = async (
  sessionName: string,
  cards: IdeaCard[],
  connections: Connection[],
): Promise<void> => {
  const doc = await PDFDocument.create();
  const fonts = {
    n: await doc.embedFont(StandardFonts.Helvetica),
    b: await doc.embedFont(StandardFonts.HelveticaBold),
    i: await doc.embedFont(StandardFonts.HelveticaOblique),
    c: await doc.embedFont(StandardFonts.Courier),
  };

  const ctx: PageCtx = { doc, fonts, page: doc.addPage([PAGE_W, PAGE_H]), cursor: 0 };

  // ── Clustering ─────────────────────────────────────────────────────────────

  const allClusters = findCardClusters(cards, connections);
  allClusters.sort((a, b) => {
    const at = Math.min(...a.cards.map(c => c.createdAt ?? Infinity));
    const bt = Math.min(...b.cards.map(c => c.createdAt ?? Infinity));
    if (at !== Infinity && bt !== Infinity && at !== bt) return at - bt;
    return a.cards[0].y !== b.cards[0].y ? a.cards[0].y - b.cards[0].y : a.cards[0].x - b.cards[0].x;
  });

  const mainClusters  = allClusters.filter(cl => cl.cards.some(cardHasSubstantiveContent));
  const appendixCards = allClusters
    .filter(cl => !cl.cards.some(cardHasSubstantiveContent))
    .flatMap(cl => cl.cards);

  // ── Cover page ─────────────────────────────────────────────────────────────

  const headerH = 52 * MM;
  drawRect(ctx, 0, 0, PAGE_W, headerH, C_BRAND);

  ctx.cursor = 18 * MM;
  drawText(ctx, 'BRAINSTORM SESSION', ML, fonts.b, 9, C_BLUE_LABEL);
  ctx.cursor += lh(9);

  const nameLines = wrapText(sessionName, fonts.b, 22, CW);
  nameLines.slice(0, 2).forEach(line => {
    drawText(ctx, line, ML, fonts.b, 22, C_WHITE);
    ctx.cursor += lh(22);
  });

  ctx.cursor = 64 * MM;
  const contentCardCount = cards.filter(cardHasSubstantiveContent).length;
  const metaStr = [
    `${cards.length} cards`,
    `${connections.length} connections`,
    `${contentCardCount} with content`,
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  ].join('   -   ');
  drawText(ctx, metaStr, ML, fonts.n, 9, C_MUTED);
  ctx.cursor += 4 * MM;
  hRule(ctx, C_BRAND_L, 0.5);

  // ── Table of contents ──────────────────────────────────────────────────────

  newPage(ctx);

  drawText(ctx, 'Contents', ML, fonts.b, 18, C_TEXT);
  ctx.cursor += lh(18) + 2;
  hRule(ctx);
  ctx.cursor += 4;

  mainClusters.forEach((cluster, idx) => {
    const ordered = orderCardsInCluster(cluster);
    const rootCard = ordered[0];
    const title = getCardDisplayTitle(rootCard);

    ensureSpace(ctx, lh(10) + 1);
    drawText(ctx, `${idx + 1}.`, ML, fonts.b, 10, C_TEXT);
    drawText(ctx, title, ML + 8 * MM, fonts.b, 10, C_TEXT);
    ctx.cursor += lh(10);

    const subCards = ordered.slice(1).filter(cardHasSubstantiveContent);
    subCards.forEach(card => {
      const sub = getCardDisplayTitle(card);
      ensureSpace(ctx, lh(9));
      drawText(ctx, '  - ' + sub, ML + 12 * MM, fonts.n, 9, C_MUTED);
      ctx.cursor += lh(9);
    });
    ctx.cursor += 1;
  });

  if (appendixCards.length > 0) {
    ctx.cursor += 4;
    ensureSpace(ctx, lh(9) + 2);
    drawText(ctx, `Appendix: ${appendixCards.length} card${appendixCards.length > 1 ? 's' : ''} without content`, ML, fonts.b, 9, C_MUTED);
    ctx.cursor += lh(9);
  }

  // ── Content sections ───────────────────────────────────────────────────────

  const firstContentPageIdx = doc.getPageCount(); // 0-based index of next page

  for (const [clusterIdx, cluster] of mainClusters.entries()) {
    newPage(ctx);

    const ordered  = orderCardsInCluster(cluster);
    const rootCard = ordered[0];

    // Section header bar
    const sectionTitle = `${clusterIdx + 1}.  ${getCardDisplayTitle(rootCard)}`;
    const barH = 11 * MM;
    drawRect(ctx, ML, ctx.cursor - 4, CW, barH, C_BRAND);
    drawText(ctx, sectionTitle, ML + 3, fonts.b, 12, C_WHITE);
    ctx.cursor += 13 * MM;

    const bodyCards = ordered.filter(cardHasSubstantiveContent);

    for (const [cardIdx, card] of bodyCards.entries()) {
      const cardTitle  = getCardDisplayTitle(card);
      const showSubhd  = bodyCards.length > 1 || cardTitle !== getCardDisplayTitle(rootCard);

      if (showSubhd) {
        ensureSpace(ctx, lh(11) + 2);
        ctx.cursor += 4;
        const accentH = lh(11) + 1;
        drawRect(ctx, ML, ctx.cursor - 3.5, 2.5 * MM, accentH, C_BRAND_L);
        drawText(ctx, cardTitle, ML + 6, fonts.b, 11, C_TEXT);
        ctx.cursor += lh(11) + 1;
      }

      const blocks      = blocksToRenderable(parseDocContent(card.content));
      let listCounter   = 0;
      let renderedAny   = false;

      for (const block of blocks) {
        // ── Inline images ────────────────────────────────────────────────────
        if (block.imageUrls?.length) {
          for (const imgUrl of block.imageUrls) {
            const imgData = await loadImage(imgUrl);
            if (imgData) {
              try {
                const pdfImg: PDFImage = await doc.embedJpg(imgData.bytes);
                const PX_TO_PT  = 72 / 96;
                const natW = imgData.w * PX_TO_PT;
                const natH = imgData.h * PX_TO_PT;
                const scale  = Math.min(1, CW / natW);
                const drawW  = natW  * scale;
                const drawH  = Math.min(natH * scale, 120 * MM);
                ensureSpace(ctx, drawH + 6);
                ctx.page.drawImage(pdfImg, { x: ML, y: Y(ctx) - drawH, width: drawW, height: drawH });
                ctx.cursor += drawH + 4;
                renderedAny = true;
              } catch { /* skip broken images */ }
            }
          }
        }

        // ── Table block ──────────────────────────────────────────────────────
        if (block.isTable && block.tableData && block.tableData.length > 0) {
          renderedAny = true;
          const colCount = Math.max(...block.tableData.map(r => r.length));
          const colW  = CW / colCount;
          const cellH = 7 * MM;
          for (const [ri, row] of block.tableData.entries()) {
            ensureSpace(ctx, cellH + 1);
            const isHeader = ri === 0;
            if (isHeader) drawRect(ctx, ML, ctx.cursor - cellH + 2, CW, cellH, C_BRAND_L);
            const font = isHeader ? fonts.b : fonts.n;
            for (const [ci, cell] of row.entries()) {
              const cx = ML + ci * colW;
              drawRectOutline(ctx, cx, ctx.cursor - cellH + 2, colW, cellH, C_RULE, 0.2);
              const cellLines = wrapText(cell ?? '', font, 9, colW - 3);
              drawText(ctx, cellLines[0] ?? '', cx + 2, font, 9, C_TEXT);
            }
            ctx.cursor += cellH;
          }
          ctx.cursor += 2;
          continue;
        }

        if (!block.plainText) continue;
        renderedAny = true;

        const fontSize  = block.isCode ? 9 : block.fontSize >= 20 ? 13 : block.fontSize >= 17 ? 11 : 10;
        const isNumbered = block.listType === 'number';
        const isBullet   = block.listType === 'bullet';
        if (block.listType === 'none') listCounter = 0;
        const prefix = isBullet ? '-  ' : isNumbered ? `${++listCounter}.  ` : '';

        if (block.isCode) {
          const codeLines = wrapText(block.plainText, fonts.c, 9, CW - 8);
          const codeH = codeLines.length * lh(9) + 4;
          ensureSpace(ctx, codeH);
          drawRect(ctx, ML, ctx.cursor - 2, CW, codeH, C_CODE_BG);
          drawRectOutline(ctx, ML, ctx.cursor - 2, CW, codeH, C_RULE, 0.2);
          for (const line of codeLines) {
            drawText(ctx, line, ML + 3, fonts.c, 9, C_CODE_TEXT);
            ctx.cursor += lh(9);
          }
          ctx.cursor += 3;
          continue;
        }

        const indent  = (isBullet || isNumbered) ? 5 * MM : 0;
        const font    = block.bold ? fonts.b : block.italic ? fonts.i : fonts.n;
        const lineH   = lh(fontSize);
        const wrapped = wrapText(prefix + block.plainText, font, fontSize, CW - indent);
        for (const line of wrapped) {
          ensureSpace(ctx, lineH);
          drawText(ctx, line, ML + indent, font, fontSize, C_TEXT);
          ctx.cursor += lineH;
        }
      }

      if (!renderedAny && card.text?.trim()) {
        wrappedText(ctx, card.text.trim(), ML, fonts.n, 10, C_TEXT, CW);
      }

      if (cardIdx < bodyCards.length - 1) {
        ctx.cursor += 3;
        hRule(ctx, C_RULE, 0.2);
        ctx.cursor += 4;
      }
    }
  }

  // ── Appendix ────────────────────────────────────────────────────────────────

  if (appendixCards.length > 0) {
    newPage(ctx);

    drawRect(ctx, ML, ctx.cursor - 4, CW, 11 * MM, C_BRAND_L);
    drawText(ctx, 'Appendix -- Cards without content', ML + 3, fonts.b, 12, C_BRAND);
    ctx.cursor += 16 * MM;

    drawText(ctx, 'These cards have a title but no document content.', ML, fonts.n, 9, C_MUTED);
    ctx.cursor += lh(9) + 2;

    for (const card of appendixCards) {
      ensureSpace(ctx, lh(10));
      drawText(ctx, '- ' + getCardDisplayTitle(card), ML + 3, fonts.n, 10, C_TEXT);
      ctx.cursor += lh(10);
    }
  }

  // ── Footers on all content pages ─────────────────────────────────────────────

  const allPages    = doc.getPages();
  const totalContent = allPages.length - firstContentPageIdx;
  if (totalContent > 0) {
    const label = sessionName.length > 40 ? sessionName.slice(0, 38) + '...' : sessionName;
    for (let i = firstContentPageIdx; i < allPages.length; i++) {
      const pg      = allPages[i];
      const pageNum = i - firstContentPageIdx + 1;
      const numStr  = `${pageNum} / ${totalContent}`;
      const footerY = MB - 3 * MM;

      pg.drawLine({
        start: { x: ML, y: footerY + 3 },
        end:   { x: PAGE_W - MR, y: footerY + 3 },
        thickness: 0.25, color: C_RULE,
      });
      try {
        pg.drawText(sanitize(label), { x: ML, y: footerY, font: fonts.n, size: 8, color: C_FAINT });
        const numW = fonts.n.widthOfTextAtSize(numStr, 8);
        pg.drawText(numStr, { x: PAGE_W - MR - numW, y: footerY, font: fonts.n, size: 8, color: C_FAINT });
      } catch { /* skip */ }
    }
  }

  // ── Save & download ───────────────────────────────────────────────────────

  const bytes = await doc.save();
  downloadPDF(bytes, `${sessionName.replace(/[^\w\- ]+/g, '_')}-brainstorm.pdf`);
};
