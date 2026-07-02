// 統一 SVG icon set（取代 emoji）：stroke 風格，跟 currentColor
import type { ReactNode, SVGProps } from 'react'

type P = SVGProps<SVGSVGElement> & { size?: number }

function base({ size = 20, ...props }: P, children: ReactNode, filled = false) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  )
}

export function BusIcon(p: P) {
  return base(
    p,
    <>
      <path d="M4 6a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1Z" />
      <path d="M4 11h16" />
      <circle cx="8" cy="17" r="1.6" />
      <circle cx="16" cy="17" r="1.6" />
      <path d="M8 4v7M16 4v7" opacity="0.4" />
    </>,
  )
}

export function GpsIcon(p: P) {
  return base(
    p,
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
    </>,
  )
}

export function SwapIcon(p: P) {
  return base(
    p,
    <>
      <path d="M7 4v13M7 17l-3-3M7 17l3-3" />
      <path d="M17 20V7M17 7l-3 3M17 7l3 3" />
    </>,
  )
}

export function StarIcon({ filled, ...p }: P & { filled?: boolean }) {
  return base(
    p,
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9Z" />,
    filled,
  )
}

export function XIcon(p: P) {
  return base(p, <path d="M6 6l12 12M18 6L6 18" />)
}

export function SearchIcon(p: P) {
  return base(
    p,
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </>,
  )
}

export function BackIcon(p: P) {
  return base(p, <path d="M15 5l-7 7 7 7" />)
}

/* 點對點：兩點連線 */
export function JourneyIcon(p: P) {
  return base(
    p,
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8 8c3 3 5 3 8 8" strokeDasharray="0.1 4" />
    </>,
  )
}

export function SunIcon(p: P) {
  return base(
    p,
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </>,
  )
}

export function MoonIcon(p: P) {
  return base(p, <path d="M20 13.5A8 8 0 1 1 10.5 4 6.5 6.5 0 0 0 20 13.5Z" />)
}

export function PlaneIcon(p: P) {
  return base(
    p,
    <>
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </>,
  )
}

export function LinkIcon(p: P) {
  return base(
    p,
    <>
      <path d="M14 5h5v5" />
      <path d="M19 5l-9 9" />
      <path d="M19 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h4" />
    </>,
  )
}

/* 巴士站牌（empty state 用） */
export function StopIcon(p: P) {
  return base(
    p,
    <>
      <path d="M9 21V4" />
      <rect x="6" y="3" width="13" height="8" rx="2" />
      <path d="M9.5 7h2M14 7h2" />
    </>,
  )
}
