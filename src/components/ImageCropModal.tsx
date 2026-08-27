import React, { useState, useRef, useEffect } from 'react';
import { Modal } from './Modal';
import { ZoomIn, ZoomOut, RotateCcw, Check, X, Image as ImageIcon, AlertCircle } from 'lucide-react';

interface ImageCropModalProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string | null;
  onCropComplete: (croppedDataUrl: string) => void;
}

export const ImageCropModal: React.FC<ImageCropModalProps> = ({
  isOpen,
  onClose,
  imageSrc,
  onCropComplete,
}) => {
  const [zoom, setZoom] = useState(1);
  const [offsetX, setOffsetX] = useState(0);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isSaving, setIsSaving] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Reset positioning when new image is loaded
  useEffect(() => {
    setZoom(1);
    setOffsetX(0);
    setOffsetY(0);
  }, [imageSrc]);

  if (!imageSrc) return null;

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX - offsetX, y: e.clientY - offsetY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setOffsetX(e.clientX - dragStart.x);
    setOffsetY(e.clientY - dragStart.y);
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleSaveCrop = () => {
    if (!imageSrc) return;
    setIsSaving(true);
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const viewportSize = 256;
        const outputSize = 300;
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          setIsSaving(false);
          return;
        }

        // Fill background so there are zero transparent/broken pixels
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, outputSize, outputSize);

        // Convert viewport 256px dimensions, offsets, and zoom to 300px canvas units
        const viewToCanvasScale = outputSize / viewportSize;
        const imageRatio = img.width / img.height;
        let baseWidth = viewportSize;
        let baseHeight = viewportSize;

        if (imageRatio > 1) {
          baseHeight = viewportSize / imageRatio;
        } else {
          baseWidth = viewportSize * imageRatio;
        }

        const drawWidth = baseWidth * zoom * viewToCanvasScale;
        const drawHeight = baseHeight * zoom * viewToCanvasScale;
        const drawX = (outputSize - drawWidth) / 2 + (offsetX * viewToCanvasScale);
        const drawY = (outputSize - drawHeight) / 2 + (offsetY * viewToCanvasScale);

        ctx.drawImage(img, drawX, drawY, drawWidth, drawHeight);

        const croppedUrl = canvas.toDataURL('image/jpeg', 0.92);
        setIsSaving(false);
        onCropComplete(croppedUrl);
        onClose();
      } catch (err) {
        console.error('Error generating cropped avatar image:', err);
        setIsSaving(false);
      }
    };

    img.onerror = () => {
      console.error('Error loading image for profile crop');
      setIsSaving(false);
    };

    img.src = imageSrc;
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="✂ Crop & Position Profile Avatar" maxWidth="md">
      <div className="space-y-5 text-xs">
        <p className="text-slate-500 dark:text-slate-400">
          Drag to position your photo and use the zoom slider to adjust the circular avatar crop.
        </p>

        {/* CROP CONTAINER VIEWPORT */}
        <div
          className="relative w-64 h-64 mx-auto bg-slate-950 rounded-full overflow-hidden shadow-2xl border-4 border-blue-600 cursor-move flex items-center justify-center select-none"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
        >
          <img
            ref={imgRef}
            src={imageSrc}
            alt="Crop Preview"
            style={{
              transform: `translate(${offsetX}px, ${offsetY}px) scale(${zoom})`,
              transition: isDragging ? 'none' : 'transform 0.1s ease-out',
              maxHeight: '100%',
              maxWidth: '100%',
              objectFit: 'contain',
              pointerEvents: 'none',
            }}
          />

          {/* CIRCLE GUIDELINE OVERLAY */}
          <div className="absolute inset-0 rounded-full border-2 border-white/60 pointer-events-none shadow-[0_0_0_9999px_rgba(15,23,42,0.65)]" />
        </div>

        {/* ZOOM & RESET CONTROLS */}
        <div className="bg-slate-50 dark:bg-slate-950 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between font-bold text-slate-700 dark:text-slate-300">
            <span className="flex items-center gap-1.5">
              <ZoomIn className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              <span>Zoom Scale</span>
            </span>
            <span>{Math.round(zoom * 100)}%</span>
          </div>

          <div className="flex items-center gap-3">
            <ZoomOut className="w-4 h-4 text-slate-400" />
            <input
              type="range"
              min="1"
              max="3"
              step="0.05"
              value={zoom}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full accent-blue-600 cursor-pointer"
            />
            <ZoomIn className="w-4 h-4 text-slate-400" />
          </div>

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setOffsetX(0);
                setOffsetY(0);
              }}
              className="text-[11px] font-bold text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Position</span>
            </button>
          </div>
        </div>

        {/* BUTTON BAR */}
        <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSaveCrop}
            disabled={isSaving}
            className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl shadow-md shadow-blue-600/30 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <>
                <Check className="w-4 h-4" />
                <span>Save Profile Photo</span>
              </>
            )}
          </button>
        </div>
      </div>
    </Modal>
  );
};
