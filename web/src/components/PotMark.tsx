/// The cachepot itself: a lidded vessel whose contents are hatched out.
export function PotMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={className} aria-hidden="true">
      <defs>
        <pattern id="pot-hatch" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(-45)">
          <line x1="0" y1="0" x2="0" y2="4" stroke="currentColor" strokeWidth="1.1" opacity="0.45" />
        </pattern>
      </defs>
      <path d="M7 13.5h18l-2.4 13.6a2.3 2.3 0 0 1-2.3 1.9h-8.6a2.3 2.3 0 0 1-2.3-1.9Z" fill="url(#pot-hatch)" />
      <path
        d="M7 13.5h18l-2.4 13.6a2.3 2.3 0 0 1-2.3 1.9h-8.6a2.3 2.3 0 0 1-2.3-1.9Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
      <rect x="4.6" y="8.2" width="22.8" height="5.3" rx="1.4" stroke="currentColor" strokeWidth="1.8" />
      <circle cx="16" cy="10.9" r="1.7" className="fill-seal" />
    </svg>
  );
}
