type LogoProps = {
  size?: number;
  className?: string;
};

/** Sello hanko rojo con una casita de tejado tradicional y una ventana iluminada. Original. */
export function Logo({ size = 120, className }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 120 120"
      role="img"
      aria-label="Ibasho"
      className={className}
    >
      <circle cx="60" cy="60" r="56" fill="var(--hanko)" />
      <circle cx="60" cy="60" r="50" fill="none" stroke="#fff3e0" strokeWidth="1.5" opacity="0.7" />
      {/* tejado */}
      <path d="M22 62 Q60 28 98 62 L90 64 Q60 40 30 64 Z" fill="#fff3e0" />
      <path d="M60 36 L60 30" stroke="#fff3e0" strokeWidth="3" strokeLinecap="round" />
      {/* paredes */}
      <rect x="34" y="62" width="52" height="30" rx="3" fill="#fff3e0" />
      {/* puerta y ventana iluminada */}
      <rect x="68" y="72" width="10" height="20" rx="2" fill="var(--hanko)" opacity="0.85" />
      <rect x="42" y="70" width="16" height="14" rx="2" fill="#ffd36e" />
      <path d="M50 70 V84 M42 77 H58" stroke="var(--hanko)" strokeWidth="1.5" />
      {/* rama de sakura */}
      <circle cx="92" cy="40" r="3.2" fill="#f2b8c6" />
      <circle cx="98" cy="46" r="2.6" fill="#f2b8c6" />
      <circle cx="87" cy="47" r="2.2" fill="#f2b8c6" />
    </svg>
  );
}
