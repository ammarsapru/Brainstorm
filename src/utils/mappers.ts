
import { Session, IdeaCard, Connection, ArrowType, FileSystemItem, Collection } from '../../types';
import { INITIAL_CARDS, INITIAL_COLLECTIONS } from '../../constants';
import { buildFileSystemTree } from '../integrations/supabase/utils/tree-transformer';

export const mapSessionData = (
    sessionData: any,
    cardsData: any[],
    connsData: any[],
    filesData: any[],
    collectionsData: any[] = []
): Session => {

    // Map Cards
    const cards: IdeaCard[] = cardsData.map((c: any) => ({
        id: c.id,
        x: c.x,
        y: c.y,
        text: c.text,
        content: c.content,
        width: c.width,
        height: c.height,
        color: c.color,
        style: c.style,
        image: c.image,
        fileName: c.file_name,
        collectionId: c.collectionId || c.collection_id // Handle both cases if DB uses snake_case
    }));

    // Map Connections
    const connections: Connection[] = connsData.map((c: any) => ({
        id: c.id,
        fromId: c.from_id,
        toId: c.to_id,
        style: c.style,
        relationType: c.relation_type,
        arrowStart: c.arrow_start || ArrowType.NONE,
        arrowEnd: c.arrow_end || ArrowType.STANDARD
    }));

    // Map Collections
    const collections: Collection[] = collectionsData.length > 0
        ? collectionsData.map((c: any) => ({ id: c.id, name: c.name }))
        : INITIAL_COLLECTIONS; // Default if none

    // Map File System
    const fileSystem = buildFileSystemTree(filesData);

    return {
        id: sessionData.id,
        user_id: sessionData.user_id,
        name: sessionData.name,
        thumbnail: sessionData.thumbnail,
        icon: sessionData.icon,
        viewport_x: sessionData.viewport_x,
        viewport_y: sessionData.viewport_y,
        viewport_zoom: sessionData.viewport_zoom,
        cards: cards,
        connections: connections,
        fileSystem: fileSystem,
        collections: collections,
        chatHistory: [], // Usually loaded separately or empty on list view
        lastModified: new Date(sessionData.last_modified).getTime() || Date.now()
    };
};
