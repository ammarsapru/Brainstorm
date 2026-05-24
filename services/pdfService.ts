import { jsPDF } from 'jspdf';
import { IdeaCard, Connection } from '../types';
import {
  blocksToRenderable,
  cardHasSubstantiveContent,
  getCardDisplayTitle,
  parseDocContent,
  partitionCards,
} from '../utils/pdfContentParser';

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
    if (aPos.y !== bPos.y) return aPos.y - bPos.y;
    return aPos.x - bPos.x;
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
  const visited = new Set<string>();

  const traverse = (card: IdeaCard) => {
    if (visited.has(card.id)) return;
    visited.add(card.id);
    ordered.push(card);
    (adjacencyMap.get(card.id) || [])
      .sort((a, b) => a.y - b.y || a.x - b.x)
      .forEach(neighbor => traverse(neighbor));
  };

  traverse(startCard!);
  cards.filter(c => !visited.has(c.id)).forEach(c => traverse(c));
  return ordered;
};

/**
 * Master PDF: TOC with content sections first, empty subheadings listed at end,
 * body uses real doc block formatting (not forced bullets), space per content.
 */
export const generateMasterPDF = async (
  sessionName: string,
  cards: IdeaCard[],
  connections: Connection[]
): Promise<void> => {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - 2 * margin;
  let y = margin;

  const ensureSpace = (neededMm: number) => {
    if (y + neededMm > pageHeight - margin) {
      pdf.addPage();
      y = margin;
    }
  };

  const lineHeight = (fontSize: number) => fontSize * 0.38 + 1.5;

  const drawLines = (
    lines: string[],
    fontSize: number,
    opts: { bold?: boolean; italic?: boolean; color?: [number, number, number]; indent?: number } = {}
  ) => {
    const indent = opts.indent ?? 0;
    pdf.setFontSize(fontSize);
    pdf.setTextColor(...(opts.color ?? [0, 0, 0]));
    pdf.setFont(undefined, opts.bold ? 'bold' : opts.italic ? 'italic' : 'normal');
    const lh = lineHeight(fontSize);
    lines.forEach(line => {
      ensureSpace(lh);
      pdf.text(line, margin + indent, y);
      y += lh;
    });
  };

  // Title
  drawLines([sessionName], 24, { bold: true });
  y += 4;
  drawLines([`Generated on ${new Date().toLocaleDateString()}`], 10, { color: [100, 100, 100] });
  y += 10;

  const { withContent, noContent } = partitionCards(cards);
  const contentClusters = findCardClusters(withContent, connections);

  // Table of contents
  pdf.addPage();
  y = margin;
  drawLines(['Table of Contents'], 18, { bold: true });
  y += 6;

  let tocIndex = 0;
  contentClusters.forEach(cluster => {
    const title = getCardDisplayTitle(cluster.cards[0]);
    tocIndex += 1;
    drawLines([`${tocIndex}. ${title}`], 11, { indent: 2 });
    if (cluster.isConnected && cluster.cards.length > 1) {
      orderCardsInCluster(cluster).slice(1).forEach(card => {
        drawLines([`    ${getCardDisplayTitle(card)}`], 9, { color: [80, 80, 80], indent: 4 });
      });
    }
  });

  if (noContent.length > 0) {
    y += 6;
    drawLines(['Subheadings (no content)'], 12, { bold: true, color: [90, 90, 90] });
    y += 2;
    noContent.forEach(card => {
      drawLines([`• ${getCardDisplayTitle(card)}`], 10, { color: [110, 110, 110], indent: 4 });
    });
  }

  // Body — only cards with substantive content
  contentClusters.forEach((cluster, clusterIdx) => {
    pdf.addPage();
    y = margin;

    const sectionTitle = getCardDisplayTitle(cluster.cards[0]);
    drawLines([`${clusterIdx + 1}. ${sectionTitle}`], 16, { bold: true, color: [0, 51, 102] });
    y += 4;

    const orderedCards = orderCardsInCluster(cluster).filter(cardHasSubstantiveContent);

    orderedCards.forEach((card, cardIdx) => {
      const cardTitle = getCardDisplayTitle(card);
      const showSubheading =
        orderedCards.length > 1 || cardTitle !== sectionTitle;

      if (showSubheading) {
        y += 2;
        drawLines([cardTitle], 12, { bold: true });
        y += 1;
      }

      const blocks = blocksToRenderable(parseDocContent(card.content));
      let listCounter = 0;

      blocks.forEach(block => {
        if (!block.plainText) return;

        const fontSize = block.isCode
          ? 9
          : block.fontSize >= 20
            ? 13
            : block.fontSize >= 17
              ? 11
              : 10;

        const prefix =
          block.listType === 'bullet'
            ? '• '
            : block.listType === 'number'
              ? `${++listCounter}. `
              : '';

        if (block.listType === 'none') listCounter = 0;

        const wrapped = pdf.splitTextToSize(
          prefix + block.plainText,
          contentWidth - (block.listType !== 'none' ? 4 : 0)
        );

        drawLines(wrapped, fontSize, {
          bold: block.bold,
          italic: block.italic,
          color: block.isCode ? [40, 40, 40] : [30, 30, 30],
          indent: block.listType !== 'none' ? 4 : 0,
        });

        if (block.isCode) y += 1;
      });

      if (cardIdx < orderedCards.length - 1) y += 3;
    });
  });

  pdf.save(`${sessionName.replace(/[^\w\- ]+/g, '_')}-master.pdf`);
};
