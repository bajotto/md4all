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
      <path
        d="M7.5,37.5 L7.5,10.5 L24,24 L40.5,10.5 L40.5,37.5 L36.8,37.5 L36.8,14.3 L24,27.8 L11.2,14.3 L11.2,37.5 Z"
        fill="white"
      />
    </svg>
  )
}
