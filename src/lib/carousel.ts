/**
 * Scroll state for a horizontal rail. Browsers report a negative `scrollLeft`
 * in RTL, so edge detection compares the absolute offset with the maximum.
 */
export function carouselEdges(
  scrollLeft: number,
  scrollWidth: number,
  clientWidth: number,
  tolerance = 2,
): { canPrev: boolean; canNext: boolean } {
  const max = Math.max(0, scrollWidth - clientWidth);
  const offset = Math.min(max, Math.abs(scrollLeft));

  return {
    canPrev: offset > tolerance,
    canNext: offset < max - tolerance,
  };
}

/** Logical next/previous maps to the opposite scroll direction in RTL. */
export function carouselDirection(rtl: boolean): 1 | -1 {
  return rtl ? -1 : 1;
}
