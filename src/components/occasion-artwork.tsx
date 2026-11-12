import { HeartIcon, SparkleIcon } from "@/components/icons";

const FALLBACK_TONES = [
  {
    background: "from-berry-soft via-paper-soft to-gold-soft/80",
    tag: "border-berry/15 bg-paper text-berry-deep",
    halo: "bg-berry/10",
    heart: "text-berry/55",
  },
  {
    background: "from-peach via-paper-soft to-berry-soft/80",
    tag: "border-berry/15 bg-paper text-berry-deep",
    halo: "bg-gold/15",
    heart: "text-berry-deep/45",
  },
  {
    background: "from-gold-soft/70 via-paper to-berry-soft",
    tag: "border-berry/15 bg-paper text-berry-deep",
    halo: "bg-berry/10",
    heart: "text-berry/50",
  },
];

export function OccasionFallbackArt({
  initial,
  tone = 0,
  className = "",
}: {
  initial: string;
  tone?: number;
  className?: string;
}) {
  const palette = FALLBACK_TONES[tone % FALLBACK_TONES.length];

  return (
    <div
      className={`relative flex h-full w-full items-center justify-center overflow-hidden bg-gradient-to-br ${palette.background} ${className}`}
    >
      <span
        aria-hidden
        className={`absolute -right-10 -top-12 h-36 w-36 rounded-full ${palette.halo} blur-2xl`}
      />
      <span
        aria-hidden
        className="absolute -bottom-14 -left-10 h-32 w-32 rounded-full bg-paper/70 blur-xl"
      />

      <svg
        viewBox="0 0 240 260"
        preserveAspectRatio="xMidYMid slice"
        className="relative h-[92%] w-[92%] drop-shadow-[0_22px_26px_rgba(121,13,43,0.12)]"
        aria-hidden
      >
        <ellipse cx="124" cy="232" rx="80" ry="12" className="fill-berry-deep/10" />

        <g transform="translate(38 94) rotate(-3 100 100)">
          <rect
            x="44"
            y="58"
            width="130"
            height="104"
            rx="12"
            className="fill-paper"
          />
          <rect
            x="34"
            y="36"
            width="150"
            height="34"
            rx="10"
            className="fill-paper-deep"
          />
          <rect
            x="97"
            y="36"
            width="26"
            height="126"
            className="fill-berry"
          />
          <rect
            x="44"
            y="94"
            width="130"
            height="18"
            className="fill-berry-deep"
            opacity="0.88"
          />
          <path
            d="M110 37C96 15 75 15 75 30c0 8 12 11 35 7Z"
            className="fill-berry-deep"
          />
          <path
            d="M110 37c14-22 35-22 35-7 0 8-12 11-35 7Z"
            className="fill-berry"
          />
          <rect x="101" y="28" width="18" height="18" rx="5" className="fill-berry-deep" />
          <rect x="52" y="67" width="54" height="6" rx="3" className="fill-paper/70" />
        </g>

        <g transform="translate(148 178) rotate(7 46 44)">
          <rect x="8" y="36" width="78" height="58" rx="8" className="fill-paper" />
          <rect x="2" y="22" width="90" height="20" rx="6" className="fill-peach" />
          <rect x="40" y="22" width="16" height="72" className="fill-berry-deep" />
          <path
            d="M48 23C41 10 29 10 29 18c0 5 8 7 19 5Z"
            className="fill-berry"
          />
          <path
            d="M48 23c7-13 19-13 19-5 0 5-8 7-19 5Z"
            className="fill-berry-deep"
          />
          <rect x="44" y="18" width="10" height="10" rx="3" className="fill-berry" />
        </g>
      </svg>

      <HeartIcon
        className={`absolute left-[8%] top-[14%] h-4 w-4 rotate-[-12deg] ${palette.heart}`}
      />
      <HeartIcon
        className={`absolute right-[9%] top-[58%] h-3.5 w-3.5 rotate-[10deg] ${palette.heart}`}
      />
      <SparkleIcon className="absolute right-[12%] top-[9%] h-5 w-5 text-gold/80" />
      <SparkleIcon className="absolute bottom-[14%] left-[7%] h-3.5 w-3.5 text-berry/40" />

      <div
        className={`absolute left-[13%] top-[53%] -rotate-6 rounded-md border px-2.5 py-1.5 shadow-[0_12px_20px_-14px_rgba(121,13,43,0.5)] ${palette.tag}`}
      >
        <span className="block font-display text-2xl leading-none">
          {initial}
        </span>
        <span className="mt-0.5 block text-[0.4rem] font-semibold uppercase tracking-[0.16em] text-ink-mute">
          Gifto
        </span>
      </div>
    </div>
  );
}

export function OccasionHeroArt({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden className={`relative ${className}`}>
      <div className="absolute inset-x-[8%] bottom-[8%] top-[10%] rotate-[-2deg] rounded-[48%_52%_46%_54%/58%_44%_56%_42%] bg-gradient-to-br from-berry-soft via-paper to-gold-soft/80" />
      <div className="absolute inset-x-[18%] bottom-[16%] top-[18%] rotate-[5deg] rounded-[46%_54%_52%_48%/48%_54%_46%_52%] border border-berry/10" />

      <svg
        viewBox="0 0 560 420"
        width="560"
        height="420"
        className="relative h-auto w-full overflow-visible"
        aria-hidden
      >
        <defs>
          <linearGradient id="occasion-hero-box" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="var(--color-paper-soft)" />
            <stop offset="1" stopColor="var(--color-paper-deep)" />
          </linearGradient>
          <linearGradient id="occasion-hero-lid" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="var(--color-paper)" />
            <stop offset="1" stopColor="var(--color-paper-deep)" />
          </linearGradient>
          <linearGradient id="occasion-hero-ribbon" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="var(--color-berry)" />
            <stop offset="1" stopColor="var(--color-berry-deep)" />
          </linearGradient>
          <filter id="occasion-hero-shadow" x="-30%" y="-30%" width="160%" height="180%">
            <feDropShadow
              dx="0"
              dy="24"
              stdDeviation="18"
              floodColor="var(--color-berry-deep)"
              floodOpacity="0.16"
            />
          </filter>
        </defs>

        <path
          d="M560 46c-44 2-102 19-132 58-23 30-22 67-5 93"
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="2.5"
          strokeLinecap="round"
          opacity="0.7"
        />
        <path
          d="M18 352c48 4 88-6 112-31 18-19 25-43 21-67"
          fill="none"
          stroke="var(--color-gold)"
          strokeWidth="2"
          strokeLinecap="round"
          opacity="0.45"
        />

        <g filter="url(#occasion-hero-shadow)" transform="rotate(-3 360 230)">
          <ellipse cx="372" cy="336" rx="128" ry="20" fill="var(--color-berry-deep)" opacity="0.1" />
          <rect
            x="270"
            y="165"
            width="202"
            height="162"
            rx="20"
            fill="url(#occasion-hero-box)"
          />
          <rect
            x="253"
            y="136"
            width="236"
            height="50"
            rx="15"
            fill="url(#occasion-hero-lid)"
          />
          <rect
            x="347"
            y="136"
            width="42"
            height="191"
            fill="url(#occasion-hero-ribbon)"
          />
          <rect
            x="270"
            y="214"
            width="202"
            height="28"
            fill="var(--color-berry-deep)"
            opacity="0.92"
          />
          <path
            d="M368 138c-25-38-62-37-62-12 0 14 22 19 62 12Z"
            fill="var(--color-berry-deep)"
          />
          <path
            d="M368 138c25-38 62-37 62-12 0 14-22 19-62 12Z"
            fill="var(--color-berry)"
          />
          <rect x="353" y="122" width="31" height="31" rx="9" fill="var(--color-berry-deep)" />
          <rect x="287" y="180" width="88" height="9" rx="4.5" fill="var(--color-paper)" opacity="0.58" />
          <path
            d="M287 293h64"
            stroke="var(--color-paper)"
            strokeWidth="5"
            strokeLinecap="round"
            opacity="0.45"
          />
        </g>

        <g filter="url(#occasion-hero-shadow)" transform="rotate(5 180 300)">
          <ellipse cx="178" cy="356" rx="92" ry="15" fill="var(--color-berry-deep)" opacity="0.09" />
          <rect
            x="104"
            y="264"
            width="142"
            height="92"
            rx="14"
            fill="var(--color-paper)"
          />
          <rect
            x="94"
            y="244"
            width="162"
            height="34"
            rx="10"
            fill="var(--color-peach)"
          />
          <rect
            x="159"
            y="244"
            width="30"
            height="112"
            fill="url(#occasion-hero-ribbon)"
          />
          <path
            d="M174 246c-18-27-44-26-44-9 0 10 16 14 44 9Z"
            fill="var(--color-berry)"
          />
          <path
            d="M174 246c18-27 44-26 44-9 0 10-16 14-44 9Z"
            fill="var(--color-berry-deep)"
          />
          <rect x="163" y="234" width="22" height="22" rx="7" fill="var(--color-berry)" />
          <rect x="118" y="277" width="60" height="7" rx="3.5" fill="var(--color-paper-deep)" />
        </g>

        <g fill="var(--color-berry)">
          <path
            d="M231 77c-8-13-25-13-25-1 0 8 10 16 25 26 15-10 25-18 25-26 0-12-17-12-25 1Z"
            opacity="0.82"
          />
          <path
            d="M493 239c-5-8-16-8-16 0 0 5 6 10 16 17 10-7 16-12 16-17 0-8-11-8-16 0Z"
            opacity="0.5"
          />
          <path
            d="M446 93c-4-7-13-7-13 0 0 4 5 8 13 13 8-5 13-9 13-13 0-7-9-7-13 0Z"
            opacity="0.38"
          />
        </g>

        <g fill="var(--color-gold)">
          <path d="M103 126c.7 6.4 4.9 10.6 11.3 11.3-6.4.7-10.6 4.9-11.3 11.3-.7-6.4-4.9-10.6-11.3-11.3 6.4-.7 10.6-4.9 11.3-11.3Z" opacity="0.85" />
          <path d="M469 164c.5 4.8 3.7 8 8.5 8.5-4.8.5-8 3.7-8.5 8.5-.5-4.8-3.7-8-8.5-8.5 4.8-.5 8-3.7 8.5-8.5Z" opacity="0.65" />
          <path d="M320 57c.4 3.5 2.7 5.8 6.2 6.2-3.5.4-5.8 2.7-6.2 6.2-.4-3.5-2.7-5.8-6.2-6.2 3.5-.4 5.8-2.7 6.2-6.2Z" opacity="0.55" />
        </g>

        <circle cx="527" cy="120" r="5" fill="var(--color-gold)" opacity="0.5" />
        <circle cx="73" cy="222" r="4" fill="var(--color-berry)" opacity="0.28" />
      </svg>

      <div className="absolute left-[59%] top-[55%] -rotate-6 rounded-lg border border-berry/10 bg-paper px-3 py-2 shadow-[0_18px_30px_-20px_rgba(121,13,43,0.55)]">
        <span className="block text-[0.48rem] font-semibold uppercase tracking-[0.18em] text-berry">
          Gifto
        </span>
        <span className="mt-0.5 block font-display text-sm leading-none text-ink">
          with love
        </span>
      </div>
    </div>
  );
}
