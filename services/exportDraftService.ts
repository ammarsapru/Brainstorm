import { Connection, IdeaCard, RelationType } from '../types';
import {
  blocksToRenderable,
  cardHasSubstantiveContent,
  getCardDisplayTitle,
  parseDocContent,
} from '../utils/pdfContentParser';
import {
  ExportBlock,
  ExportChapter,
  ExportDraft,
  ExportDraftOptions,
  ExportIssue,
  ExportPage,
  ExportSection,
} from './exportDraftTypes';

export const EXPORT_PAGE_WIDTH = 794;
export const EXPORT_PAGE_HEIGHT = 1123;
export const EXPORT_PAGE_MARGIN = 64;

interface NormalizedCard {
  card: IdeaCard;
  id: string;
  title: string;
  bodyText: string;
  exportText: string;
  url?: string;
  tokens: string[];
  vector: Map<string, number>;
  hasSubstantiveContent: boolean;
}

interface CandidateScore {
  id: string;
  score: number;
  confidence: number;
}

const STOP_WORDS = new Set([
  'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from', 'has', 'have',
  'in', 'is', 'it', 'its', 'of', 'on', 'or', 'that', 'the', 'this', 'to', 'with',
  'we', 'you', 'your', 'into', 'about', 'then', 'than', 'when', 'where', 'which',
]);

const DEFAULT_TEXT_STYLE = {
  fontFamily: 'sans' as const,
  fontSize: 11,
  align: 'left' as const,
};

const HEADING_STYLE = {
  fontFamily: 'sans' as const,
  fontSize: 24,
  bold: true,
  align: 'left' as const,
};

const SECTION_STYLE = {
  fontFamily: 'sans' as const,
  fontSize: 17,
  bold: true,
  align: 'left' as const,
};

const MAX_LAYOUT_BLOCK_HEIGHT = EXPORT_PAGE_HEIGHT - EXPORT_PAGE_MARGIN * 2;
const BODY_PADDING_X = 16;
const BODY_PADDING_Y = 16;
const PDF_TEXT_CHUNK_CHARS = 1400;
const LINE_HEIGHT_RATIO = 1.35;

const normalizeWhitespace = (value: string): string =>
  value.replace(/\s+/g, ' ').trim();

const stripHtml = (html: string): string =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

const tokenise = (text: string): string[] =>
  normalizeWhitespace(text.toLowerCase())
    .split(/[^a-z0-9]+/)
    .filter(token => token.length > 1 && !STOP_WORDS.has(token));

const vectorise = (tokens: string[]): Map<string, number> => {
  const vector = new Map<string, number>();
  tokens.forEach(token => vector.set(token, (vector.get(token) || 0) + 1));
  const len = Math.sqrt(Array.from(vector.values()).reduce((sum, v) => sum + v * v, 0)) || 1;
  vector.forEach((value, key) => vector.set(key, value / len));
  return vector;
};

const cosine = (a: Map<string, number>, b: Map<string, number>): number => {
  let dot = 0;
  const [smaller, larger] = a.size < b.size ? [a, b] : [b, a];
  smaller.forEach((value, key) => {
    dot += value * (larger.get(key) || 0);
  });
  return dot;
};

const isFillerTitle = (title: string): boolean => {
  const t = normalizeWhitespace(title).toLowerCase();
  if (!t || t === 'untitled' || t === 'untitled card') return true;
  if (t === 'new idea' || t === 'idea') return true;
  if (t === 'ai responses' || t === 'label') return true;
  if (/^still+\s+more\s+to\s+do$/.test(t)) return true;
  if (/^to\s+do$/.test(t)) return true;
  return false;
};

const titleQuality = (title: string): number => {
  const clean = normalizeWhitespace(title);
  if (isFillerTitle(clean)) return -1.8;
  const words = clean.split(/\s+/).filter(Boolean).length;
  let score = 0.2;
  if (words >= 2 && words <= 5) score += 1.1;
  if (clean.length <= 48) score += 0.6;
  if (/[.?!:]$/.test(clean)) score -= 0.4;
  if (/\b(concepts?|architecture|overview|fundamentals?|strategy|system|framework|algorithms?|structures?)\b/i.test(clean)) score += 0.5;
  if (/^\d+\./.test(clean)) score -= 0.3;
  return score;
};

const blockId = (prefix: string, id: string, index: number): string =>
  `${prefix}-${id.replace(/[^a-zA-Z0-9_-]/g, '')}-${index}`;

const cardToPlainText = (card: IdeaCard): string => {
  const blocks = blocksToRenderable(parseDocContent(card.content));
  const pieces: string[] = [];

  blocks.forEach(block => {
    if (block.isTable && block.tableData) {
      pieces.push(block.tableData.flat().join(' '));
    }
    if (block.plainText) pieces.push(block.plainText);
  });

  return normalizeWhitespace(pieces.join('\n'));
};

const normalizeCards = (cards: IdeaCard[]): NormalizedCard[] =>
  cards
    .filter(card => card.exportRole !== 'ignore')
    .map(card => {
      const title = card.exportTitleOverride?.trim() || getCardDisplayTitle(card);
      const bodyText = cardToPlainText(card);
      const url = card.url ?? card.image;
      const mediaText = [
        card.kind,
        card.fileSubtype,
        card.imageSubtype,
        card.fileName,
        url ? 'has media' : '',
      ].filter(Boolean).join(' ');
      const exportText = normalizeWhitespace([title, bodyText, mediaText].join(' '));
      const tokens = tokenise(exportText);
      return {
        card,
        id: card.id,
        title,
        bodyText,
        exportText,
        url,
        tokens,
        vector: vectorise(tokens),
        hasSubstantiveContent: cardHasSubstantiveContent(card) || card.kind === 'image' || !!url,
      };
    });

const buildAdjacency = (ids: string[], connections: Connection[]): Map<string, Set<string>> => {
  const idSet = new Set(ids);
  const adjacency = new Map<string, Set<string>>();
  ids.forEach(id => adjacency.set(id, new Set()));
  connections.forEach(conn => {
    if (!idSet.has(conn.fromId) || !idSet.has(conn.toId)) return;
    adjacency.get(conn.fromId)?.add(conn.toId);
    adjacency.get(conn.toId)?.add(conn.fromId);
  });
  return adjacency;
};

const findComponents = (ids: string[], adjacency: Map<string, Set<string>>): string[][] => {
  const visited = new Set<string>();
  const components: string[][] = [];

  ids.forEach(id => {
    if (visited.has(id)) return;
    const stack = [id];
    const component: string[] = [];
    while (stack.length) {
      const current = stack.pop()!;
      if (visited.has(current)) continue;
      visited.add(current);
      component.push(current);
      adjacency.get(current)?.forEach(next => {
        if (!visited.has(next)) stack.push(next);
      });
    }
    components.push(component);
  });

  return components;
};

const shortestPath = (
  start: string,
  target: string,
  adjacency: Map<string, Set<string>>,
  allowed: Set<string>,
): string[] => {
  const queue = [start];
  const parent = new Map<string, string | null>([[start, null]]);

  while (queue.length) {
    const current = queue.shift()!;
    if (current === target) break;
    adjacency.get(current)?.forEach(next => {
      if (!allowed.has(next) || parent.has(next)) return;
      parent.set(next, current);
      queue.push(next);
    });
  }

  if (!parent.has(target)) return [];
  const path: string[] = [];
  let cursor: string | null = target;
  while (cursor) {
    path.unshift(cursor);
    cursor = parent.get(cursor) ?? null;
  }
  return path;
};

const betweennessScores = (
  component: string[],
  adjacency: Map<string, Set<string>>,
): Map<string, number> => {
  const allowed = new Set(component);
  const scores = new Map<string, number>();
  component.forEach(id => scores.set(id, 0));

  for (let i = 0; i < component.length; i += 1) {
    for (let j = i + 1; j < component.length; j += 1) {
      const path = shortestPath(component[i], component[j], adjacency, allowed);
      path.slice(1, -1).forEach(id => scores.set(id, (scores.get(id) || 0) + 1));
    }
  }

  return scores;
};

const normaliseMetric = (value: number, max: number): number =>
  max > 0 ? value / max : 0;

const spatialCentrality = (ids: string[], byId: Map<string, NormalizedCard>, id: string): number => {
  const cards = ids.map(cardId => byId.get(cardId)!.card);
  const centerX = cards.reduce((sum, card) => sum + card.x, 0) / cards.length;
  const centerY = cards.reduce((sum, card) => sum + card.y, 0) / cards.length;
  const distances = cards.map(card => Math.hypot(card.x - centerX, card.y - centerY));
  const maxDistance = Math.max(...distances, 1);
  const card = byId.get(id)!.card;
  return 1 - Math.min(1, Math.hypot(card.x - centerX, card.y - centerY) / maxDistance);
};

const semanticMedoid = (ids: string[], byId: Map<string, NormalizedCard>, id: string): number => {
  if (ids.length <= 1) return 0;
  const current = byId.get(id)!;
  const total = ids
    .filter(other => other !== id)
    .reduce((sum, other) => sum + cosine(current.vector, byId.get(other)!.vector), 0);
  return total / (ids.length - 1);
};

const scoreCandidates = (
  ids: string[],
  byId: Map<string, NormalizedCard>,
  adjacency: Map<string, Set<string>>,
  connections: Connection[],
): CandidateScore[] => {
  const idSet = new Set(ids);
  const between = betweennessScores(ids, adjacency);
  const maxDegree = Math.max(...ids.map(id => adjacency.get(id)?.size || 0), 1);
  const maxBetween = Math.max(...ids.map(id => between.get(id) || 0), 1);
  const maxParentOut = Math.max(...ids.map(id =>
    connections.filter(conn =>
      idSet.has(conn.fromId) &&
      idSet.has(conn.toId) &&
      ((conn.fromId === id && conn.relationType === RelationType.PARENT_TO_CHILD) ||
       (conn.toId === id && conn.relationType === RelationType.CHILD_TO_PARENT))
    ).length
  ), 1);

  const raw = ids.map(id => {
    const item = byId.get(id)!;
    const degree = normaliseMetric(adjacency.get(id)?.size || 0, maxDegree);
    const bridge = normaliseMetric(between.get(id) || 0, maxBetween);
    const parentOut = normaliseMetric(connections.filter(conn =>
      idSet.has(conn.fromId) &&
      idSet.has(conn.toId) &&
      ((conn.fromId === id && conn.relationType === RelationType.PARENT_TO_CHILD) ||
       (conn.toId === id && conn.relationType === RelationType.CHILD_TO_PARENT))
    ).length, maxParentOut);
    const semantic = semanticMedoid(ids, byId, id);
    const title = titleQuality(item.title);
    const spatial = spatialCentrality(ids, byId, id);
    const labelBoost = item.card.kind === 'label' ? 0.35 : 0;
    const roleBoost = item.card.exportRole === 'chapter' ? 4 : item.card.exportRole === 'section' ? 1.2 : 0;
    const longBodyPenalty = Math.min(0.8, item.bodyText.length / 6000);

    return {
      id,
      score:
        roleBoost +
        degree * 2.1 +
        bridge * 2.2 +
        parentOut * 1.4 +
        semantic * 1.8 +
        title * 1.45 +
        spatial * 0.75 +
        labelBoost -
        longBodyPenalty,
      confidence: 0,
    };
  }).sort((a, b) => b.score - a.score);

  const top = raw[0]?.score ?? 0;
  const bottom = raw[raw.length - 1]?.score ?? top;
  return raw.map(item => ({
    ...item,
    confidence: top === bottom ? 0.5 : Math.max(0.1, Math.min(0.98, (item.score - bottom) / (top - bottom))),
  }));
};

const relationStrength = (rootId: string, childId: string, connections: Connection[]): number => {
  const conn = connections.find(c =>
    (c.fromId === rootId && c.toId === childId) ||
    (c.fromId === childId && c.toId === rootId)
  );
  if (!conn) return 0;
  if (conn.fromId === rootId && conn.relationType === RelationType.PARENT_TO_CHILD) return 1.4;
  if (conn.toId === rootId && conn.relationType === RelationType.CHILD_TO_PARENT) return 1.4;
  if (conn.relationType === RelationType.EQUIVALENCE) return 0.5;
  return 0.8;
};

const collectBranch = (
  start: string,
  rootId: string,
  componentSet: Set<string>,
  adjacency: Map<string, Set<string>>,
  globallyVisited: Set<string>,
): string[] => {
  const branch: string[] = [];
  const stack = [start];
  while (stack.length) {
    const current = stack.pop()!;
    if (current === rootId || globallyVisited.has(current) || !componentSet.has(current)) continue;
    globallyVisited.add(current);
    branch.push(current);
    adjacency.get(current)?.forEach(next => {
      if (next !== rootId && !globallyVisited.has(next)) stack.push(next);
    });
  }
  return branch;
};

const orderCardsFrom = (
  rootId: string,
  ids: string[],
  byId: Map<string, NormalizedCard>,
  adjacency: Map<string, Set<string>>,
): string[] => {
  const allowed = new Set(ids);
  const visited = new Set<string>();
  const ordered: string[] = [];
  const visit = (id: string) => {
    if (!allowed.has(id) || visited.has(id)) return;
    visited.add(id);
    ordered.push(id);
    Array.from(adjacency.get(id) || [])
      .filter(next => allowed.has(next))
      .sort((a, b) => byId.get(a)!.card.y - byId.get(b)!.card.y || byId.get(a)!.card.x - byId.get(b)!.card.x)
      .forEach(visit);
  };
  visit(rootId);
  ids
    .filter(id => !visited.has(id))
    .sort((a, b) => byId.get(a)!.card.y - byId.get(b)!.card.y || byId.get(a)!.card.x - byId.get(b)!.card.x)
    .forEach(visit);
  return ordered;
};

const textChunks = (text: string, maxChars = 1700): string[] => {
  const clean = text.trim();
  if (clean.length <= maxChars) return clean ? [clean] : [];
  const paragraphs = clean.split(/\n{2,}/);
  const chunks: string[] = [];
  let current = '';
  paragraphs.forEach(paragraph => {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length > maxChars && current) {
      chunks.push(current);
      current = paragraph;
    } else {
      current = candidate;
    }
  });
  if (current) chunks.push(current);
  return chunks.flatMap(chunk => {
    if (chunk.length <= maxChars) return [chunk];
    const pieces: string[] = [];
    for (let i = 0; i < chunk.length; i += maxChars) pieces.push(chunk.slice(i, i + maxChars));
    return pieces;
  });
};

const estimatedCharsPerLine = (fontSize: number, width: number, fontFamily?: string): number => {
  const averageCharWidth = fontSize * (fontFamily === 'mono' ? 0.62 : 0.56);
  return Math.max(12, Math.floor(width / Math.max(1, averageCharWidth)));
};

const estimateLineCount = (text: string, fontSize: number, width: number, fontFamily?: string): number => {
  const clean = (text || '').trim();
  if (!clean) return 0;
  const charsPerLine = estimatedCharsPerLine(fontSize, width, fontFamily);
  return clean.split(/\n/).reduce((total, paragraph) => {
    if (!paragraph.trim()) return total + 1;
    const words = paragraph.trim().split(/\s+/);
    let lines = 1;
    let current = 0;
    words.forEach(word => {
      const wordLength = Math.max(1, word.length);
      if (wordLength > charsPerLine) {
        const wordLines = Math.ceil(wordLength / charsPerLine);
        lines += current === 0 ? wordLines - 1 : wordLines;
        current = wordLength % charsPerLine;
        return;
      }
      if (current === 0) {
        current = wordLength;
      } else if (current + 1 + wordLength > charsPerLine) {
        lines += 1;
        current = wordLength;
      } else {
        current += 1 + wordLength;
      }
    });
    return total + lines;
  }, 0);
};

const clampEstimatedHeight = (height: number, min: number): number =>
  Math.min(MAX_LAYOUT_BLOCK_HEIGHT, Math.max(min, Math.ceil(height)));

const createBlocksForCard = (
  item: NormalizedCard,
  options: Required<ExportDraftOptions>,
): ExportBlock[] => {
  const { card, title, bodyText, url } = item;
  const blocks = blocksToRenderable(parseDocContent(card.content));
  const output: ExportBlock[] = [];
  let index = 0;

  blocks.forEach(block => {
    if (block.imageUrls?.length) {
      block.imageUrls.forEach(imageUrl => {
        output.push({
          id: blockId('inline-image', card.id, index++),
          type: 'image',
          sourceCardId: card.id,
          title,
          url: imageUrl,
          style: { ...DEFAULT_TEXT_STYLE },
        });
      });
    }
    if (block.isTable && block.tableData?.length) {
      output.push({
        id: blockId('table', card.id, index++),
        type: 'table',
        sourceCardId: card.id,
        title,
        rows: block.tableData,
        style: { ...DEFAULT_TEXT_STYLE },
      });
    }
    if (block.isCode && block.plainText) {
      output.push({
        id: blockId('code', card.id, index++),
        type: 'code',
        sourceCardId: card.id,
        title,
        content: block.plainText,
        style: { fontFamily: 'mono', fontSize: 9, align: 'left' },
      });
    }
  });

  if (card.kind === 'image' && url) {
    output.unshift({
      id: blockId('image-card', card.id, index++),
      type: 'image',
      sourceCardId: card.id,
      title: card.fileName || title,
      url,
      style: { ...DEFAULT_TEXT_STYLE },
    });
  } else if (card.kind === 'file' && card.fileSubtype === 'pdf' && url) {
    const pdfTextChunks = textChunks(bodyText, PDF_TEXT_CHUNK_CHARS);
    const [firstTextChunk, ...remainingTextChunks] = pdfTextChunks;
    output.unshift({
      id: blockId('pdf-card', card.id, index++),
      type: 'pdf',
      sourceCardId: card.id,
      title: card.fileName || title,
      url,
      extractedText: firstTextChunk || bodyText,
      appendOriginalPages: options.appendOriginalPdfPages,
      style: { ...DEFAULT_TEXT_STYLE },
    });
    remainingTextChunks.forEach((chunk, chunkIndex) => {
      output.push({
        id: blockId('pdf-text', card.id, chunkIndex),
        type: 'text',
        sourceCardId: card.id,
        title: `${card.fileName || title} continued`,
        content: chunk,
        style: { ...DEFAULT_TEXT_STYLE },
      });
    });
  } else if (card.kind === 'browser' && url) {
    output.push({
      id: blockId('browser-link', card.id, index++),
      type: 'link',
      sourceCardId: card.id,
      title,
      content: url,
      url,
      style: { ...DEFAULT_TEXT_STYLE },
    });
  }

  const bodyWithoutDuplicateTitle = normalizeWhitespace(bodyText) === normalizeWhitespace(title) ? '' : bodyText;
  if (bodyWithoutDuplicateTitle && card.kind !== 'file') {
    textChunks(bodyWithoutDuplicateTitle).forEach((chunk, chunkIndex) => {
      output.unshift({
        id: blockId('text', card.id, chunkIndex),
        type: 'text',
        sourceCardId: card.id,
        title: chunkIndex === 0 ? title : `${title} continued`,
        content: chunk,
        style: { ...DEFAULT_TEXT_STYLE },
      });
    });
  } else if (card.kind === 'text' && !bodyWithoutDuplicateTitle && title && !isFillerTitle(title)) {
    output.push({
      id: blockId('text-title', card.id, index++),
      type: 'text',
      sourceCardId: card.id,
      title,
      content: title,
      style: { ...DEFAULT_TEXT_STYLE },
    });
  }

  return output;
};

const estimateTextBlockHeight = (block: ExportBlock, width: number): number => {
  const size = block.style.fontSize;
  const contentWidth = width - BODY_PADDING_X;
  const title = block.type === 'heading' ? '' : block.title || '';
  const content = block.type === 'pdf'
    ? block.extractedText || block.content || 'Original PDF pages will be appended after the compiled document.'
    : block.content || '';
  const titleSize = Math.min(12, size + 1);
  const titleLines = estimateLineCount(title, titleSize, contentWidth, block.style.fontFamily);
  const contentLines = estimateLineCount(content, size, contentWidth, block.style.fontFamily);
  const titleHeight = titleLines ? titleLines * titleSize * LINE_HEIGHT_RATIO + 3 : 0;
  const contentHeight = contentLines * size * LINE_HEIGHT_RATIO;
  const minHeight = block.type === 'pdf' ? 170 : block.type === 'code' ? 88 : 70;
  return clampEstimatedHeight(BODY_PADDING_Y + titleHeight + contentHeight, minHeight);
};

const estimateBlockHeight = (block: ExportBlock, width: number): number => {
  if (block.type === 'heading') {
    const size = block.style.fontSize;
    const lines = estimateLineCount(block.content || block.title || '', size, width, block.style.fontFamily);
    const minHeight = size >= 20 ? 64 : 44;
    return clampEstimatedHeight(lines * size * LINE_HEIGHT_RATIO + size * 0.7, minHeight);
  }
  if (block.type === 'image') return 260;
  if (block.type === 'pdf') return estimateTextBlockHeight(block, width);
  if (block.type === 'table') return Math.min(420, 42 + (block.rows?.length || 1) * 28);
  if (block.type === 'code') return estimateTextBlockHeight(block, width);
  return estimateTextBlockHeight(block, width);
};

const cloneBlockWithLayout = (
  block: ExportBlock,
  pageIndex: number,
  x: number,
  y: number,
  width: number,
  height: number,
): ExportBlock => ({
  ...block,
  layout: { pageIndex, x, y, width, height },
});

export const rebuildDraftPages = (draft: ExportDraft): ExportDraft => {
  const pages: ExportPage[] = [];
  let current: ExportPage | null = null;
  let y = EXPORT_PAGE_MARGIN;
  const x = EXPORT_PAGE_MARGIN;
  const width = EXPORT_PAGE_WIDTH - EXPORT_PAGE_MARGIN * 2;
  const bottom = EXPORT_PAGE_HEIGHT - EXPORT_PAGE_MARGIN;

  const newPage = (chapterId?: string, sectionId?: string, title?: string) => {
    current = {
      id: `page-${pages.length + 1}`,
      title,
      chapterId,
      sectionId,
      blocks: [],
    };
    pages.push(current);
    y = EXPORT_PAGE_MARGIN;
  };

  const addBlock = (block: ExportBlock, chapterId?: string, sectionId?: string, pageTitle?: string) => {
    const height = estimateBlockHeight(block, width);
    if (!current || y + height > bottom) newPage(chapterId, sectionId, pageTitle);
    current!.blocks.push(cloneBlockWithLayout(block, pages.length - 1, x, y, width, height));
    y += height + 18;
  };

  draft.chapters.forEach(chapter => {
    newPage(chapter.id, undefined, chapter.title);
    addBlock({
      id: `chapter-heading-${chapter.id}`,
      type: 'heading',
      sourceCardId: chapter.sourceCardId,
      title: chapter.title,
      content: chapter.title,
      style: { ...HEADING_STYLE },
    }, chapter.id, undefined, chapter.title);

    chapter.blocks.forEach(block => addBlock(block, chapter.id, undefined, chapter.title));

    chapter.sections.forEach(section => {
      addBlock({
        id: `section-heading-${section.id}`,
        type: 'heading',
        sourceCardId: section.sourceCardId,
        title: section.title,
        content: section.title,
        style: { ...SECTION_STYLE },
      }, chapter.id, section.id, section.title);
      section.blocks.forEach(block => addBlock(block, chapter.id, section.id, section.title));
    });
  });

  if (draft.appendix.length) {
    newPage('appendix', undefined, 'Appendix');
    addBlock({
      id: 'appendix-heading',
      type: 'heading',
      title: 'Appendix',
      content: 'Appendix',
      style: { ...HEADING_STYLE },
    }, 'appendix', undefined, 'Appendix');
    draft.appendix.forEach(block => addBlock(block, 'appendix', undefined, 'Appendix'));
  }

  return { ...draft, pages };
};

const buildChapter = (
  component: string[],
  byId: Map<string, NormalizedCard>,
  adjacency: Map<string, Set<string>>,
  connections: Connection[],
  options: Required<ExportDraftOptions>,
): ExportChapter => {
  const scores = scoreCandidates(component, byId, adjacency, connections);
  const root = scores[0];
  const rootItem = byId.get(root.id)!;
  const componentSet = new Set(component);
  const rootNeighbors = Array.from(adjacency.get(root.id) || []).filter(id => componentSet.has(id));
  const branchVisited = new Set<string>();
  const sections: ExportSection[] = [];

  rootNeighbors
    .sort((a, b) =>
      relationStrength(root.id, b, connections) - relationStrength(root.id, a, connections) ||
      byId.get(a)!.card.y - byId.get(b)!.card.y ||
      byId.get(a)!.card.x - byId.get(b)!.card.x
    )
    .forEach(neighbor => {
      if (branchVisited.has(neighbor)) return;
      const branch = collectBranch(neighbor, root.id, componentSet, adjacency, branchVisited);
      if (!branch.length) return;
      const branchScores = scoreCandidates(branch, byId, adjacency, connections)
        .map(item => ({
          ...item,
          score: item.score + (item.id === neighbor ? relationStrength(root.id, neighbor, connections) : 0),
        }))
        .sort((a, b) => b.score - a.score);
      const sectionRoot = branchScores[0]?.id || neighbor;
      const ordered = orderCardsFrom(sectionRoot, branch, byId, adjacency);
      const sectionBlocks = ordered.flatMap(id => createBlocksForCard(byId.get(id)!, options));
      sections.push({
        id: `section-${sectionRoot}`,
        title: byId.get(sectionRoot)!.title,
        sourceCardId: sectionRoot,
        cards: ordered,
        blocks: sectionBlocks,
      });
    });

  const assigned = new Set<string>([root.id, ...sections.flatMap(section => section.cards)]);
  const unassigned = component.filter(id => !assigned.has(id));
  const chapterBlocks = [
    ...createBlocksForCard(rootItem, options),
    ...unassigned.flatMap(id => createBlocksForCard(byId.get(id)!, options)),
  ];

  return {
    id: `chapter-${root.id}`,
    title: rootItem.title,
    sourceCardId: root.id,
    confidence: root.confidence,
    cards: component,
    sections,
    blocks: chapterBlocks,
  };
};

const createAppendixBlock = (item: NormalizedCard, index: number): ExportBlock => ({
  id: blockId('appendix', item.id, index),
  type: 'text',
  sourceCardId: item.id,
  title: item.title,
  content: item.title,
  style: { ...DEFAULT_TEXT_STYLE },
});

export const buildExportDraft = async (
  sessionName: string,
  cards: IdeaCard[],
  connections: Connection[],
  options: ExportDraftOptions = {},
): Promise<ExportDraft> => {
  const resolvedOptions: Required<ExportDraftOptions> = {
    appendOriginalPdfPages: options.appendOriginalPdfPages ?? true,
  };
  const normalized = normalizeCards(cards);
  const byId = new Map(normalized.map(item => [item.id, item]));
  const ids = normalized.map(item => item.id);
  const adjacency = buildAdjacency(ids, connections);
  const components = findComponents(ids, adjacency)
    .sort((a, b) => {
      const firstA = a.map(id => byId.get(id)!.card).sort((c1, c2) =>
        (c1.createdAt ?? Infinity) - (c2.createdAt ?? Infinity) ||
        c1.y - c2.y ||
        c1.x - c2.x
      )[0];
      const firstB = b.map(id => byId.get(id)!.card).sort((c1, c2) =>
        (c1.createdAt ?? Infinity) - (c2.createdAt ?? Infinity) ||
        c1.y - c2.y ||
        c1.x - c2.x
      )[0];
      return (firstA.createdAt ?? Infinity) - (firstB.createdAt ?? Infinity) ||
        firstA.y - firstB.y ||
        firstA.x - firstB.x;
    });

  const chapters: ExportChapter[] = [];
  const appendix: ExportBlock[] = [];
  const issues: ExportIssue[] = [];

  components.forEach(component => {
    const hasContent = component.some(id => byId.get(id)!.hasSubstantiveContent);
    const explicitAppendix = component.every(id => byId.get(id)!.card.exportRole === 'appendix');
    if (!hasContent || explicitAppendix) {
      component.forEach((id, index) => appendix.push(createAppendixBlock(byId.get(id)!, appendix.length + index)));
      return;
    }
    chapters.push(buildChapter(component, byId, adjacency, connections, resolvedOptions));
  });

  const draft: ExportDraft = {
    title: sessionName,
    generatedAt: new Date().toISOString(),
    chapters,
    appendix,
    pages: [],
    sourceCardIds: ids,
    issues,
    source: {
      cards: normalized.map(item => ({
        id: item.id,
        text: item.card.text,
        kind: item.card.kind,
        fileName: item.card.fileName,
      })),
      connections: connections.map(conn => ({
        id: conn.id,
        fromId: conn.fromId,
        toId: conn.toId,
        relationType: conn.relationType,
        label: conn.label,
      })),
    },
  };

  return rebuildDraftPages(draft);
};
