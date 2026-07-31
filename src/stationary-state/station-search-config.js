export const STATION_SEARCH_CONFIG = Object.freeze({
  id: "STATION_SEARCH_CONFIG_V1",
  version: "1.0.0",
  algorithmVersion: "1.1.0",
  calibratedEvidenceRange: Object.freeze({
    fromUtc: "1900-01-01T00:00:00Z",
    toUtc: "2100-12-31T23:59:59Z",
  }),
  eligibleBodies: Object.freeze({
    MERCURIO: Object.freeze({ initialSearchWindowDays: 45, maximumSearchWindowDays: 180, searchStepHours: 6 }),
    VENUS: Object.freeze({
      initialSearchWindowDays: 120,
      maximumSearchWindowDays: 600,
      searchStepHours: 12,
      calibrationStatus: "ASTROLOGICA_APPROVED",
      calibrationReason: "ADJACENT_VENUS_STATION_BEYOND_400_DAYS",
    }),
    MARTE: Object.freeze({ initialSearchWindowDays: 240, maximumSearchWindowDays: 900, searchStepHours: 24 }),
    JUPITER: Object.freeze({ initialSearchWindowDays: 180, maximumSearchWindowDays: 500, searchStepHours: 24 }),
    SATURNO: Object.freeze({ initialSearchWindowDays: 180, maximumSearchWindowDays: 500, searchStepHours: 24 }),
    URANO: Object.freeze({ initialSearchWindowDays: 180, maximumSearchWindowDays: 500, searchStepHours: 48 }),
    NETUNO: Object.freeze({ initialSearchWindowDays: 180, maximumSearchWindowDays: 500, searchStepHours: 48 }),
    PLUTAO: Object.freeze({ initialSearchWindowDays: 180, maximumSearchWindowDays: 500, searchStepHours: 48 }),
  }),
});

export function stationSearchBodyConfig(bodyId, config = STATION_SEARCH_CONFIG) {
  return config.eligibleBodies[bodyId] ?? null;
}

export function stationSearchCacheNamespace({ bodyId, bodyConfig, ephemeris, config = STATION_SEARCH_CONFIG }) {
  const ephemerisSignature = [ephemeris?.engine, ephemeris?.version, ephemeris?.backend]
    .filter(Boolean)
    .join(":") || "UNKNOWN_EPHEMERIS";
  return [
    config.id,
    config.version,
    config.algorithmVersion,
    bodyId,
    bodyConfig.maximumSearchWindowDays,
    bodyConfig.searchStepHours,
    ephemerisSignature,
  ].join("|");
}
