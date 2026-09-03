import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode';

interface EwayBillQrCodeProps {
  qrPayload: string;
  size?: number;
  level?: 'L' | 'M' | 'Q' | 'H';
  className?: string;
  showCaption?: boolean;
}

export const EwayBillQrCode: React.FC<EwayBillQrCodeProps> = ({
  qrPayload,
  size = 140,
  level = 'M',
  className = '',
  showCaption = true,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!qrPayload || qrPayload.trim() === '') {
      setError('No QR payload available');
      return;
    }

    setError(null);
    if (canvasRef.current) {
      QRCode.toCanvas(
        canvasRef.current,
        qrPayload,
        {
          width: size,
          margin: 2,
          errorCorrectionLevel: level,
          color: {
            dark: '#000000',
            light: '#FFFFFF',
          },
        },
        (err) => {
          if (err) {
            console.error('Failed to generate official EWB QR Code:', err);
            setError('QR Generation Failed');
          }
        }
      );
    }
  }, [qrPayload, size, level]);

  if (error || !qrPayload) {
    return (
      <div
        className={`flex flex-col items-center justify-center p-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-center ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-tight">
          {error || 'No QR Code'}
        </span>
      </div>
    );
  }

  return (
    <div className={`inline-flex flex-col items-center justify-center bg-white p-1.5 border border-slate-300 rounded shadow-xs ${className}`}>
      <canvas ref={canvasRef} className="block" />
      {showCaption && (
        <span className="text-[8px] font-extrabold text-slate-700 tracking-wider uppercase mt-1">
          Scan to Verify GST EWB
        </span>
      )}
    </div>
  );
};
