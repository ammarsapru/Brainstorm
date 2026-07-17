import React, { useState } from 'react';

interface ImageCardBodyProps {
  url: string;
  fileName?: string;
  onImageClick?: (url: string) => void;
}

export const ImageCardBody: React.FC<ImageCardBodyProps> = ({ url, fileName, onImageClick }) => {
  const [imgError, setImgError] = useState(false);

  return (
    <div
      data-testid="image-card-body"
      className="flex-1 min-h-[120px] w-full overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity"
      title="Double-click to open image"
      onPointerDown={(e) => e.stopPropagation()}
      onDoubleClick={(e) => {
        e.stopPropagation();
        if (!imgError) onImageClick?.(url);
      }}
    >
      {imgError ? (
        <div className="w-full h-full min-h-[120px] flex items-center justify-center text-gray-400 text-xs">
          Image unavailable
        </div>
      ) : (
        <img
          src={url}
          alt={fileName || 'Image'}
          className="w-full h-full object-cover pointer-events-none"
          onError={() => setImgError(true)}
        />
      )}
    </div>
  );
};
