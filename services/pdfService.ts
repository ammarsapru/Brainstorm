import { jsPDF } from 'jspdf';
import { IdeaCard, Connection } from '../types';
import {
  blocksToRenderable,
  cardHasSubstantiveContent,
  getCardDisplayTitle,
  parseDocContent,
  partitionCards,
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

  const dfs = (cardId: string, component: Set<string>) => {
    visited.add(cardId);
    component.add(cardId);
    (adjacencyMap.get(cardId) || new Set()).forEach(neighborId => {
      if (!visited.has(neighborId)) dfs(neighborId, component);
    });
  };

  cards.forEach(card => {
    if (visited.has(card.id)) return;
    const component = new Set<string>();
    dfs(card.id, component);
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

  clusters.sort((a, b) => {
    const aPos = a.cards[0];
    const bPos = b.cards[0];
    return aPos.y !== bPos.y ? aPos.y - bPos.y : aPos.x - bPos.x;
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

  let startCard = cards.find(c => incomingDegree.get(c.id) === 0);
  if (!startCard) {
    startCard = cards.reduce((prev, curr) =>
      curr.y < prev.y || (curr.y === prev.y && curr.x < prev.x) ? curr : prev
    );
  }

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

// ─── PDF format constants ─────────────────────────────────────────────────────

const BRAND: [number, number, number] = [30, 80, 200];      // dark blue
const BRAND_LIGHT: [number, number, number] = [220, 232, 255]; // tint
const TEXT_PRIMARY: [number, number, number] = [20, 20, 20];
const TEXT_MUTED: [number, number, number] = [110, 110, 110];
const TEXT_FAINT: [number, number, number] = [180, 180, 180];
const RULE: [number, number, number] = [220, 220, 220];

// ─── Master PDF ───────────────────────────────────────────────────────────────

export const generateMasterPDF = async (
  sessionName: string,
  cards: IdeaCard[],
  connections: Connection[]
): Promise<void> => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const W = pdf.internal.pageSize.getWidth();
  const H = pdf.internal.pageSize.getHeight();
  const ML = 18;        // left margin
  const MR = 18;        // right margin
  const MT = 16;        // top margin for content pages
  const MB = 16;        // bottom margin
  const CW = W - ML - MR;
  let y = 0;

  // ── Primitives ──────────────────────────────────────────────────────────────

  const setFont = (size: number, style: 'normal' | 'bold' | 'italic' = 'normal', family: 'helvetica' | 'courier' = 'helvetica') => {
    pdf.setFontSize(size);
    pdf.setFont(family, style);
  };

  const setColor = (rgb: [number, number, number]) => pdf.setTextColor(...rgb);

  const lh = (size: number) => size * 0.352778 * 1.45; // pt → mm × line-height

  const ensureSpace = (needed: number) => {
    if (y + needed > H - MB) {
      pdf.addPage();
      y = MT;
    }
  };

  const text = (
    str: string,
    x: number,
    opts: { align?: 'left' | 'center' | 'right' } = {}
  ) => {
    pdf.text(str, x, y, { align: opts.align ?? 'left' });
  };

  const wrappedText = (
    str: string,
    indent = 0,
    fontSize = 10,
    style: 'normal' | 'bold' | 'italic' = 'normal',
    color: [number, number, number] = TEXT_PRIMARY,
    maxWidth = CW
  ) => {
    setFont(fontSize, style);
    setColor(color);
    const lines = pdf.splitTextToSize(str, maxWidth - indent);
    const lineH = lh(fontSize);
    lines.forEach((line: string) => {
      ensureSpace(lineH);
      pdf.text(line, ML + indent, y);
      y += lineH;
    });
  };

  const hRule = (color: [number, number, number] = RULE, thickness = 0.3) => {
    pdf.setDrawColor(...color);
    pdf.setLineWidth(thickness);
    pdf.line(ML, y, W - MR, y);
  };

  // ── Footer (called retroactively after all pages added) ────────────────────

  const addFooters = (name: string, firstContentPage: number) => {
    const total = (pdf as unknown as { internal: { pages: unknown[] } }).internal.pages.length - 1;
    const label = name.length > 40 ? name.slice(0, 38) + '…' : name;
    for (let i = firstContentPage; i <= total; i++) {
      pdf.setPage(i);
      const footerY = H - 8;
      pdf.setDrawColor(...RULE);
      pdf.setLineWidth(0.25);
      pdf.line(ML, footerY - 3, W - MR, footerY - 3);
      setFont(8, 'normal');
      setColor(TEXT_FAINT);
      pdf.text(label, ML, footerY);
      pdf.text(`${i - firstContentPage + 1} / ${total - firstContentPage + 1}`, W - MR, footerY, { align: 'right' });
    }
  };

  // ── Cover page ─────────────────────────────────────────────────────────────

  // Colour band
  pdf.setFillColor(...BRAND);
  pdf.rect(0, 0, W, 52, 'F');

  // "BRAINSTORM" label
  setFont(9, 'bold');
  setColor([255, 255, 255]);
  pdf.setGState(pdf.GState({ opacity: 0.6 }));
  y = 18;
  text('BRAINSTORM SESSION', ML);
  pdf.setGState(pdf.GState({ opacity: 1 }));

  // Session name
  setFont(22, 'bold');
  setColor([255, 255, 255]);
  const nameLines = pdf.splitTextToSize(sessionName, CW);
  nameLines.slice(0, 2).forEach((line: string) => {
    y += 9;
    pdf.text(line, ML, y);
  });

  // Metadata row
  y = 64;
  const { withContent, noContent } = partitionCards(cards);
  const meta = [
    `${cards.length} cards`,
    `${connections.length} connections`,
    `${withContent.length} with content`,
    new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }),
  ];
  setFont(9, 'normal');
  setColor(TEXT_MUTED);
  const metaStr = meta.join('   ·   ');
  pdf.text(metaStr, ML, y);

  y += 4;
  hRule(BRAND_LIGHT, 0.5);

  // ── Table of contents ──────────────────────────────────────────────────────

  const contentClusters = findCardClusters(withContent, connections);

  pdf.addPage();
  y = MT;

  setFont(18, 'bold');
  setColor(TEXT_PRIMARY);
  text('Contents', ML);
  y += lh(18) + 2;
  hRule();
  y += 4;

  contentClusters.forEach((cluster, idx) => {
    const title = getCardDisplayTitle(cluster.cards[0]);
    const sectionLabel = `${idx + 1}.`;
    ensureSpace(lh(10) + 1);

    setFont(10, 'bold');
    setColor(TEXT_PRIMARY);
    pdf.text(sectionLabel, ML, y);
    pdf.text(title, ML + 8, y);
    y += lh(10);

    if (cluster.isConnected && cluster.cards.length > 1) {
      orderCardsInCluster(cluster).slice(1).forEach(card => {
        const sub = getCardDisplayTitle(card);
        ensureSpace(lh(9));
        setFont(9, 'normal');
        setColor(TEXT_MUTED);
        pdf.text('↳  ' + sub, ML + 12, y);
        y += lh(9);
      });
    }
    y += 1;
  });

  if (noContent.length > 0) {
    y += 4;
    ensureSpace(lh(9) + 2);
    setFont(9, 'bold');
    setColor(TEXT_MUTED);
    text(`Appendix: ${noContent.length} label-only card${noContent.length > 1 ? 's' : ''}`, ML);
    y += lh(9);
  }

  // ── Content sections ───────────────────────────────────────────────────────

  const firstContentPage = (pdf as unknown as { internal: { pages: unknown[] } }).internal.pages.length;

  contentClusters.forEach((cluster, clusterIdx) => {
    pdf.addPage();
    y = MT;

    // Section header bar
    const sectionTitle = `${clusterIdx + 1}.  ${getCardDisplayTitle(cluster.cards[0])}`;
    pdf.setFillColor(...BRAND);
    pdf.rect(ML, y - 4, CW, 11, 'F');
    setFont(12, 'bold');
    setColor([255, 255, 255]);
    pdf.text(sectionTitle, ML + 3, y + 4);
    y += 13;

    const orderedCards = orderCardsInCluster(cluster).filter(cardHasSubstantiveContent);

    orderedCards.forEach((card, cardIdx) => {
      const cardTitle = getCardDisplayTitle(card);
      const showSubheading = orderedCards.length > 1 || cardTitle !== getCardDisplayTitle(cluster.cards[0]);

      if (showSubheading) {
        ensureSpace(lh(11) + 2);
        y += 4;
        // Accent bar before subheading
        pdf.setFillColor(...BRAND_LIGHT);
        pdf.rect(ML, y - 3.5, 2.5, lh(11) + 1, 'F');
        setFont(11, 'bold');
        setColor(TEXT_PRIMARY);
        pdf.text(cardTitle, ML + 6, y);
        y += lh(11) + 1;
      }

      // Render blocks
      const blocks = blocksToRenderable(parseDocContent(card.content));
      let listCounter = 0;
      let renderedAny = false;

      blocks.forEach(block => {
        // Table block
        if (block.isTable && block.tableData && block.tableData.length > 0) {
          renderedAny = true;
          const colCount = Math.max(...block.tableData.map(r => r.length));
          const colW = CW / colCount;
          const cellH = 7;
          block.tableData.forEach((row, ri) => {
            ensureSpace(cellH + 1);
            const isHeader = ri === 0;
            if (isHeader) {
              pdf.setFillColor(...BRAND_LIGHT);
              pdf.rect(ML, y - cellH + 2, CW, cellH, 'F');
            }
            setFont(9, isHeader ? 'bold' : 'normal');
            setColor(TEXT_PRIMARY);
            pdf.setDrawColor(...RULE);
            pdf.setLineWidth(0.2);
            row.forEach((cell, ci) => {
              const cx = ML + ci * colW;
              pdf.rect(cx, y - cellH + 2, colW, cellH);
              const truncated = pdf.splitTextToSize(cell ?? '', colW - 3)[0] ?? '';
              pdf.text(truncated, cx + 2, y);
            });
            y += cellH;
          });
          y += 2;
          return;
        }

        if (!block.plainText) return;
        renderedAny = true;

        const fontSize = block.isCode ? 9 : block.fontSize >= 20 ? 13 : block.fontSize >= 17 ? 11 : 10;
        const isNumbered = block.listType === 'number';
        const isBullet = block.listType === 'bullet';

        if (block.listType === 'none') listCounter = 0;
        const prefix = isBullet ? '•  ' : isNumbered ? `${++listCounter}.  ` : '';

        if (block.isCode) {
          const codeLines = pdf.splitTextToSize(block.plainText, CW - 8);
          const codeH = codeLines.length * lh(9) + 4;
          ensureSpace(codeH);
          pdf.setFillColor(245, 245, 245);
          pdf.rect(ML, y - 2, CW, codeH, 'F');
          pdf.setDrawColor(...RULE);
          pdf.setLineWidth(0.2);
          pdf.rect(ML, y - 2, CW, codeH);
          setFont(9, 'normal', 'courier');
          setColor([40, 40, 100]);
          codeLines.forEach((line: string) => {
            pdf.text(line, ML + 3, y);
            y += lh(9);
          });
          y += 3;
          return;
        }

        const indent = (isBullet || isNumbered) ? 5 : 0;
        const wrapped = pdf.splitTextToSize(prefix + block.plainText, CW - indent);
        const lineH = lh(fontSize);
        setFont(fontSize, block.bold ? 'bold' : block.italic ? 'italic' : 'normal');
        setColor(TEXT_PRIMARY);
        wrapped.forEach((line: string) => {
          ensureSpace(lineH);
          pdf.text(line, ML + indent, y);
          y += lineH;
        });
      });

      // Fallback: plain text-only card
      if (!renderedAny && card.text?.trim()) {
        const wrapped = pdf.splitTextToSize(card.text.trim(), CW);
        setFont(10, 'normal');
        setColor(TEXT_PRIMARY);
        wrapped.forEach((line: string) => {
          ensureSpace(lh(10));
          pdf.text(line, ML, y);
          y += lh(10);
        });
      }

      // Divider between cards within a cluster
      if (cardIdx < orderedCards.length - 1) {
        y += 3;
        hRule(RULE, 0.2);
        y += 4;
      }
    });
  });

  // Appendix — label-only cards
  if (noContent.length > 0) {
    pdf.addPage();
    y = MT;

    pdf.setFillColor(...BRAND_LIGHT);
    pdf.rect(ML, y - 4, CW, 11, 'F');
    setFont(12, 'bold');
    setColor(BRAND);
    pdf.text('Appendix — Label-only cards', ML + 3, y + 4);
    y += 16;

    setFont(9, 'normal');
    setColor(TEXT_MUTED);
    pdf.text('These cards have a title but no document content.', ML, y);
    y += lh(9) + 2;

    noContent.forEach(card => {
      ensureSpace(lh(10));
      setFont(10, 'normal');
      setColor(TEXT_PRIMARY);
      pdf.text('• ' + getCardDisplayTitle(card), ML + 3, y);
      y += lh(10);
    });
  }

  // ── Footers on all content pages ────────────────────────────────────────────
  addFooters(sessionName, firstContentPage);

  pdf.save(`${sessionName.replace(/[^\w\- ]+/g, '_')}-brainstorm.pdf`);
};
