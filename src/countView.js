// The analysis of a loaded count report together with what the analyst typed on the report screen.
// The report screen and the dashboard both use it, so they always show the same figures.

import { analyzeCounts } from "./countLogic";
import { DEFAULT_CYCLE_DAYS } from "./config";

// data: { lines, undated, source }   inputs: { total, counted, cycle }
// Days are counted up to today for an uploaded file, and up to the last date in the file for the example.
export function analysisFor(data, inputs) {
  const now = new Date();
  return analyzeCounts(data.lines, {
    undated: data.undated,
    totalLocations: inputs.total,
    countedLocations: inputs.counted,
    cycleDays: inputs.cycle || DEFAULT_CYCLE_DAYS,
    asOf: data.source === "sample" ? undefined : Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()),
  });
}
