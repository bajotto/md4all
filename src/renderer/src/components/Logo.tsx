interface Props {
  size?: number
  className?: string
}

export default function Logo({ size = 48, className }: Props): JSX.Element {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="md4all"
    >
      <rect width="48" height="48" rx="11" fill="var(--accent)" />
      {/* M mark — two peaks, clean geometric */}
      <path
        d="M9 35 L9 14 L24 27 L39 14 L39 35"
        stroke="white"
        strokeWidth="3.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}
