import {
  ArrowRightIcon,
  BanknoteIcon,
  ShieldIcon,
  SparkleIcon,
  TruckIcon,
} from "@/components/icons";
import { GuardedLink } from "@/components/navigation-guard";
import { Container, Eyebrow } from "@/components/ui/section";

const TRUST = [
  { icon: ShieldIcon, label: "Every shop reviewed by Gifto" },
  { icon: BanknoteIcon, label: "Cash on delivery" },
  { icon: TruckIcon, label: "Free delivery at launch" },
];

function HeroArt() {
  return (
    <div
      aria-hidden
      className="relative mx-auto w-full max-w-[19rem] sm:max-w-[24rem] lg:max-w-[28rem]"
    >
      <svg viewBox="0 0 600 680" className="relative h-auto w-full">
        <defs>
          <linearGradient id="home-hero-arch" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="var(--color-berry-soft)" />
            <stop offset="0.52" stopColor="var(--color-paper)" />
            <stop offset="1" stopColor="var(--color-paper-deep)" />
          </linearGradient>
          <linearGradient id="home-hero-box" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="var(--color-berry)" />
            <stop offset="1" stopColor="var(--color-berry-deep)" />
          </linearGradient>
          <linearGradient id="home-hero-lid" x1="0" y1="0" x2="0" y2="1">
            <stop stopColor="oklch(0.38 0.14 12)" />
            <stop offset="1" stopColor="var(--color-berry-deep)" />
          </linearGradient>
          <linearGradient id="home-hero-gold" x1="0" y1="0" x2="1" y2="1">
            <stop stopColor="var(--color-gold-soft)" />
            <stop offset="0.48" stopColor="var(--color-gold)" />
            <stop offset="1" stopColor="oklch(0.66 0.11 70)" />
          </linearGradient>
          <filter
            id="home-hero-shadow"
            x="-30%"
            y="-30%"
            width="170%"
            height="190%"
          >
            <feDropShadow
              dx="0"
              dy="26"
              stdDeviation="20"
              floodColor="var(--color-berry-deep)"
              floodOpacity="0.2"
            />
          </filter>
        </defs>

        <path
          d="M62 652V304C62 172 168 64 300 64s238 108 238 240v348Z"
          fill="url(#home-hero-arch)"
          stroke="var(--color-line)"
          strokeWidth="1.5"
        />
        <path
          d="M111 652V312c0-108 85-196 189-196s189 88 189 196v340Z"
          fill="none"
          stroke="var(--color-berry)"
          strokeOpacity="0.1"
          strokeWidth="1.5"
        />
        <path
          d="M180 110c-34 21-60 52-74 90"
          fill="none"
          stroke="var(--color-gold)"
          strokeLinecap="round"
          strokeWidth="2.5"
          opacity="0.65"
        />
        <path
          d="M484 520c18-19 27-43 27-69"
          fill="none"
          stroke="var(--color-gold)"
          strokeLinecap="round"
          strokeWidth="2"
          opacity="0.5"
        />

        <g filter="url(#home-hero-shadow)" transform="rotate(-2 300 470)">
          <ellipse
            cx="300"
            cy="604"
            rx="148"
            ry="23"
            fill="var(--color-berry-deep)"
            opacity="0.12"
          />

          <g transform="translate(96 486) rotate(-8 82 64)">
            <rect
              x="0"
              y="34"
              width="158"
              height="102"
              rx="14"
              fill="var(--color-paper)"
            />
            <rect
              x="-9"
              y="12"
              width="176"
              height="36"
              rx="11"
              fill="var(--color-peach)"
            />
            <rect
              x="66"
              y="12"
              width="26"
              height="124"
              fill="var(--color-gold)"
            />
            <path
              d="M79 14C66-5 48-3 48 10c0 8 11 11 31 4Z"
              fill="var(--color-berry)"
            />
            <path
              d="M79 14c13-19 31-17 31-4 0 8-11 11-31 4Z"
              fill="var(--color-berry-deep)"
            />
            <rect
              x="70"
              y="4"
              width="18"
              height="18"
              rx="5"
              fill="var(--color-berry)"
            />
            <rect
              x="18"
              y="54"
              width="48"
              height="6"
              rx="3"
              fill="var(--color-paper-deep)"
            />
          </g>

          <rect
            x="166"
            y="408"
            width="268"
            height="186"
            rx="18"
            fill="url(#home-hero-box)"
          />
          <rect
            x="146"
            y="364"
            width="308"
            height="62"
            rx="16"
            fill="url(#home-hero-lid)"
          />
          <rect
            x="286"
            y="364"
            width="28"
            height="230"
            fill="url(#home-hero-gold)"
          />
          <rect
            x="166"
            y="448"
            width="268"
            height="26"
            fill="url(#home-hero-gold)"
          />
          <rect
            x="184"
            y="480"
            width="92"
            height="8"
            rx="4"
            fill="var(--color-paper)"
            opacity="0.34"
          />
          <path
            d="M300 364c-20-41-63-47-67-15-3 22 28 30 67 15Z"
            fill="url(#home-hero-gold)"
          />
          <path
            d="M300 364c20-41 63-47 67-15 3 22-28 30-67 15Z"
            fill="url(#home-hero-gold)"
          />
          <rect
            x="289"
            y="344"
            width="22"
            height="25"
            rx="6"
            fill="var(--color-gold)"
            stroke="var(--color-gold-soft)"
            strokeWidth="2"
          />
        </g>

        <path
          d="M301 389c35 16 43 28 68 43"
          fill="none"
          stroke="var(--color-gold)"
          strokeLinecap="round"
          strokeWidth="1.5"
          opacity="0.75"
        />

        <g
          transform="translate(372 430) rotate(8)"
          filter="url(#home-hero-shadow)"
        >
          <rect
            width="132"
            height="86"
            rx="12"
            fill="var(--color-paper)"
            stroke="var(--color-berry)"
            strokeOpacity="0.12"
          />
          <circle cx="18" cy="20" r="4" fill="var(--color-berry)" />
          <text
            x="30"
            y="27"
            fill="var(--color-ink)"
            fontFamily="var(--font-display)"
            fontSize="22"
          >
            Gifto
          </text>
          <text
            x="16"
            y="54"
            fill="var(--color-berry)"
            fontFamily="var(--font-sans)"
            fontSize="8.5"
            fontWeight="600"
            letterSpacing="1.8"
          >
            WITH LOVE
          </text>
          <path
            d="M16 70h74"
            stroke="var(--color-line-strong)"
            strokeLinecap="round"
            strokeWidth="4"
          />
        </g>

        <g fill="var(--color-berry)">
          <path
            d="M212 286c-8-13-25-13-25-1 0 8 10 16 25 26 15-10 25-18 25-26 0-12-17-12-25 1Z"
            opacity="0.7"
          />
          <path
            d="M442 214c-5-8-16-8-16 0 0 5 6 10 16 17 10-7 16-12 16-17 0-8-11-8-16 0Z"
            opacity="0.38"
          />
          <path
            d="M156 402c-4-6-12-6-12 0 0 4 5 8 12 13 7-5 12-9 12-13 0-6-8-6-12 0Z"
            opacity="0.24"
          />
        </g>

        <g fill="var(--color-gold)">
          <path
            d="M477 270c.6 6.2 4.8 10.4 11 11-6.2.6-10.4 4.8-11 11-.6-6.2-4.8-10.4-11-11 6.2-.6 10.4-4.8 11-11Z"
            opacity="0.85"
          />
          <path
            d="M132 232c.4 3.9 3 6.5 6.9 6.9-3.9.4-6.5 3-6.9 6.9-.4-3.9-3-6.5-6.9-6.9 3.9-.4 6.5-3 6.9-6.9Z"
            opacity="0.6"
          />
          <path
            d="M470 136c.3 3.1 2.4 5.2 5.5 5.5-3.1.3-5.2 2.4-5.5 5.5-.3-3.1-2.4-5.2-5.5-5.5 3.1-.3 5.2-2.4 5.5-5.5Z"
            opacity="0.55"
          />
        </g>

        <circle cx="126" cy="554" r="5" fill="var(--color-berry)" opacity="0.22" />
        <circle cx="506" cy="346" r="4" fill="var(--color-gold)" opacity="0.5" />
      </svg>

      <span className="absolute left-0 top-[21%] hidden -rotate-3 items-center gap-1.5 rounded-full border border-line bg-paper/95 px-3 py-1.5 text-xs font-medium text-ink-soft shadow-[0_12px_24px_-20px_oklch(0.33_0.13_12/0.55)] sm:flex">
        <SparkleIcon className="h-3.5 w-3.5 text-gold" />
        Wrapped with care
      </span>
      <span className="absolute bottom-[15%] right-0 rotate-2 rounded-full border border-line bg-paper/95 px-3 py-1.5 text-xs font-medium text-ink-soft shadow-[0_12px_24px_-20px_oklch(0.33_0.13_12/0.55)]">
        Made for giving
      </span>
    </div>
  );
}

export function HomeHero() {
  return (
    <section className="relative overflow-hidden border-b border-line">
      <div
        aria-hidden
        className="pointer-events-none absolute -right-28 -top-32 h-[26rem] w-[26rem] rounded-full bg-berry-soft/90 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-24 h-80 w-80 rounded-full bg-gold-soft/80 blur-3xl"
      />

      <Container className="relative grid items-center gap-10 py-12 sm:py-16 lg:grid-cols-[1.02fr_0.98fr] lg:gap-8 lg:py-20">
        <div className="gifto-rise">
          <Eyebrow>Gifts in Egypt</Eyebrow>
          <h1 className="mt-4 font-display text-[clamp(2.65rem,6vw,4.4rem)] leading-[1.02] tracking-[-0.025em] text-ink">
            Gifts in Egypt,{" "}
            <span className="text-berry">wrapped properly.</span>
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-ink-soft sm:text-lg">
            Thoughtful gifts from independent Egyptian shops — for the moments
            worth celebrating. Browse real gifts, then pay cash on delivery.
          </p>

          <div className="mt-8 flex flex-wrap items-center gap-3">
            <GuardedLink
              href="/search"
              className="group inline-flex h-12 items-center gap-2 rounded-full bg-berry px-6 text-sm font-semibold text-paper transition-colors hover:bg-berry-deep focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
            >
              Shop gifts
              <ArrowRightIcon className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-1 motion-reduce:transition-none" />
            </GuardedLink>
            <GuardedLink
              href="/#gift-finder"
              className="inline-flex h-12 items-center rounded-full border border-line-strong bg-paper/60 px-6 text-sm font-semibold text-ink transition-colors hover:border-berry/40 hover:text-berry focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-berry"
            >
              Find a gift
            </GuardedLink>
          </div>

          <ul className="mt-9 flex flex-wrap gap-x-5 gap-y-2.5 border-t border-line pt-5 text-xs text-ink-soft">
            {TRUST.map((item) => (
              <li key={item.label} className="flex items-center gap-1.5">
                <item.icon className="h-4 w-4 text-berry/80" />
                {item.label}
              </li>
            ))}
          </ul>
        </div>

        <div className="relative">
          <HeroArt />
        </div>
      </Container>
    </section>
  );
}
