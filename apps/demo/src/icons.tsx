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

export const BuildingIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="6" y="3" width="12" height="18" rx="1.5" />
    <path d="M9.5 7h0M14.5 7h0M9.5 11h0M14.5 11h0M9.5 15h0" />
    <path d="M10.5 21v-3h3v3" />
  </Svg>
)

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4 21 19H3z" />
    <path d="M12 10v4" />
    <path d="M12 16.5h0" />
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

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3 20 6v5c0 5-4 8-8 10-4-2-8-5-8-10V6z" />
    <path d="M9 12l2 2 4-4" />
  </Svg>
)

export const BankIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M3 10h18" />
    <path d="M7 14h4" />
  </Svg>
)

export const SchoolIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 4 22 9l-10 5L2 9z" />
    <path d="M6 11v4c0 1.2 2.7 3 6 3s6-1.8 6-3v-4" />
    <path d="M22 9v4" />
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

export const EyeOffIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 5s2.5 4 8 4 8-4 8-4" opacity="0" />
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
    <circle cx="12" cy="12" r="3" />
    <path d="M3 3l18 18" />
  </Svg>
)

export const ArrowUpRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 17 17 7" />
    <path d="M8 7h9v9" />
  </Svg>
)

// --- mapping: scenario id -> icon ---------------------------------------

export const DOMAIN_ICONS: Record<string, (p: IconProps) => ReactElement> = {
  vard: HealthIcon,
  juridik: LawIcon,
  brf: BuildingIcon,
  kris: AlertIcon,
  hr: HrIcon,
  support: SupportIcon,
  kommun: LandmarkIcon,
  forsakring: ShieldIcon,
  bank: BankIcon,
  skola: SchoolIcon,
  fritext: PencilIcon,
}
