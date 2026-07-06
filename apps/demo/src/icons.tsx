import type { ReactElement, ReactNode, SVGProps } from "react"

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

/** Shared wrapper — all icons are 24×24 line drawings using currentColor. */
function Svg({ size = 16, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

// --- brand mark ---------------------------------------------------------

/**
 * maskera logomark: redacted text (two bars) inside placeholder brackets — the
 * shape of the product's own output, `[PERSONNUMMER_1]`.
 */
export function MaskeraMark({ size = 22, ...rest }: IconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true" {...rest}>
      <path
        d="M9 4H6v16h3"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M15 4h3v16h-3"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <rect x="8.5" y="8.7" width="7" height="2.3" rx="1.15" fill="currentColor" />
      <rect x="8.5" y="13" width="4.6" height="2.3" rx="1.15" fill="currentColor" />
    </svg>
  )
}

// --- domain icons -------------------------------------------------------

export const HealthIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 8v8M8 12h8" />
  </Svg>
)

export const LawIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4v16M9 20h6" />
    <path d="M6 7h12" />
    <circle cx="12" cy="4" r="1" />
    <path d="M6 7 4 12h4zM18 7l-2 5h4z" />
  </Svg>
)

export const HrIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="7" width="18" height="12" rx="2" />
    <path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    <path d="M3 12h18" />
  </Svg>
)

export const SupportIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 13v-2a7 7 0 0 1 14 0v2" />
    <rect x="3" y="13" width="3.5" height="6" rx="1.5" />
    <rect x="17.5" y="13" width="3.5" height="6" rx="1.5" />
    <path d="M19 19a4 4 0 0 1-4 3h-2" />
  </Svg>
)

export const LandmarkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 21 8H3z" />
    <path d="M4 21h16" />
    <path d="M5 11v7M9.5 11v7M14.5 11v7M19 11v7" />
  </Svg>
)

// --- ui icons -----------------------------------------------------------

export const PencilIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 19l-1 1 1-4L16 5l3 3L8 19z" />
    <path d="M14 7l3 3" />
  </Svg>
)

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)

export const ArrowUpRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  </Svg>
)

export const CopyIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </Svg>
)

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m4 12.5 5 5L20 6.5" />
  </Svg>
)

export const ChatIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5h16v11H9l-4 4v-4H4z" />
    <path d="M8 10h8M8 13h5" />
  </Svg>
)

export const KeyIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7.5" cy="8.5" r="3.5" />
    <path d="M10 11l8 8M15 16l2-2M18 19l2-2" />
  </Svg>
)

// --- mapping: scenario id -> icon ---------------------------------------

export const DOMAIN_ICONS: Record<string, (p: IconProps) => ReactElement> = {
  vard: HealthIcon,
  juridik: LawIcon,
  hr: HrIcon,
  support: SupportIcon,
  kommun: LandmarkIcon,
  fritext: PencilIcon,
}
