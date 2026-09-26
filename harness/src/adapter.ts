// The spec adapter: the ONE place that knows how a spec names its parts.
//
// Checks ask about days by date ("what colour is 17 Dec 2025?"). To answer, the scene query needs
// to know which mark draws the days, how to read a day's date from that mark's datum, and which
// mark draws the Peak day ring. Nothing else in the harness, and no check, names a mark, a signal
// or a transform. When the template renames its day mark, change it here and nowhere else.
//
// Contract a spec must meet to be driven by the harness:
// - Days are drawn by a mark named DAY_MARK (anywhere in the scenegraph, nested groups included).
// - Each day item's datum holds the day's date as a Date at local midnight in DAY_DATE_FIELD
//   (the spec builds it with datetime(y, m, d), so it is the viewer's calendar day).
// - The Peak day ring, when drawn, is a mark named RING_MARK whose datum holds the same field.
// - A day item's datum carries the dataset row identity as __row__ when the day has a row.
// - The legend's colour swatches, when drawn, are a mark named SWATCH_MARK.

export interface SpecAdapter {
  dayMark: string;
  dayDateField: string;
  ringMark: string;
  swatchMark: string;
}

export const DAY_MARK = 'cell';
export const DAY_DATE_FIELD = 'date';
export const RING_MARK = 'peakRing';
export const SWATCH_MARK = 'legendSwatch';

export const ADAPTER: SpecAdapter = { dayMark: DAY_MARK, dayDateField: DAY_DATE_FIELD, ringMark: RING_MARK, swatchMark: SWATCH_MARK };
