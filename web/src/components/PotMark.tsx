/// The cachepot itself: a planter concealing what grows in it — an asterisk,
/// the same ****** mask every sealed balance wears in the app.
export function PotMark({ className = "size-6" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M16 4.4V16" />
      <path d="M12.9 6.2l6.2 3.6" />
      <path d="M19.1 6.2l-6.2 3.6" />
      <rect x="6.8" y="16" width="18.4" height="3.2" rx="1.6" />
      <path d="M9.2 19.2h13.6l-1.6 7.1a2.3 2.3 0 0 1-2.3 1.8h-5.8a2.3 2.3 0 0 1-2.3-1.8Z" />
    </svg>
  );
}
