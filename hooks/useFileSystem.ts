import { useState, useCallback, MutableRefObject, Dispatch, SetStateAction } from 'react';
import { FileSystemItem, IdeaCard } from '../types';
import { DEFAULT_CARD_STYLE } from '../constants';
import { generateId } from '../utils/generateId';
import { uploadFileToS3 } from '../lib/supabase';

export interface UseFileSystemResult {
  fileSystem: FileSystemItem[];
  setFileSystem: Dispatch<SetStateAction<FileSystemItem[]>>;
  creationModal: { isOpen: boolean; type: 'file' | 'folder' | 'collection'; parentId: string | null };
  setCreationModal: Dispatch<SetStateAction<{ isOpen: boolean; type: 'file' | 'folder' | 'collection'; parentId: string | null }>>;
  folderSelectModal: { isOpen: boolean; pendingFileId?: string };
  setFolderSelectModal: Dispatch<SetStateAction<{ isOpen: boolean; pendingFileId?: string }>>;
  activeDocId: string | null;
  setActiveDocId: Dispatch<SetStateAction<string | null>>;
  secondaryDocId: string | null;
  setSecondaryDocId: Dispatch<SetStateAction<string | null>>;
  splitDropdownOpen: 'primary' | 'secondary' | null;
  setSplitDropdownOpen: Dispatch<SetStateAction<'primary' | 'secondary' | null>>;
  fullScreenImage: string | null;
  setFullScreenImage: Dispatch<SetStateAction<string | null>>;
  fullScreenPdf: { src: string; title?: string } | null;
  setFullScreenPdf: Dispatch<SetStateAction<{ src: string; title?: string } | null>>;
  handleToggleFolder: (id: string) => void;
  handleMoveFileSystemItem: (sourceId: string, targetFolderId: string) => void;
  handleUploadToFolder: (file: File, folderId: string) => Promise<void>;
  handleInitiateMoveFile: (fileId: string) => void;
  handleFolderSelect: (folderId: string) => void;
  handleCreateFile: (parentId: string | null) => void;
  handleCreateFolder: (parentId: string | null) => void;
  handleCreateCollection: () => void;
  handleConfirmCreation: (name: string) => void;
  handleSaveDoc: (id: string, content: string, name: string) => void;
  handleUploadImage: (file: File) => Promise<void>;
  handleUploadDoc: (file: File) => Promise<void>;
  handleOpenFile: (item: FileSystemItem) => void;
  handleOpenCard: (card: IdeaCard) => void;
  addImageToFileSystem: (items: FileSystemItem[], dataUrl: string, mediaType?: string) => FileSystemItem[];
  findFile: (items: FileSystemItem[], id: string) => FileSystemItem | null;
}

interface UseFileSystemOptions {
  initialFileSystem: FileSystemItem[];
  isDirtyRef: MutableRefObject<boolean>;
  handleAddCard: (x?: number, y?: number, partial?: Partial<IdeaCard>) => void;
  handleUpdateCard: (id: string, updates: Partial<IdeaCard>) => void;
  onCollectionCreate: (name: string) => void;
}

function updateFileSystemItem(
  items: FileSystemItem[],
  targetId: string,
  updater: (item: FileSystemItem) => FileSystemItem
): FileSystemItem[] {
  return items.map(item => {
    if (item.id === targetId) return updater(item);
    if (item.children) return { ...item, children: updateFileSystemItem(item.children, targetId, updater) };
    return item;
  });
}

function removeFileSystemItem(
  items: FileSystemItem[],
  targetId: string
): { removed: FileSystemItem | null; newItems: FileSystemItem[] } {
  let removed: FileSystemItem | null = null;
  const newItems = items
    .filter(item => {
      if (item.id === targetId) { removed = item; return false; }
      return true;
    })
    .map(item => {
      if (item.children) {
        const result = removeFileSystemItem(item.children, targetId);
        if (result.removed) removed = result.removed;
        return { ...item, children: result.newItems };
      }
      return item;
    });
  return { removed, newItems };
}

function insertIntoFileSystem(
  items: FileSystemItem[],
  parentId: string | null,
  newItem: FileSystemItem
): FileSystemItem[] {
  if (parentId === null) return [...items, newItem];
  return items.map(item => {
    if (item.id === parentId && item.type === 'folder') {
      return { ...item, isOpen: true, children: [...(item.children || []), newItem] };
    }
    if (item.children) {
      return { ...item, children: insertIntoFileSystem(item.children, parentId, newItem) };
    }
    return item;
  });
}

function findFileById(items: FileSystemItem[], id: string): FileSystemItem | null {
  for (const item of items) {
    if (item.id === id) return item;
    if (item.children) {
      const found = findFileById(item.children, id);
      if (found) return found;
    }
  }
  return null;
}

function findFileByName(items: FileSystemItem[], name: string): FileSystemItem | null {
  for (const item of items) {
    if (item.name === name && item.type === 'file') return item;
    if (item.children) {
      const found = findFileByName(item.children, name);
      if (found) return found;
    }
  }
  return null;
}

export function useFileSystem({
  initialFileSystem,
  isDirtyRef,
  handleAddCard,
  handleUpdateCard,
  onCollectionCreate,
}: UseFileSystemOptions): UseFileSystemResult {
  const [fileSystem, setFileSystem] = useState<FileSystemItem[]>(initialFileSystem);
  const [creationModal, setCreationModal] = useState<{
    isOpen: boolean;
    type: 'file' | 'folder' | 'collection';
    parentId: string | null;
  }>({ isOpen: false, type: 'file', parentId: null });
  const [folderSelectModal, setFolderSelectModal] = useState<{
    isOpen: boolean;
    pendingFileId?: string;
  }>({ isOpen: false });
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [secondaryDocId, setSecondaryDocId] = useState<string | null>(null);
  const [splitDropdownOpen, setSplitDropdownOpen] = useState<'primary' | 'secondary' | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [fullScreenPdf, setFullScreenPdf] = useState<{ src: string; title?: string } | null>(null);

  const findFile = useCallback((items: FileSystemItem[], id: string) => findFileById(items, id), []);

  const handleToggleFolder = useCallback((id: string) => {
    setFileSystem(prev => updateFileSystemItem(prev, id, item => ({ ...item, isOpen: !item.isOpen })));
  }, []);

  const handleMoveFileSystemItem = useCallback((sourceId: string, targetFolderId: string) => {
    setFileSystem(prev => {
      const result = removeFileSystemItem(prev, sourceId);
      if (!result.removed) return prev;
      return insertIntoFileSystem(result.newItems, targetFolderId, result.removed);
    });
  }, []);

  const handleUploadToFolder = useCallback(async (file: File, folderId: string) => {
    const url = await uploadFileToS3(file);
    if (!url) return;
    const newItem: FileSystemItem = {
      id: generateId(), type: 'file', name: file.name,
      content: url, mediaType: file.type || 'application/octet-stream', createdAt: Date.now(),
    };
    setFileSystem(prev => insertIntoFileSystem(prev, folderId, newItem));
  }, []);

  const handleInitiateMoveFile = useCallback((fileId: string) => {
    setFolderSelectModal({ isOpen: true, pendingFileId: fileId });
  }, []);

  const handleFolderSelect = useCallback((folderId: string) => {
    setFolderSelectModal(prev => {
      if (prev.pendingFileId) handleMoveFileSystemItem(prev.pendingFileId, folderId);
      return { isOpen: false };
    });
  }, [handleMoveFileSystemItem]);

  const handleCreateFile = useCallback((parentId: string | null) => {
    setCreationModal({ isOpen: true, type: 'file', parentId });
  }, []);

  const handleCreateFolder = useCallback((parentId: string | null) => {
    setCreationModal({ isOpen: true, type: 'folder', parentId });
  }, []);

  const handleCreateCollection = useCallback(() => {
    setCreationModal({ isOpen: true, type: 'collection', parentId: null });
  }, []);

  const handleConfirmCreation = useCallback((name: string) => {
    const { type, parentId } = creationModal;

    if (type === 'collection' as any) {
      onCollectionCreate(name);
      return;
    }

    const newItem: FileSystemItem = {
      id: generateId(),
      type: type as 'file' | 'folder',
      name,
      content: type === 'file' ? '' : undefined,
      children: type === 'folder' ? [] : undefined,
      isOpen: type === 'folder' ? true : undefined,
      createdAt: Date.now(),
    };

    setFileSystem(prev => insertIntoFileSystem(prev, parentId, newItem));
    if (type === 'file') setActiveDocId(newItem.id);
  }, [creationModal, onCollectionCreate]);

  const handleSaveDoc = useCallback((id: string, content: string, name: string) => {
    isDirtyRef.current = true;
    if (id.startsWith('card-')) {
      const cardId = id.replace('card-', '');
      handleUpdateCard(cardId, { text: name, content });
      return;
    }
    setFileSystem(prev => updateFileSystemItem(prev, id, item => ({ ...item, content, name })));
  }, [isDirtyRef, handleUpdateCard]);

  const addImageToFileSystem = useCallback((
    items: FileSystemItem[],
    dataUrl: string,
    mediaType: string = 'image/png'
  ): FileSystemItem[] => {
    let newItems = [...items];
    let imagesFolder = newItems.find(i => i.type === 'folder' && i.name.toLowerCase() === 'images');

    if (!imagesFolder) {
      imagesFolder = { id: generateId(), type: 'folder', name: 'Images', children: [], isOpen: true, createdAt: Date.now() };
      newItems.push(imagesFolder);
    }

    let maxNum = 0;
    const scan = (fsItems: FileSystemItem[]) => {
      fsItems.forEach(item => {
        if (item.type === 'file') {
          const m = item.name.match(/^Image (\d+)(\.\w+)?$/i);
          if (m) maxNum = Math.max(maxNum, parseInt(m[1], 10));
        }
        if (item.children) scan(item.children);
      });
    };
    scan(newItems);

    const ext = mediaType === 'image/jpeg' ? '.jpg' : mediaType === 'image/png' ? '.png' : mediaType === 'image/gif' ? '.gif' : '.png';
    const newItem: FileSystemItem = {
      id: generateId(), type: 'file', name: `Image ${maxNum + 1}${ext}`,
      content: dataUrl, mediaType, createdAt: Date.now(),
    };

    return newItems.map(item =>
      item.id === imagesFolder!.id
        ? { ...item, isOpen: true, children: [...(item.children || []), newItem] }
        : item
    );
  }, []);

  const handleUploadImage = useCallback(async (file: File) => {
    const publicUrl = await uploadFileToS3(file);
    if (!publicUrl) return;
    handleAddCard(window.innerWidth / 2, window.innerHeight / 2, {
      image: publicUrl, height: 200, style: { ...DEFAULT_CARD_STYLE },
    });
    setFileSystem(prev => addImageToFileSystem(prev, publicUrl, file.type));
  }, [handleAddCard, addImageToFileSystem]);

  const handleUploadDoc = useCallback(async (file: File) => {
    const publicUrl = await uploadFileToS3(file);
    if (!publicUrl) return;
    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
    handleAddCard(window.innerWidth / 2, window.innerHeight / 2, {
      fileName: file.name,
      text: isPdf ? '' : `Document: ${file.name}`,
      image: isPdf ? publicUrl : undefined,
      width: isPdf ? 400 : undefined,
      height: isPdf ? 500 : undefined,
      color: '#f3f4f6',
    });
    setFileSystem(prev => [...prev, {
      id: generateId(), type: 'file', name: file.name,
      content: publicUrl, mediaType: file.type || 'application/octet-stream', createdAt: Date.now(),
    }]);
  }, [handleAddCard]);

  const handleOpenFile = useCallback((item: FileSystemItem) => {
    if (item.content?.startsWith('data:')) {
      const type = item.mediaType || '';
      if (type.includes('pdf') || item.name.toLowerCase().endsWith('.pdf')) {
        setFullScreenPdf({ src: item.content, title: item.name });
        return;
      } else if (type.includes('image/')) {
        setFullScreenImage(item.content);
        return;
      }
      const link = document.createElement('a');
      link.href = item.content;
      link.download = item.name;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      return;
    }
    setActiveDocId(item.id);
  }, []);

  const handleOpenCard = useCallback((card: IdeaCard) => {
    if (card.image) {
      if (card.image.startsWith('data:application/pdf') || card.fileName?.toLowerCase().endsWith('.pdf')) {
        setFullScreenPdf({ src: card.image, title: card.fileName });
      } else {
        setFullScreenImage(card.image);
      }
      return;
    }
    if (card.fileName) {
      const fileItem = findFileByName(fileSystem, card.fileName);
      if (fileItem) handleOpenFile(fileItem);
      return;
    }
    setActiveDocId(`card-${card.id}`);
  }, [fileSystem, handleOpenFile]);

  return {
    fileSystem, setFileSystem,
    creationModal, setCreationModal,
    folderSelectModal, setFolderSelectModal,
    activeDocId, setActiveDocId,
    secondaryDocId, setSecondaryDocId,
    splitDropdownOpen, setSplitDropdownOpen,
    fullScreenImage, setFullScreenImage,
    fullScreenPdf, setFullScreenPdf,
    handleToggleFolder,
    handleMoveFileSystemItem,
    handleUploadToFolder,
    handleInitiateMoveFile,
    handleFolderSelect,
    handleCreateFile,
    handleCreateFolder,
    handleCreateCollection,
    handleConfirmCreation,
    handleSaveDoc,
    handleUploadImage,
    handleUploadDoc,
    handleOpenFile,
    handleOpenCard,
    addImageToFileSystem,
    findFile,
  };
}
