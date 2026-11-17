import React, { useState } from 'react';

export type BrandLogoVariant = 'icon' | 'header' | 'drawer' | 'auth' | 'splash' | 'compact';
export type BrandLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | '2xl' | 'splash';

interface BrandLogoProps {
  variant?: BrandLogoVariant;
  size?: BrandLogoSize;
  className?: string;
  showTagline?: boolean;
  taglineText?: string;
  onClick?: () => void;
  priority?: boolean;
}

const SIZE_MAP: Record<BrandLogoSize, { img: string; text: string; subtext: string }> = {
  xs: { img: 'w-5 h-5', text: 'text-xs', subtext: 'text-[7px]' },
  sm: { img: 'w-6 h-6 sm:w-7 sm:h-7', text: 'text-sm sm:text-base', subtext: 'text-[8px]' },
  md: { img: 'w-8 h-8 sm:w-9 sm:h-9', text: 'text-base sm:text-lg', subtext: 'text-[9px]' },
  lg: { img: 'w-11 h-11 sm:w-12 sm:h-12', text: 'text-lg sm:text-xl', subtext: 'text-[10px]' },
  xl: { img: 'w-16 h-16 sm:w-20 sm:h-20', text: 'text-xl sm:text-2xl', subtext: 'text-xs' },
  '2xl': { img: 'w-24 h-24 sm:w-28 sm:h-28', text: 'text-2xl sm:text-3xl', subtext: 'text-sm' },
  splash: { img: 'w-20 h-20 sm:w-24 sm:h-24', text: 'text-2xl sm:text-3xl', subtext: 'text-xs' },
};

export const BrandLogo: React.FC<BrandLogoProps> = ({
  variant = 'icon',
  size = 'md',
  className = '',
  showTagline = true,
  taglineText = 'Run Better. Grow Wider.',
  onClick,
  priority = false,
}) => {
  const [imageError, setImageError] = useState(false);
  const sizeConfig = SIZE_MAP[size];

  // Official VISTAAR Brand Emblem Image
  const logoSrc = '/vistaar-logo.png';

  // Fallback Vector Logo if asset fails to load
  const renderFallbackIcon = () => (
    <svg
      viewBox="0 0 100 100"
      className={`${sizeConfig.img} object-contain`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M50 10L85 30V70L50 90L15 70V30L50 10Z"
        fill="#1D4ED8"
        stroke="#2563EB"
        strokeWidth="4"
      />
      <path
        d="M50 30L70 45V65L50 80L30 65V45L50 30Z"
        fill="#1E40AF"
        stroke="#60A5FA"
        strokeWidth="3"
      />
      <polygon points="50,42 62,52 50,62 38,52" fill="#E2E8F0" stroke="#FFFFFF" strokeWidth="2" />
    </svg>
  );

  const renderIconOnly = (customImgClass?: string) => (
    <div className={`relative shrink-0 flex items-center justify-center select-none ${className}`}>
      {!imageError ? (
        <img
          src={logoSrc}
          alt="VISTAAR"
          loading={priority ? 'eager' : 'lazy'}
          onError={() => setImageError(true)}
          className={`${customImgClass || sizeConfig.img} object-contain drop-shadow-sm select-none pointer-events-none transition-transform duration-200`}
          style={{ aspectRatio: '1/1' }}
        />
      ) : (
        renderFallbackIcon()
      )}
    </div>
  );

  // 1. Splash Variant (App initialization / Loading)
  if (variant === 'splash') {
    return (
      <div className={`flex flex-col items-center justify-center text-center select-none ${className}`}>
        <div className="relative flex items-center justify-center mb-4">
          <div className="absolute inset-0 bg-blue-500/20 dark:bg-blue-600/30 rounded-full blur-2xl transform scale-125 animate-pulse" />
          <img
            src={logoSrc}
            alt="VISTAAR"
            loading="eager"
            onError={() => setImageError(true)}
            className="w-20 h-20 sm:w-24 sm:h-24 object-contain drop-shadow-xl relative z-10 animate-fade-in"
            style={{ aspectRatio: '1/1' }}
          />
        </div>
        <div className="flex flex-col items-center">
          <span className="text-2xl sm:text-3xl font-black tracking-widest text-slate-900 dark:text-white uppercase leading-none font-sans drop-shadow-xs">
            VISTAAR
          </span>
          {showTagline && (
            <span className="text-xs font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase mt-1.5">
              {taglineText}
            </span>
          )}
        </div>
      </div>
    );
  }

  // 2. Auth Variant (Login & Signup Header)
  if (variant === 'auth') {
    return (
      <div
        onClick={onClick}
        className={`flex flex-col items-center justify-center text-center select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      >
        <div className="relative mb-3 flex items-center justify-center">
          <div className="absolute inset-0 bg-blue-500/15 dark:bg-blue-600/20 rounded-full blur-xl transform scale-110" />
          <img
            src={logoSrc}
            alt="VISTAAR"
            loading="eager"
            onError={() => setImageError(true)}
            className="w-14 h-14 sm:w-16 sm:h-16 object-contain drop-shadow-lg relative z-10 transition-transform duration-300 hover:scale-105"
            style={{ aspectRatio: '1/1' }}
          />
        </div>
        <span className="text-xl sm:text-2xl font-black tracking-widest text-slate-900 dark:text-white uppercase leading-none font-sans">
          VISTAAR
        </span>
        {showTagline && (
          <span className="text-xs sm:text-sm font-bold text-blue-600 dark:text-blue-400 tracking-wide mt-1">
            {taglineText}
          </span>
        )}
      </div>
    );
  }

  // 3. Header Variant (Mobile & Desktop App Header)
  if (variant === 'header') {
    return (
      <div
        onClick={onClick}
        className={`flex items-center gap-2 sm:gap-2.5 min-w-0 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      >
        {renderIconOnly('h-7 w-7 sm:h-8 sm:w-8')}
        <div className="flex flex-col justify-center min-w-0">
          <span className="text-sm sm:text-base font-black tracking-widest text-slate-900 dark:text-white uppercase leading-none font-sans">
            VISTAAR
          </span>
          {showTagline && (
            <span className="text-[8px] font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase leading-tight mt-0.5 hidden xs:block">
              {taglineText}
            </span>
          )}
        </div>
      </div>
    );
  }

  // 4. Drawer Variant (Mobile Navigation Menu Header)
  if (variant === 'drawer') {
    return (
      <div
        onClick={onClick}
        className={`flex items-center gap-2.5 p-3 px-4 bg-slate-50 dark:bg-slate-950/80 border-b border-slate-200 dark:border-slate-800 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      >
        {renderIconOnly('h-9 w-9')}
        <div className="flex flex-col justify-center min-w-0">
          <span className="text-base font-black tracking-widest text-slate-900 dark:text-white uppercase leading-none font-sans">
            VISTAAR
          </span>
          <span className="text-[9px] font-bold text-blue-600 dark:text-blue-400 tracking-wider uppercase leading-tight mt-1">
            The Business OS
          </span>
        </div>
      </div>
    );
  }

  // 5. Compact Variant (Single icon with small brand label)
  if (variant === 'compact') {
    return (
      <div
        onClick={onClick}
        className={`inline-flex items-center gap-1.5 select-none ${onClick ? 'cursor-pointer' : ''} ${className}`}
      >
        {renderIconOnly('h-6 w-6')}
        <span className="font-extrabold text-xs tracking-wider text-slate-900 dark:text-slate-100 uppercase">
          VISTAAR
        </span>
      </div>
    );
  }

  // Default: Icon Only
  return renderIconOnly();
};
