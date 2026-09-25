// The suite's matrix: every template check runs under both Vega versions (Deneb 1.9 and 2.0) and
// in every time zone of the default suite.
import { VEGA_VERSIONS, TIME_ZONES, type VegaVersion } from '../src/index.ts';

export interface Cell {
  vega: VegaVersion;
  timeZone: string;
  /** Prefix for check names, for example "[Vega 6.2, Pacific/Auckland]". */
  label: string;
}

export const CELLS: Cell[] = VEGA_VERSIONS.flatMap((vega) => TIME_ZONES.map((timeZone) => ({ vega, timeZone, label: `[Vega ${vega}, ${timeZone}]` })));
