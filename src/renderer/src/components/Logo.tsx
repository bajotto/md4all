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
      <path d="M14.7,12.8 L22.2,22.2 L23.6,24 L22.2,25.8 L14.7,35.2 L10.4,31.6 L17.9,22.2 L16.5,24 L17.9,25.8 L10.4,16.4 Z" fill="white"/>
      <path d="M28.8,12.8 L36.3,22.2 L37.7,24 L36.3,25.8 L28.8,35.2 L24.5,31.6 L32,22.2 L30.6,24 L32,25.8 L24.5,16.4 Z" fill="white"/>
    </svg>
  )
}
