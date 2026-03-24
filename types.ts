

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export enum ConnectionStyle {
  SOLID = 'solid',
  DASHED = 'dashed',
  DOTTED = 'dotted',
}

export enum ArrowType {
  STANDARD = 'standard',
  DIAMOND = 'diamond',
  CIRCLE = 'circle',
  NONE = 'none',
}

export enum RelationType {
  EQUIVALENCE = 'equivalence',   // Arrow at BOTH ends
  PARENT_TO_CHILD = 'parent-child', // Circle at start, Arrow at end
  CHILD_TO_PARENT = 'child-parent', // Arrow at start, Circle at end
}

export interface CardStyle {
  isBold: boolean;
  isItalic: boolean;
  fontFamily: 'sans' | 'serif' | 'mono' | 'cursive';
  fontSize: number;
}

export interface FileSystemItem {
  id: string;
  type: 'folder' | 'file';
  name: string;
  content?: string; // Only for files
  isOpen?: boolean; // For folders
  children?: FileSystemItem[]; // For folders
  createdAt: number;
  mediaType?: string; // New: to distinguish between text docs and images
}

export interface Collection {
  id: string;
  name: string;
}

export interface IdeaCard {
  id: string;
  x: number;
  y: number;
  text: string; // Plain text for display on canvas
  content?: any; // Rich text JSON for DocumentEditor (JSONB in Supabase)
  width: number;
  height: number;
  color: string;
  style: CardStyle;
  image?: string; // Base64 data URL
  fileName?: string;
  collectionId?: string; // The ID of the collection this card belongs to
}

export interface Connection {
  id: string;
  fromId: string;
  toId: string;
  style: ConnectionStyle;
  // We rely mostly on RelationType now for visual ends, but keeping these for backwards compat/customization
  arrowStart: ArrowType;
  arrowEnd: ArrowType;
  label?: string;
  relationType: RelationType;
  color?: string;
}

export type ToolMode = 'select' | 'pan' | 'connect' | 'draw';
export type DrawingTool = 'pen' | 'marker' | 'eraser';

export interface Stroke {
  id: string;
  tool: DrawingTool;
  color: string;
  radius: number;
  points: Point[];
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

export interface ChatAttachment {
  id: string;
  type: 'image' | 'file';
  url: string; // Base64 or Object URL
  name: string;
  mimeType?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
  attachments?: ChatAttachment[];
  model?: string;
}

export interface UserProfile {
  id: string;
  email?: string;
  full_name?: string;
  avatar_url?: string;
}

export interface Session {
  id: string;
  user_id?: string; // Supabase Owner ID
  // Viewport State (Supabase persistence)
  viewport_x?: number;
  viewport_y?: number;
  viewport_zoom?: number;

  name: string;
  icon?: string; // Emoji icon
  cards: IdeaCard[];
  connections: Connection[];
  fileSystem: FileSystemItem[];
  collections?: Collection[]; // List of card collections
  chatHistory: ChatMessage[];
  strokes?: Stroke[]; // Transient runtime state, synced via hidden file
  lastModified: number;
  thumbnail?: string;
}