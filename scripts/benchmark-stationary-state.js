import { performance } from "node:perf_hooks";
import { generateRawChartV2 } from "../src/astronomy-core/raw-chart-generator.js";
import { clearStationEventCache } from "../src/stationary-state/station-event-cache.js";

const baseInput = { time: "12:00:00", timezone: "UTC", latitude: 0, longitude: 0, houseSystem: "P" };

function percentile(values, fraction) {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))];
}

function dateForIndex(index) {
  return new Date(Date.UTC(1982, 0, 1 + (index % 365))).toISOString().slice(0, 10);
}

function runCharts(count) {
  const elapsed = [];
  let cacheHits = 0;
  let cacheLookups = 0;
  let rootSearches = 0;
  let timeouts = 0;
  let partial = 0;
  for (let index = 0; index < count; index += 1) {
    const startedAt = performance.now();
    const chart = generateRawChartV2({ ...baseInput, date: dateForIndex(index) });
    elapsed.push(performance.now() - startedAt);
    for (const object of chart.objects.filter((item) => item.motion?.stationaryThresholdArcsecPerDay != null)) {
      cacheLookups += 2;
      if (object.motionAudit.cacheStatus === "HIT") cacheHits += 2;
      else if (object.motionAudit.cacheStatus === "PARTIAL_HIT") cacheHits += 1;
      rootSearches += object.motionAudit.rootSearchesPerformed ?? 0;
      if (object.motion.stationCalculationStatus === "TIMEOUT") timeouts += 1;
      if (object.motion.stationCalculationStatus === "PARTIAL") partial += 1;
    }
  }
  const total = elapsed.reduce((sum, value) => sum + value, 0);
  return {
    count,
    totalMs: Number(total.toFixed(3)),
    averageMs: Number((total / elapsed.length).toFixed(3)),
    p50Ms: Number(percentile(elapsed, 0.50).toFixed(3)),
    p95Ms: Number(percentile(elapsed, 0.95).toFixed(3)),
    maximumMs: Number(Math.max(...elapsed).toFixed(3)),
    cacheHitRatio: cacheLookups ? Number((cacheHits / cacheLookups).toFixed(6)) : 0,
    averageRootSearchesPerChart: Number((rootSearches / count).toFixed(6)),
    timeouts,
    partialResults: partial,
  };
}

clearStationEventCache();
const singleChartColdCache = runCharts(1);
const singleChartWarmCache = runCharts(1);
clearStationEventCache();
const hundredChartsSameYear = runCharts(100);
clearStationEventCache();
const batch1400 = runCharts(1400);

process.stdout.write(`${JSON.stringify({
  benchmark: "PLANETARY_STATIONARY_STATE_V1",
  generatedAtUtc: new Date().toISOString(),
  classification: ["FUNCTIONAL_CORRECTNESS", "BATCH_BENCHMARK", "CONTINUOUS_THROUGHPUT_NOT_HOMOLOGATED"],
  singleChartColdCache,
  singleChartWarmCache,
  hundredChartsSameYear,
  batch1400,
}, null, 2)}\n`);
