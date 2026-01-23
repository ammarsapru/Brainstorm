
import { FileSystemItem } from '@/types';

export interface FlatFileSystemNode {
    id: string;
    session_id: string; // Foreign Key, handled by caller or DB context
    parent_id: string | null;
    type: 'file' | 'folder';
    name: string;
    content: string | null;
    media_type: string | null;
    created_at: number; // changed from number | string to number to match DB
    is_open?: boolean; // UI state, debatable if this persists, but we'll include it
}

/**
 * Flattens the recursive FileSystemItem tree into a flat list for Supabase.
 */
export function flattenFileSystem(
    items: FileSystemItem[],
    sessionId: string,
    parentId: string | null = null
): FlatFileSystemNode[] {
    let result: FlatFileSystemNode[] = [];

    for (const item of items) {
        const node: FlatFileSystemNode = {
            id: item.id,
            session_id: sessionId,
            parent_id: parentId,
            type: item.type,
            name: item.name,
            content: item.content || null,
            media_type: item.mediaType || null,
            created_at: item.createdAt, // Send as number (bigint in DB)
            is_open: item.isOpen
        };

        result.push(node);

        if (item.children) {
            const childrenNodes = flattenFileSystem(item.children, sessionId, item.id);
            result = result.concat(childrenNodes);
        }
    }

    return result;
}

/**
 * Reconstructs the recursive FileSystemItem tree from a flat list.
 */
export function buildFileSystemTree(nodes: FlatFileSystemNode[]): FileSystemItem[] {
    const itemMap = new Map<string, FileSystemItem>();
    const roots: FileSystemItem[] = [];

    // 1. Create all items
    nodes.forEach(node => {
        itemMap.set(node.id, {
            id: node.id,
            type: node.type,
            name: node.name,
            content: node.content || undefined,
            mediaType: node.media_type || undefined,
            createdAt: node.created_at,
            isOpen: node.is_open || false, // Default to closed if null
            children: node.type === 'folder' ? [] : undefined
        });
    });

    // 2. Build hierarchy
    nodes.forEach(node => {
        const item = itemMap.get(node.id)!;
        if (node.parent_id && itemMap.has(node.parent_id)) {
            const parent = itemMap.get(node.parent_id)!;
            if (parent.children) {
                parent.children.push(item);
            }
        } else {
            roots.push(item);
        }
    });

    return roots;
}
