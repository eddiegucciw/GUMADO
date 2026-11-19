export function LogoMark({ className = 'h-8 w-8', light }: { className?: string; light?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden focusable="false">
      {/* Without `light`, colours follow the app theme (dark square in light mode, light square in dark mode). */}
      <rect width="32" height="32" rx="8" fill={light ? '#FAF7F0' : 'var(--ink, #1C1A17)'} />
      <path d="M8 9h7v7H8zM17 9h7v7h-7zM8 18h7v7H8z" fill={light ? '#1C1A17' : 'var(--bg, #FAF7F0)'} fillOpacity=".35" />
      <path d="M17 18h7v7h-7z" fill="#C8A96A" />
    </svg>
  );
}

export function Wordmark({ className = '' }: { className?: string }) {
  return <span className={`font-serif text-[1.35rem] font-semibold tracking-[0.18em] ${className}`}>GUMADO</span>;
}
