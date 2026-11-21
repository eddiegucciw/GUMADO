import { useState } from 'react';

/**
 * Photography slot. Until the real image exists at `src`, it shows a warm
 * topographic "contour map" backdrop so the layout still looks intentional.
 * See public/images/README.md for the expected files and sizes.
 */
export function CinematicImage({ src, alt, className = '', priority = false, kenBurns = false }: {
  src: string; alt: string; className?: string; priority?: boolean; kenBurns?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <div className={`overflow-hidden bg-charcoal-2 ${className}`}>
      {!failed ? (
        <img src={src} alt={alt} loading={priority ? 'eager' : 'lazy'} decoding="async" fetchPriority={priority ? 'high' : 'auto'}
          onError={() => setFailed(true)} className={`h-full w-full object-cover ${kenBurns ? 'animate-kenburns' : ''}`} />
      ) : (
        <ContourBackdrop label={alt} />
      )}
    </div>
  );
}

export function ContourBackdrop({ label }: { label?: string }) {
  return (
    <svg role={label ? 'img' : undefined} aria-label={label || undefined} aria-hidden={label ? undefined : true}
      className="h-full w-full" viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">
      <defs>
        <radialGradient id="cb-g" cx="70%" cy="30%" r="80%">
          <stop offset="0" stopColor="#4a4135" />
          <stop offset="0.55" stopColor="#2a2723" />
          <stop offset="1" stopColor="#1c1a17" />
        </radialGradient>
      </defs>
      <rect width="800" height="600" fill="url(#cb-g)" />
      <g fill="none" stroke="#c8a96a" strokeOpacity="0.16" strokeWidth="1">
        {Array.from({ length: 14 }, (_, i) => {
          const r = 40 + i * 34;
          return <path key={i} d={`M ${560 - r} 210 C ${560 - r} ${210 - r * 0.8}, ${560 + r * 1.1} ${210 - r * 0.7}, ${560 + r} 230 S ${560 - r * 0.3} ${210 + r * 0.95}, ${560 - r} 210 Z`} />;
        })}
        {Array.from({ length: 9 }, (_, i) => {
          const r = 30 + i * 30;
          return <path key={`b${i}`} d={`M ${170 - r} 470 C ${170 - r} ${470 - r * 0.6}, ${170 + r} ${470 - r * 0.9}, ${170 + r * 1.2} 480 S ${170} ${470 + r * 0.7}, ${170 - r} 470 Z`} />;
        })}
      </g>
      <g stroke="#e9dcc3" strokeOpacity="0.06">
        {Array.from({ length: 9 }, (_, i) => <line key={i} x1={i * 100} y1="0" x2={i * 100} y2="600" />)}
        {Array.from({ length: 7 }, (_, i) => <line key={i} x1="0" y1={i * 100} x2="800" y2={i * 100} />)}
      </g>
    </svg>
  );
}
