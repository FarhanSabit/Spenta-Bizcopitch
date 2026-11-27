import React, { useState } from 'react';
import { SPENTA_LOGO_DARK_URL, SPENTA_LOGO_URL } from '../data/spentaManifest';

export type SpentaLogoSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

const SIZE_HEIGHT_CLASS: Record<SpentaLogoSize, string> = {
  xs: 'h-5',
  sm: 'h-6',
  md: 'h-7',
  lg: 'h-9',
  xl: 'h-11',
};

interface SpentaLogoProps {
  className?: string;
  size?: SpentaLogoSize;
  tone?: 'dark-bg' | 'light-bg';
  variant?: 'lockup' | 'mark';
  showTagline?: boolean;
}

export function SpentaLogo({
  className,
  size = 'md',
  tone = 'dark-bg',
  variant = 'lockup',
  showTagline = false,
}: SpentaLogoProps) {
  const [imgFailed, setImgFailed] = useState(false);

  const heightClass = className ? className : SIZE_HEIGHT_CLASS[size];
  const src =
    variant === 'mark'
      ? '/icon.svg'
      : tone === 'dark-bg'
        ? SPENTA_LOGO_DARK_URL
        : SPENTA_LOGO_URL;

  const logoElement = imgFailed ? (
    <span
      className={`inline-flex items-center font-extrabold tracking-tight text-base ${heightClass} ${
        tone === 'dark-bg' ? 'text-white' : 'text-[#0E3924]'
      }`}
    >
      spenta
    </span>
  ) : (
    <img
      src={src}
      alt="Spenta Technology"
      decoding="async"
      onError={() => setImgFailed(true)}
      className={`${heightClass} w-auto object-contain select-none shrink-0`}
    />
  );

  if (!showTagline) {
    return logoElement;
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      {logoElement}
      <span
        className={`text-[10px] font-mono tracking-wide ${
          tone === 'dark-bg' ? 'text-[#8E96B0]' : 'text-[#5F6576]'
        }`}
      >
        Sovereign AI · ERP · Fintech · Voice · Spatial XR
      </span>
    </span>
  );
}
