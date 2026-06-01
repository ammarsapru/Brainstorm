import { IdeaCard } from '../types';

/** Matches DocumentEditor `DocBlock` JSON stored on cards. */
export interface DocBlock {
  id: string;
  type?: 'text' | 'code' | 'table';
  text: string;
  style?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    fontSize?: number;
    fontFamily?: string;
    listType?: 'none' | 'bullet' | 'number';
  };
  language?: string;
  tableData?: string[][];
}

export interface ParsedBlock {
  plainText: string;
  listType: 'none' | 'bullet' | 'number';
  bold: boolean;
  italic: boolean;
  fontSize: number;
  isCode: boolean;
  isTable?: boolean;
  tableData?: string[][];
  imageUrls?: string[];
}

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

const extractImageUrls = (html: string): string[] => {
  const urls: string[] = [];
  const regex = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
  let match = regex.exec(html);
  while (match) {
    if (match[1]) urls.push(match[1]);
    match = regex.exec(html);
  }
  return urls;
};

export const parseDocContent = (content: unknown): DocBlock[] => {
  if (!content) return [];
  if (typeof content === 'string') {
    try {
      const parsed = JSON.parse(content);
      if (Array.isArray(parsed) && parsed.length > 0 && parsed[0]?.id != null) {
        return parsed as DocBlock[];
      }
    } catch {
      return content.split('\n').map((line, i) => ({
        id: `line-${i}`,
        text: line,
        style: { listType: 'none' as const },
      }));
    }
    return [{ id: 'legacy', text: content, style: { listType: 'none' } }];
  }
  if (Array.isArray(content)) {
    return content as DocBlock[];
  }
  return [];
};

export const blocksToRenderable = (blocks: DocBlock[]): ParsedBlock[] =>
  blocks.map(block => {
    const rawText = block.text || '';
    return {
      plainText: stripHtml(rawText),
      listType: block.style?.listType ?? 'none',
      bold: !!block.style?.bold,
      italic: !!block.style?.italic,
      fontSize: block.style?.fontSize ?? 16,
      isCode: block.type === 'code',
      isTable: block.type === 'table',
      tableData: block.tableData,
      imageUrls: rawText ? extractImageUrls(rawText) : [],
    };
  });

export const isGenericTitle = (text: string): boolean => {
  const t = text.trim();
  if (!t) return true;
  return /^untitled$/i.test(t) || /^new idea$/i.test(t) || /^idea$/i.test(t);
};

export const getCardDisplayTitle = (card: IdeaCard): string => {
  if (card.text?.trim() && !isGenericTitle(card.text)) {
    return card.text.trim();
  }
  const blocks = parseDocContent(card.content);
  const firstHeading = blocks.find(b => stripHtml(b.text).trim());
  if (firstHeading) {
    const line = stripHtml(firstHeading.text).trim();
    if (line) return line.length > 100 ? `${line.slice(0, 97)}…` : line;
  }
  if (card.fileName?.trim()) return card.fileName.trim();
  return 'Untitled';
};

export const cardHasSubstantiveContent = (card: IdeaCard): boolean => {
  const blocks = parseDocContent(card.content);
  const bodyChars = blocks.reduce((n, b) => n + stripHtml(b.text).length, 0);
  if (bodyChars > 0) return true;
  return !!(card.text?.trim() && !isGenericTitle(card.text));
};

export const partitionCards = (
  cards: IdeaCard[]
): { withContent: IdeaCard[]; noContent: IdeaCard[] } => {
  const withContent: IdeaCard[] = [];
  const noContent: IdeaCard[] = [];
  cards.forEach(c => {
    if (cardHasSubstantiveContent(c)) withContent.push(c);
    else noContent.push(c);
  });
  return { withContent, noContent };
};
