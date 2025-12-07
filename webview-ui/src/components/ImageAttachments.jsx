// @ts-nocheck
import React from "react";
import { X, Image as ImageIcon } from "lucide-react";

/**
 * ImageAttachments - displays attached image thumbnails with remove buttons
 * @param {Object[]} images - Array of { id, base64, mimeType, name }
 * @param {Function} onRemove - Called with image id when remove clicked
 * @param {Function} onPreview - Called with image data when thumbnail clicked
 */
function ImageAttachments({ images = [], onRemove, onPreview }) {
  if (images.length === 0) return null;

  return (
    <div className="flex gap-2 flex-wrap">
      {images.map((img) => (
        <div
          key={img.id}
          className="relative group w-14 h-14 rounded-lg overflow-hidden border border-white/10 bg-white/5 shadow-sm"
        >
          {/* Thumbnail */}
          <img
            src={`data:${img.mimeType};base64,${img.base64}`}
            alt={img.name || "Attached image"}
            className="w-full h-full object-cover cursor-pointer hover:opacity-80 transition-opacity"
            onClick={() => onPreview?.(img)}
          />

          {/* Remove button */}
          <button
            onClick={(e) => {
              e.stopPropagation();
              onRemove?.(img.id);
            }}
            className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full bg-black/70 text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
            title="Remove image"
          >
            <X size={10} />
          </button>
        </div>
      ))}

      {/* Counter */}
      <div className="flex items-center text-[10px] text-white/40">
        {images.length}/4
      </div>
    </div>
  );
}

export default ImageAttachments;
