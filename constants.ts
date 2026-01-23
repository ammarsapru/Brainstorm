import { ArrowType, ConnectionStyle, CardStyle, RelationType } from "./types";

export const CARD_WIDTH = 220;
export const CARD_HEIGHT = 140;
export const CARD_COLORS = [
  '#ffffff', // White
  '#fef3c7', // Amber
  '#dcfce7', // Green
  '#dbeafe', // Blue
  '#fce7f3', // Pink
  '#f3e8ff', // Purple
];

export const DEFAULT_CONNECTION_STYLE = ConnectionStyle.SOLID;
export const DEFAULT_ARROW_START = ArrowType.NONE;
export const DEFAULT_ARROW_END = ArrowType.STANDARD;
export const DEFAULT_RELATION_TYPE = RelationType.EQUIVALENCE;

export const DEFAULT_COLLECTION_ID = '00000000-0000-0000-0000-000000000000'; // Default UUID (nil or fixed)
// Ideally generate one, but for constants it needs to be static. 
// Using a fixed valid UUID to ensure foreign key constraints pass if we insert this.
// However, 'root' card ID also needs to be UUID.

export const DEFAULT_CARD_STYLE: CardStyle = {
  isBold: false,
  isItalic: false,
  fontFamily: 'sans',
  fontSize: 16
};

export const INITIAL_COLLECTIONS = [
  { id: DEFAULT_COLLECTION_ID, name: 'General Ideas' }
];

export const INITIAL_CARDS = [
  {
    id: '11111111-1111-1111-1111-111111111111', // Valid UUID
    x: 0,
    y: 0,
    text: 'Central Idea',
    width: CARD_WIDTH,
    height: CARD_HEIGHT,
    color: '#ffffff',
    style: { ...DEFAULT_CARD_STYLE, isBold: true, fontSize: 18 },
    collectionId: DEFAULT_COLLECTION_ID
  }
];