// The Clinix mark - same drawing as public/favicon.svg. Decorative by
// default; pass a title when it stands alone without the word "Clinix".
export default function ClinixLogo({ size = 32, title, className }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      className={className}
      role={title ? 'img' : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : 'true'}
    >
      <rect width="64" height="64" rx="14" fill="#2563eb" />
      <path
        d="M44.6 21.4A16.5 16.5 0 1 0 44.6 42.6"
        fill="none"
        stroke="#fff"
        strokeWidth="7"
        strokeLinecap="round"
      />
      <path
        d="M32 25.5v13M25.5 32h13"
        fill="none"
        stroke="#fff"
        strokeWidth="5"
        strokeLinecap="round"
      />
    </svg>
  )
}
