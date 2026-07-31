export const STATIONARY_PROFILE = Object.freeze({
  id: "ASTRODIENST_STATIONARY_PROFILE_V1",
  version: "1.0.0",
  searchAlgorithmVersion: "1.0.0",
  numericZeroToleranceDegPerDay: 1e-7,
  stationRootToleranceSeconds: 1,
  stationRootSpeedToleranceDegPerDay: 1e-7,
  verificationOffsetSeconds: 300,
  stationAssociationTieToleranceSeconds: 1,
  searchWindowExpansionFactor: 2,
  maximumRootIterations: 100,
  singleBodyStationSearchTimeoutMs: 1500,
  allBodiesStationSearchTimeoutMs: 8000,
  cache: Object.freeze({
    maximumEntries: 2048,
    ttlMs: 24 * 60 * 60 * 1000,
  }),
  eligibleBodies: Object.freeze({
    MERCURIO: Object.freeze({
      stationaryThresholdArcsecPerDay: 300,
      initialSearchStepHours: 6,
      initialSearchWindowDays: 45,
      maximumSearchWindowDays: 180,
    }),
    VENUS: Object.freeze({
      stationaryThresholdArcsecPerDay: 180,
      initialSearchStepHours: 12,
      initialSearchWindowDays: 120,
      maximumSearchWindowDays: 400,
    }),
    MARTE: Object.freeze({
      stationaryThresholdArcsecPerDay: 90,
      initialSearchStepHours: 24,
      initialSearchWindowDays: 240,
      maximumSearchWindowDays: 900,
    }),
    JUPITER: Object.freeze({
      stationaryThresholdArcsecPerDay: 60,
      initialSearchStepHours: 24,
      initialSearchWindowDays: 180,
      maximumSearchWindowDays: 500,
    }),
    SATURNO: Object.freeze({
      stationaryThresholdArcsecPerDay: 60,
      initialSearchStepHours: 24,
      initialSearchWindowDays: 180,
      maximumSearchWindowDays: 500,
    }),
    URANO: Object.freeze({
      stationaryThresholdArcsecPerDay: 20,
      initialSearchStepHours: 48,
      initialSearchWindowDays: 180,
      maximumSearchWindowDays: 500,
    }),
    NETUNO: Object.freeze({
      stationaryThresholdArcsecPerDay: 10,
      initialSearchStepHours: 48,
      initialSearchWindowDays: 180,
      maximumSearchWindowDays: 500,
    }),
    PLUTAO: Object.freeze({
      stationaryThresholdArcsecPerDay: 10,
      initialSearchStepHours: 48,
      initialSearchWindowDays: 180,
      maximumSearchWindowDays: 500,
    }),
  }),
});

export function stationaryBodyProfile(bodyId, profile = STATIONARY_PROFILE) {
  return profile.eligibleBodies[bodyId] ?? null;
}
