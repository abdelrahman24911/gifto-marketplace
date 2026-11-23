// X-axis label visibility for BarChart (admin overview/analytics, vendor
// analytics). Labels sit in ~16px columns but are ~36px wide, so showing two
// neighbours ("22 No" next to "23 No") is exactly the overlap the QA pass
// reported. Labels are therefore spaced at least CHART_LABEL_MIN_GAP columns
// apart, and the last label is only forced on when it is at least that far
// from the previous shown label.

export const CHART_LABEL_MAX = 6;
export const CHART_LABEL_MIN_GAP = 3;

export function chartLabelIndices(count: number): ReadonlySet<number> {
  if (count <= 0) return new Set<number>();
  const step = Math.max(1, Math.ceil(count / CHART_LABEL_MAX));
  const shown = new Set<number>();
  for (let index = 0; index < count; index += step) {
    shown.add(index);
  }
  const last = count - 1;
  const previous = Math.floor(last / step) * step;
  // Only force the last label on when it cannot collide with its neighbour.
  if (last - previous >= CHART_LABEL_MIN_GAP) shown.add(last);
  return shown;
}
