import Link from "next/link";

type BrandLogoProps = {
  href?: string;
  dark?: boolean;
  size?: "sm" | "md" | "lg";
  className?: string;
  link?: boolean;
};

const SIZES = {
  sm: { icon: 28, text: "text-lg" },
  md: { icon: 34, text: "text-xl" },
  lg: { icon: 44, text: "text-3xl" },
};

/** Quill lockup — logo option 3: navy rounded-square mark + wordmark. */
export function BrandLogo({
  href = "/",
  dark = false,
  size = "md",
  className = "",
  link = true,
}: BrandLogoProps) {
  const s = SIZES[size];
  const ink = dark ? "#ffffff" : "var(--ink)";

  const mark = (
    <span className={`inline-flex items-center gap-2.5 ${className}`} aria-label="Quill">
      <QuillMark size={s.icon} />
      <span
        className={`font-display font-semibold tracking-[-0.03em] leading-none ${s.text}`}
        style={{ color: ink }}
      >
        Quill
      </span>
    </span>
  );

  if (!link) return mark;
  return (
    <Link href={href} className="inline-flex shrink-0 items-center">
      {mark}
    </Link>
  );
}

/**
 * Logo option 3 — deep navy rounded square with white quill strokes
 * and a short ink line under the tip.
 */
export function QuillMark({
  className = "",
  size = 32,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden
      className={`shrink-0 ${className}`}
    >
      <rect width="64" height="64" rx="16" fill="#0A3358" />
      {/* Left slender curve */}
      <path
        d="M22 18c-1.5 8 0.5 16 4 24 1.8 4.2 4 8 6.5 11"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* Three sweeping right barbs */}
      <path
        d="M28 16c6 5 11 12 14 20"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M30 22c7 5.5 12.5 12.5 15.5 20"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      <path
        d="M32 28c6.5 5 11.5 11 14 17"
        stroke="#ffffff"
        strokeWidth="2.6"
        strokeLinecap="round"
      />
      {/* Tip into ink stroke */}
      <path
        d="M32.5 53c1.2-3.5 2.8-6.5 4.5-9"
        stroke="#ffffff"
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <path
        d="M24 54h16"
        stroke="#ffffff"
        strokeWidth="3"
        strokeLinecap="round"
      />
    </svg>
  );
}
