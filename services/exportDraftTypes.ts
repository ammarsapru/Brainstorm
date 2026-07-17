import { Connection, IdeaCard } from '../types';

export type ExportBlockType = 'text' | 'image' | 'pdf' | 'code' | 'table' | 'heading' | 'link';

export interface ExportBlockStyle {
  fontFamily: 'sans' | 'serif' | 'mono';
  fontSize: number;
  bold?: boolean;
  italic?: boolean;
  align?: 'left' | 'center' | 'right';
}

export interface ExportBlockLayout {
  pageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExportBlock {
  id: string;
  type: ExportBlockType;
  sourceCardId?: string;
  title?: string;
  content?: string;
  url?: string;
  extractedText?: string;
  appendOriginalPages?: boolean;
  rows?: string[][];
  language?: string;
  style: ExportBlockStyle;
  layout?: ExportBlockLayout;
}

export interface ExportSection {
  id: string;
  title: string;
  sourceCardId?: string;
  cards: string[];
  blocks: ExportBlock[];
}

export interface ExportChapter {
  id: string;
  title: string;
  sourceCardId?: string;
  confidence: number;
  cards: string[];
  sections: ExportSection[];
  blocks: ExportBlock[];
}

export interface ExportPage {
  id: string;
  title?: string;
  chapterId?: string;
  sectionId?: string;
  blocks: ExportBlock[];
}

export interface ExportIssue {
  severity: 'info' | 'warning' | 'error';
  message: string;
  sourceId?: string;
}

export interface ExportDraft {
  title: string;
  generatedAt: string;
  chapters: ExportChapter[];
  appendix: ExportBlock[];
  pages: ExportPage[];
  sourceCardIds: string[];
  issues: ExportIssue[];
  source?: {
    cards: Pick<IdeaCard, 'id' | 'text' | 'kind' | 'fileName'>[];
    connections: Pick<Connection, 'id' | 'fromId' | 'toId' | 'relationType' | 'label'>[];
  };
}

export interface ExportDraftOptions {
  appendOriginalPdfPages?: boolean;
}

