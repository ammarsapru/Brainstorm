import { IdeaCard, CardKind, FileSubtype, ImageSubtype } from '../types';
import { isCodeFile } from './codeLanguages';

export function mimeToFileSubtype(mime: string, name: string): FileSubtype {
  const n = name.toLowerCase();
  if (mime === 'application/pdf' || n.endsWith('.pdf')) return 'pdf';
  if (mime === 'text/markdown' || n.endsWith('.md')) return 'md';
  if (
    mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    n.endsWith('.docx')
  ) return 'docx';
  if (
    mime === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    n.endsWith('.pptx')
  ) return 'pptx';
  if (mime === 'text/plain' || n.endsWith('.txt')) return 'txt';
  if (isCodeFile(name)) return 'code';
  return 'other';
}

export function mimeToImageSubtype(mime: string, name: string): ImageSubtype {
  const n = name.toLowerCase();
  if (mime === 'image/png' || n.endsWith('.png')) return 'png';
  if (mime === 'image/jpeg' || n.endsWith('.jpg') || n.endsWith('.jpeg')) return 'jpeg';
  if (mime === 'image/gif' || n.endsWith('.gif')) return 'gif';
  if (mime === 'image/webp' || n.endsWith('.webp')) return 'webp';
  if (mime === 'image/svg+xml' || n.endsWith('.svg')) return 'svg';
  return 'other';
}

function inferKindFromLegacy(card: IdeaCard): CardKind {
  if (card.cardType === 'label') return 'label';
  const url = card.image;
  const name = card.fileName ?? '';
  if (!url) return 'text';
  const isPdf =
    url.startsWith('data:application/pdf') ||
    name.toLowerCase().endsWith('.pdf') ||
    url.toLowerCase().includes('.pdf');
  if (isPdf) return 'file';
  return 'image';
}

function inferFileSubtypeFromLegacy(card: IdeaCard): FileSubtype {
  const url = card.image ?? '';
  const name = card.fileName ?? url;
  return mimeToFileSubtype('', name);
}

function inferImageSubtypeFromLegacy(card: IdeaCard): ImageSubtype {
  const url = card.image ?? '';
  const name = card.fileName ?? url;
  return mimeToImageSubtype('', name);
}

/** Normalise a card loaded from the DB to the current IdeaCard shape. Idempotent. */
export function migrateCard(card: IdeaCard): IdeaCard {
  if (card.kind) return card;

  const kind = inferKindFromLegacy(card);
  const url = card.url ?? card.image;

  const extra: Partial<IdeaCard> = { kind, url };
  if (kind === 'file') extra.fileSubtype = inferFileSubtypeFromLegacy(card);
  if (kind === 'image') extra.imageSubtype = inferImageSubtypeFromLegacy(card);

  return { ...card, ...extra };
}
