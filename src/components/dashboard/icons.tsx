import type { SVGProps } from "react";

import type { DashboardIconName } from "@/components/dashboard/types";

type IconProps = SVGProps<SVGSVGElement> & {
  className?: string;
};

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

function IconFrame({
  children,
  className = "h-5 w-5",
  ...props
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg {...base} {...props} className={className}>
      {children}
    </svg>
  );
}

export function DashboardIcon({
  name,
  className,
  ...props
}: IconProps & { name: DashboardIconName }) {
  const frameProps = { className, ...props };

  switch (name) {
    case "overview":
      return (
        <IconFrame {...frameProps}>
          <rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.4" />
          <rect x="14" y="3.5" width="6.5" height="6.5" rx="1.4" />
          <rect x="3.5" y="14" width="6.5" height="6.5" rx="1.4" />
          <rect x="14" y="14" width="6.5" height="6.5" rx="1.4" />
        </IconFrame>
      );
    case "orders":
      return (
        <IconFrame {...frameProps}>
          <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2z" />
          <path d="M9 8h6M9 12h6M9 16h3" />
        </IconFrame>
      );
    case "shops":
      return (
        <IconFrame {...frameProps}>
          <path d="M3.5 9.5 5.5 4h13l2 5.5" />
          <path d="M4.5 9.5V20h15V9.5" />
          <path d="M9 20v-6h6v6" />
        </IconFrame>
      );
    case "products":
      return (
        <IconFrame {...frameProps}>
          <path d="m12 3 8.5 4.7v8.6L12 21l-8.5-4.7V7.7z" />
          <path d="m3.5 7.7 8.5 4.8 8.5-4.8M12 12.5V21" />
        </IconFrame>
      );
    case "categories":
      return (
        <IconFrame {...frameProps}>
          <path d="m12 3 8.5 4.7L12 12.4 3.5 7.7z" />
          <path d="m3.5 12.2 8.5 4.7 8.5-4.7M3.5 16.5l8.5 4.7 8.5-4.7" />
        </IconFrame>
      );
    case "occasions":
      return (
        <IconFrame {...frameProps}>
          <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
          <path d="M8 3.5V7M16 3.5V7M3.5 10h17" />
          <path d="M12.8 17.2s-2.8-1.5-2.8-3.4a1.7 1.7 0 0 1 2.8-1.2 1.7 1.7 0 0 1 2.8 1.2c0 1.9-2.8 3.4-2.8 3.4Z" />
        </IconFrame>
      );
    case "tags":
      return (
        <IconFrame {...frameProps}>
          <path d="m20 13-7 7-9.5-9.5V3.5H10z" />
          <circle cx="8" cy="8" r="1.2" />
        </IconFrame>
      );
    case "settlements":
      return (
        <IconFrame {...frameProps}>
          <rect x="3.5" y="6" width="17" height="12" rx="2" />
          <circle cx="12" cy="12" r="2.5" />
          <path d="M7 9v6M17 9v6" />
        </IconFrame>
      );
    case "support":
      return (
        <IconFrame {...frameProps}>
          <circle cx="12" cy="12" r="8.5" />
          <circle cx="12" cy="12" r="3.4" />
          <path d="m5.9 5.9 3.8 3.8M14.3 14.3l3.8 3.8M18.1 5.9l-3.8 3.8M9.7 14.3l-3.8 3.8" />
        </IconFrame>
      );
    case "analytics":
      return (
        <IconFrame {...frameProps}>
          <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
        </IconFrame>
      );
    case "settings":
      return (
        <IconFrame {...frameProps}>
          <path d="M4 6h16M4 12h16M4 18h16" />
          <circle cx="9" cy="6" r="2" />
          <circle cx="15" cy="12" r="2" />
          <circle cx="8" cy="18" r="2" />
        </IconFrame>
      );
    case "inventory":
      return (
        <IconFrame {...frameProps}>
          <rect x="3.5" y="4" width="17" height="5" rx="1.2" />
          <path d="M5.5 9v10.5h13V9M9.5 13h5" />
        </IconFrame>
      );
    case "earnings":
      return (
        <IconFrame {...frameProps}>
          <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H19v14H6.5A2.5 2.5 0 0 1 4 16.5z" />
          <path d="M16 12h5v4h-5a2 2 0 0 1 0-4Z" />
          <path d="M7.5 8.5H14" />
        </IconFrame>
      );
    case "help":
      return (
        <IconFrame {...frameProps}>
          <circle cx="12" cy="12" r="8.5" />
          <path d="M9.8 9.2a2.4 2.4 0 0 1 4.7.7c0 1.7-2.5 2.1-2.5 3.9" />
          <path d="M12 17h.01" />
        </IconFrame>
      );
  }
}

export function ArrowUpRightIcon({
  className = "h-4 w-4",
  ...props
}: IconProps) {
  return (
    <IconFrame className={className} {...props}>
      <path d="M14 4h6v6M20 4l-9 9" />
      <path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </IconFrame>
  );
}
