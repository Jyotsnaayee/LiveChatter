export function OrbIcon({ className = 'h-4 w-4' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="fbOrbGrad" cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor="#E0E7FF" />
          <stop offset="45%" stopColor="#818CF8" />
          <stop offset="85%" stopColor="#4F46E5" />
          <stop offset="100%" stopColor="#312E81" />
        </radialGradient>
        <linearGradient id="fbRingGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="55%" stopColor="#A5B4FC" />
          <stop offset="100%" stopColor="#38BDF8" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="7.5" fill="url(#fbOrbGrad)" />
      <ellipse
        cx="12"
        cy="12"
        rx="10.5"
        ry="4.2"
        transform="rotate(-24 12 12)"
        stroke="url(#fbRingGrad)"
        strokeWidth="1.6"
      />
      <circle cx="9.6" cy="9.4" r="2" fill="#FFFFFF" fillOpacity="0.65" />
    </svg>
  );
}
