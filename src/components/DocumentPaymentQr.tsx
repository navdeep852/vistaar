import React, { createContext, useContext, useEffect, useState } from 'react';

export interface DocumentPaymentQrProps {
  upiQrCodeUrl?: string | null;
  upiId?: string | null;
  showQrCode?: boolean;
  showUpiId?: boolean;
  className?: string;
  size?: number | string;
}

interface PaymentQrContextType {
  hasRendered: boolean;
  markRendered: () => void;
}

const PaymentQrContext = createContext<PaymentQrContextType | null>(null);

export const PaymentQrProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [hasRendered, setHasRendered] = useState(false);
  return (
    <PaymentQrContext.Provider value={{ hasRendered, markRendered: () => setHasRendered(true) }}>
      {children}
    </PaymentQrContext.Provider>
  );
};

export const usePaymentQrContext = () => useContext(PaymentQrContext);

/**
 * Reusable Document Payment QR Code Component.
 * Used uniformly across all Invoice and Quotation template layouts.
 * 
 * Rules:
 * - Completely hidden when showQrCode is false or upiQrCodeUrl is missing.
 * - Fixed square container with object-fit: contain to avoid image distortion.
 * - High contrast, surrounded by whitespace, printable and visible in PDF output.
 * - Clearly associated with payment ("SCAN TO PAY").
 * - Optionally displays UPI ID below the QR when enabled.
 */
export const DocumentPaymentQr: React.FC<DocumentPaymentQrProps> = ({
  upiQrCodeUrl,
  upiId,
  showQrCode = true,
  showUpiId = true,
  className = '',
  size = 96,
}) => {
  const ctx = usePaymentQrContext();

  const isVisible = Boolean(showQrCode && upiQrCodeUrl);

  useEffect(() => {
    if (isVisible && ctx) {
      ctx.markRendered();
    }
  }, [isVisible, ctx]);

  if (!isVisible || !upiQrCodeUrl) {
    return null;
  }

  const dimension = typeof size === 'number' ? `${size}px` : size;

  return (
    <div
      className={`payment-qr-container inline-flex flex-col items-center justify-center p-2.5 bg-white border border-slate-200 rounded-lg text-center break-inside-avoid print:bg-white print:border-slate-300 ${className}`}
      style={{ minWidth: '100px' }}
      data-testid="document-payment-qr"
    >
      <span className="text-[9px] font-black uppercase tracking-wider text-slate-700 mb-1.5 print:text-black">
        SCAN TO PAY
      </span>
      <div
        className="flex items-center justify-center bg-white overflow-hidden p-1 border border-slate-100 rounded"
        style={{ width: dimension, height: dimension }}
      >
        <img
          src={upiQrCodeUrl}
          alt="Scan to Pay UPI QR"
          className="w-full h-full object-contain"
          style={{ objectFit: 'contain' }}
          loading="eager"
        />
      </div>
      {showUpiId && upiId && (
        <span className="text-[10px] font-bold text-slate-800 mt-1.5 font-mono break-all max-w-[130px] leading-tight print:text-black">
          UPI: {upiId}
        </span>
      )}
    </div>
  );
};

/**
 * Engine-level Fallback QR Renderer.
 * Ensures that even if a custom layout does not have a dedicated bank section,
 * the payment QR code is reliably displayed whenever showQrCode is enabled.
 */
export const EnginePaymentQrSlot: React.FC<{
  upiQrCodeUrl?: string | null;
  upiId?: string | null;
  showQrCode?: boolean;
  showUpiId?: boolean;
  className?: string;
}> = ({ upiQrCodeUrl, upiId, showQrCode, showUpiId, className = '' }) => {
  const ctx = usePaymentQrContext();

  // If a child layout already rendered the QR, or if QR is disabled / missing, render nothing.
  if (ctx?.hasRendered || !showQrCode || !upiQrCodeUrl) {
    return null;
  }

  return (
    <div className={`engine-qr-fallback-slot mt-4 pt-3 border-t border-slate-200 flex justify-end break-inside-avoid print:mt-2 print:pt-2 ${className}`}>
      <DocumentPaymentQr
        upiQrCodeUrl={upiQrCodeUrl}
        upiId={upiId}
        showQrCode={showQrCode}
        showUpiId={showUpiId}
      />
    </div>
  );
};
