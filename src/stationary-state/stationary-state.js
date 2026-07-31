import { nearestCachedStations, storeStationEvent } from "./station-event-cache.js";
import { STATIONARY_PROFILE, stationaryBodyProfile } from "./stationary-profile.js";
import {
  STATION_SEARCH_CONFIG,
  stationSearchBodyConfig,
  stationSearchCacheNamespace,
} from "./station-search-config.js";

const SECONDS_PER_DAY = 86400;

export function isWithinSearchWindow(eventJulianDay, instantJulianDay, maximumSearchWindowDays) {
  if (!Number.isFinite(eventJulianDay) || !Number.isFinite(instantJulianDay)) return false;
  const distanceSeconds = Math.abs(eventJulianDay - instantJulianDay) * SECONDS_PER_DAY;
  return distanceSeconds <= maximumSearchWindowDays * SECONDS_PER_DAY;
}

export function julianDayToUtc(julianDay) {
  return new Date((julianDay - 2440587.5) * 86400000).toISOString();
}

export function motionSign(speed, tolerance = STATIONARY_PROFILE.numericZeroToleranceDegPerDay) {
  if (!Number.isFinite(speed)) return "UNKNOWN";
  if (speed > tolerance) return "POSITIVE";
  if (speed < -tolerance) return "NEGATIVE";
  return "ZERO";
}

export function fallbackMotionState(speed, tolerance) {
  const sign = motionSign(speed, tolerance);
  if (sign === "NEGATIVE") return "R";
  if (sign === "POSITIVE" || sign === "ZERO") return "D";
  return "UNKNOWN";
}

function oppositeNonZeroSigns(left, right, tolerance) {
  const leftSign = motionSign(left, tolerance);
  const rightSign = motionSign(right, tolerance);
  return leftSign !== "UNKNOWN" && rightSign !== "UNKNOWN" &&
    leftSign !== "ZERO" && rightSign !== "ZERO" && leftSign !== rightSign;
}

export function refineBracketedRoot({
  startJulianDay,
  endJulianDay,
  speedAt,
  profile = STATIONARY_PROFILE,
  deadline = Number.POSITIVE_INFINITY,
}) {
  let a = Math.min(startJulianDay, endJulianDay);
  let b = Math.max(startJulianDay, endJulianDay);
  let fa = speedAt(a);
  let fb = speedAt(b);
  const speedTolerance = profile.stationRootSpeedToleranceDegPerDay;
  const timeToleranceDays = profile.stationRootToleranceSeconds / SECONDS_PER_DAY;

  if (!Number.isFinite(fa) || !Number.isFinite(fb)) {
    return { status: "EPHEMERIS_ERROR", iterations: 0 };
  }
  if (Math.abs(fa) <= speedTolerance) {
    return { status: "COMPUTED", julianDay: a, speed: fa, iterations: 0, algorithm: "BRENT" };
  }
  if (Math.abs(fb) <= speedTolerance) {
    return { status: "COMPUTED", julianDay: b, speed: fb, iterations: 0, algorithm: "BRENT" };
  }
  if (fa * fb > 0) return { status: "ROOT_WITHOUT_CONFIRMED_TRANSITION", iterations: 0 };

  for (let iteration = 1; iteration <= profile.maximumRootIterations; iteration += 1) {
    if (Date.now() > deadline) return { status: "TIMEOUT", iterations: iteration - 1 };
    const width = b - a;
    if (width <= timeToleranceDays) {
      const midpoint = (a + b) / 2;
      return {
        status: "COMPUTED",
        julianDay: midpoint,
        speed: speedAt(midpoint),
        iterations: iteration,
        algorithm: "BRENT_WITH_BISECTION_FALLBACK",
      };
    }

    const midpoint = (a + b) / 2;
    const secant = fb === fa ? Number.NaN : b - (fb * (b - a)) / (fb - fa);
    const guard = Math.max(timeToleranceDays, width * 0.05);
    const candidate = Number.isFinite(secant) && secant > a + guard && secant < b - guard
      ? secant
      : midpoint;
    const candidateSpeed = speedAt(candidate);
    if (!Number.isFinite(candidateSpeed)) {
      return { status: "EPHEMERIS_ERROR", iterations: iteration };
    }
    if (Math.abs(candidateSpeed) <= speedTolerance) {
      return {
        status: "COMPUTED",
        julianDay: candidate,
        speed: candidateSpeed,
        iterations: iteration,
        algorithm: "BRENT_WITH_BISECTION_FALLBACK",
      };
    }
    if (fa * candidateSpeed <= 0) {
      b = candidate;
      fb = candidateSpeed;
    } else {
      a = candidate;
      fa = candidateSpeed;
    }
  }

  return { status: "ROOT_REFINEMENT_MAX_ITERATIONS", iterations: profile.maximumRootIterations };
}

function verifyStation(root, speedAt, profile) {
  const offsetDays = profile.verificationOffsetSeconds / SECONDS_PER_DAY;
  const before = speedAt(root.julianDay - offsetDays);
  const after = speedAt(root.julianDay + offsetDays);
  if (!Number.isFinite(before) || !Number.isFinite(after)) return { status: "EPHEMERIS_ERROR" };
  // The verification samples must prove a mathematical sign change. Applying
  // the instantaneous ZERO tolerance here masks valid slow-planet transitions.
  const beforeSign = motionSign(before, 0);
  const afterSign = motionSign(after, 0);
  if (beforeSign === "POSITIVE" && afterSign === "NEGATIVE") {
    return { status: "COMPUTED", transition: "D_TO_R", before, after };
  }
  if (beforeSign === "NEGATIVE" && afterSign === "POSITIVE") {
    return { status: "COMPUTED", transition: "R_TO_D", before, after };
  }
  return { status: "ROOT_WITHOUT_CONFIRMED_TRANSITION", before, after };
}

function searchDirection({
  bodyId,
  instantJulianDay,
  direction,
  bodyProfile,
  searchConfig,
  cacheNamespace,
  speedAt,
  profile,
  deadline,
}) {
  const stepDays = searchConfig.searchStepHours / 24;
  let scannedDays = 0;
  let windowDays = Math.min(searchConfig.initialSearchWindowDays, searchConfig.maximumSearchWindowDays);
  let edgeJulianDay = instantJulianDay;
  let edgeSpeed = speedAt(edgeJulianDay);
  let expansions = 0;
  let samples = 1;

  while (scannedDays < searchConfig.maximumSearchWindowDays) {
    if (Date.now() > deadline) {
      return {
        status: "TIMEOUT",
        expansions,
        samples,
        searchedDays: scannedDays,
        searchEndJulianDay: edgeJulianDay,
      };
    }
    const targetDays = Math.min(windowDays, searchConfig.maximumSearchWindowDays);
    while (scannedDays < targetDays) {
      const increment = Math.min(stepDays, targetDays - scannedDays);
      const candidateJulianDay = edgeJulianDay + direction * increment;
      const candidateSpeed = speedAt(candidateJulianDay);
      samples += 1;
      if (!Number.isFinite(candidateSpeed)) {
        return {
          status: "EPHEMERIS_ERROR",
          expansions,
          samples,
          searchedDays: scannedDays + increment,
          searchEndJulianDay: candidateJulianDay,
        };
      }
      const hasEndpointRoot = Math.abs(candidateSpeed) <= profile.stationRootSpeedToleranceDegPerDay ||
        Math.abs(edgeSpeed) <= profile.stationRootSpeedToleranceDegPerDay;
      if (hasEndpointRoot || oppositeNonZeroSigns(candidateSpeed, edgeSpeed, profile.numericZeroToleranceDegPerDay)) {
        const root = refineBracketedRoot({
          startJulianDay: candidateJulianDay,
          endJulianDay: edgeJulianDay,
          speedAt,
          profile,
          deadline,
        });
        if (root.status !== "COMPUTED") {
          return {
            ...root,
            expansions,
            samples,
            searchedDays: scannedDays + increment,
            searchEndJulianDay: candidateJulianDay,
          };
        }
        const verification = verifyStation(root, speedAt, profile);
        if (verification.status !== "COMPUTED") {
          return {
            ...verification,
            expansions,
            samples,
            iterations: root.iterations,
            searchedDays: scannedDays + increment,
            searchEndJulianDay: candidateJulianDay,
          };
        }
        const event = storeStationEvent(bodyId, {
          julianDay: root.julianDay,
          exactStationUtc: julianDayToUtc(root.julianDay),
          transition: verification.transition,
          rootSpeedDegPerDay: root.speed,
          rootIterations: root.iterations,
          rootAlgorithm: root.algorithm,
        }, profile, cacheNamespace);
        return {
          status: "COMPUTED",
          event,
          expansions,
          samples,
          iterations: root.iterations,
          searchedDays: scannedDays + increment,
          searchEndJulianDay: candidateJulianDay,
        };
      }
      scannedDays += increment;
      edgeJulianDay = candidateJulianDay;
      edgeSpeed = candidateSpeed;
    }
    if (targetDays >= searchConfig.maximumSearchWindowDays) break;
    windowDays = Math.min(
      windowDays * profile.searchWindowExpansionFactor,
      searchConfig.maximumSearchWindowDays,
    );
    expansions += 1;
  }
  return {
    status: direction < 0 ? "PREVIOUS_STATION_NOT_FOUND" : "NEXT_STATION_NOT_FOUND",
    expansions,
    samples,
    searchedDays: scannedDays,
    searchEndJulianDay: edgeJulianDay,
  };
}

function eventDistanceHours(event, instantJulianDay) {
  return event ? Math.abs(event.julianDay - instantJulianDay) * 24 : null;
}

export function classifyMotion({ speed, thresholdArcsecPerDay, previous, next, profile = STATIONARY_PROFILE }) {
  const sign = motionSign(speed, profile.numericZeroToleranceDegPerDay);
  const thresholdDegPerDay = thresholdArcsecPerDay / 3600;
  const withinThreshold = Number.isFinite(speed) && Math.abs(speed) <= thresholdDegPerDay;
  const fallback = fallbackMotionState(speed, profile.numericZeroToleranceDegPerDay);
  if (!withinThreshold || !previous || !next) {
    return { motionState: fallback, sign, withinThreshold, thresholdDegPerDay };
  }
  const associated = previous.distanceHours <= next.distanceHours ? previous : next;
  return {
    motionState: associated.transition === "R_TO_D" ? "SD" : "SR",
    sign,
    withinThreshold,
    thresholdDegPerDay,
    associated,
    tieResolved: Math.abs(previous.distanceHours - next.distanceHours) * 3600 <=
      profile.stationAssociationTieToleranceSeconds ? "PREVIOUS" : null,
  };
}

export function calculateStationaryState({
  bodyId,
  instantJulianDay,
  speedLongitudeDegPerDay,
  speedAt,
  ephemeris,
  profile = STATIONARY_PROFILE,
  stationSearchConfig = STATION_SEARCH_CONFIG,
  allBodiesDeadline = Number.POSITIVE_INFINITY,
}) {
  const startedAt = Date.now();
  const bodyProfile = stationaryBodyProfile(bodyId, profile);
  const searchConfig = stationSearchBodyConfig(bodyId, stationSearchConfig);
  const fallback = fallbackMotionState(speedLongitudeDegPerDay, profile.numericZeroToleranceDegPerDay);
  if (!bodyProfile || !searchConfig) {
    return {
      motion: {
        bodyId,
        speedLongitudeDegPerDay,
        speedLongitudeArcsecPerDay: Number.isFinite(speedLongitudeDegPerDay) ? speedLongitudeDegPerDay * 3600 : null,
        motionSignAtInstant: motionSign(speedLongitudeDegPerDay, profile.numericZeroToleranceDegPerDay),
        motionState: "NOT_APPLICABLE",
        stationaryClassificationAvailable: false,
        stationCalculationStatus: "NOT_ELIGIBLE_BODY",
      },
      motionAudit: { calculatedAtUtc: new Date().toISOString(), cacheStatus: "NOT_APPLICABLE" },
    };
  }

  if (!Number.isFinite(speedLongitudeDegPerDay)) {
    return {
      motion: {
        bodyId,
        speedLongitudeDegPerDay: null,
        speedLongitudeArcsecPerDay: null,
        motionSignAtInstant: "UNKNOWN",
        motionState: "UNKNOWN",
        stationaryClassificationAvailable: false,
        stationCalculationStatus: "MISSING_SPEED",
      },
      motionAudit: {
        stationSearchConfigId: stationSearchConfig.id,
        stationSearchConfigVersion: stationSearchConfig.version,
        previousSearchStatus: "NOT_SEARCHED",
        nextSearchStatus: "NOT_SEARCHED",
        calculatedAtUtc: new Date().toISOString(),
      },
    };
  }

  const deadline = Math.min(
    startedAt + profile.singleBodyStationSearchTimeoutMs,
    allBodiesDeadline,
  );
  const cacheNamespace = stationSearchCacheNamespace({ bodyId, bodyConfig: searchConfig, ephemeris, config: stationSearchConfig });
  const cachedRaw = nearestCachedStations(bodyId, instantJulianDay, profile, cacheNamespace);
  const cached = {
    previous: isWithinSearchWindow(cachedRaw.previous?.julianDay, instantJulianDay, searchConfig.maximumSearchWindowDays)
      ? cachedRaw.previous : null,
    next: isWithinSearchWindow(cachedRaw.next?.julianDay, instantJulianDay, searchConfig.maximumSearchWindowDays)
      ? cachedRaw.next : null,
  };
  const previousResult = cached.previous
    ? {
      status: "COMPUTED",
      event: cached.previous,
      expansions: 0,
      samples: 0,
      iterations: 0,
      searchedDays: 0,
      searchEndJulianDay: cached.previous.julianDay,
    }
    : searchDirection({ bodyId, instantJulianDay, direction: -1, bodyProfile, searchConfig, cacheNamespace, speedAt, profile, deadline });
  const nextResult = cached.next
    ? {
      status: "COMPUTED",
      event: cached.next,
      expansions: 0,
      samples: 0,
      iterations: 0,
      searchedDays: 0,
      searchEndJulianDay: cached.next.julianDay,
    }
    : searchDirection({ bodyId, instantJulianDay, direction: 1, bodyProfile, searchConfig, cacheNamespace, speedAt, profile, deadline });
  const previous = previousResult.event ? {
    ...previousResult.event,
    distanceHours: eventDistanceHours(previousResult.event, instantJulianDay),
  } : null;
  const next = nextResult.event ? {
    ...nextResult.event,
    distanceHours: eventDistanceHours(nextResult.event, instantJulianDay),
  } : null;
  const classification = classifyMotion({
    speed: speedLongitudeDegPerDay,
    thresholdArcsecPerDay: bodyProfile.stationaryThresholdArcsecPerDay,
    previous,
    next,
    profile,
  });
  const bothStations = Boolean(previous && next);
  const associated = classification.associated ?? (
    previous && next ? (previous.distanceHours <= next.distanceHours ? previous : next) : previous ?? next
  );
  const timeout = previousResult.status === "TIMEOUT" || nextResult.status === "TIMEOUT";
  const status = bothStations ? "COMPUTED" : timeout ? "TIMEOUT" : "PARTIAL";
  const resolvedMotionState = bothStations
    ? classification.motionState
    : classification.withinThreshold ? "STATIONARY_UNRESOLVED" : fallback;
  const canonicalSearchStatus = (result) => {
    if (result.status === "COMPUTED") return "FOUND";
    if (/NOT_FOUND$/.test(result.status)) return "SEARCH_WINDOW_EXCEEDED";
    if (result.status === "ROOT_REFINEMENT_MAX_ITERATIONS") return "ROOT_REFINEMENT_FAILED";
    if (result.status === "ROOT_WITHOUT_CONFIRMED_TRANSITION") return "TRANSITION_NOT_CONFIRMED";
    return result.status;
  };
  const previousSearchStatus = canonicalSearchStatus(previousResult);
  const nextSearchStatus = canonicalSearchStatus(nextResult);

  return {
    motion: {
      bodyId,
      speedLongitudeDegPerDay,
      speedLongitudeArcsecPerDay: speedLongitudeDegPerDay * 3600,
      motionSignAtInstant: classification.sign,
      motionState: resolvedMotionState,
      stationaryThresholdArcsecPerDay: bodyProfile.stationaryThresholdArcsecPerDay,
      stationaryThresholdDegPerDay: classification.thresholdDegPerDay,
      isWithinStationaryThreshold: classification.withinThreshold,
      previousExactStationUtc: previous?.exactStationUtc ?? null,
      previousStationTransition: previous?.transition ?? null,
      nextExactStationUtc: next?.exactStationUtc ?? null,
      nextStationTransition: next?.transition ?? null,
      associatedExactStationUtc: associated?.exactStationUtc ?? null,
      associatedStationTransition: associated?.transition ?? null,
      stationDistanceHours: associated?.distanceHours ?? null,
      stationAssociationTieResolved: classification.tieResolved ?? null,
      nearestStationGuarantee: bothStations,
      stationaryClassificationAvailable: bothStations,
      stationaryProfileId: profile.id,
      stationaryProfileVersion: profile.version,
      motionSchemaVersion: "1.1.0",
      stationaryStateContractVersion: "1.1.0",
      stationCalculationStatus: status,
    },
    motionAudit: {
      stationRootToleranceSeconds: profile.stationRootToleranceSeconds,
      stationRootSpeedToleranceDegPerDay: profile.stationRootSpeedToleranceDegPerDay,
      stationSearchStartUtc: julianDayToUtc(instantJulianDay),
      stationSearchEndUtc: new Date().toISOString(),
      stationSearchConfigId: stationSearchConfig.id,
      stationSearchConfigVersion: stationSearchConfig.version,
      calibratedEvidenceRange: stationSearchConfig.calibratedEvidenceRange,
      searchStepHours: searchConfig.searchStepHours,
      initialSearchWindowDays: searchConfig.initialSearchWindowDays,
      maximumSearchWindowDays: searchConfig.maximumSearchWindowDays,
      searchWindowExpansions: {
        previous: previousResult.expansions ?? 0,
        next: nextResult.expansions ?? 0,
      },
      previousSearchedDays: previousResult.searchedDays ?? null,
      nextSearchedDays: nextResult.searchedDays ?? null,
      searchSource: {
        previous: cached.previous ? "MEMORY_CACHE" : "ROOT_SEARCH",
        next: cached.next ? "MEMORY_CACHE" : "ROOT_SEARCH",
      },
      previousSearchSource: cached.previous ? "MEMORY_CACHE" : "ROOT_SEARCH",
      nextSearchSource: cached.next ? "MEMORY_CACHE" : "ROOT_SEARCH",
      previousEventDistanceDays: previous ? previous.distanceHours / 24 : null,
      nextEventDistanceDays: next ? next.distanceHours / 24 : null,
      previousSearchEndUtc: Number.isFinite(previousResult.searchEndJulianDay)
        ? julianDayToUtc(previousResult.searchEndJulianDay)
        : null,
      nextSearchEndUtc: Number.isFinite(nextResult.searchEndJulianDay)
        ? julianDayToUtc(nextResult.searchEndJulianDay)
        : null,
      rootAlgorithm: "BRENT_WITH_BISECTION_FALLBACK",
      rootIterationsPrevious: previousResult.iterations ?? null,
      rootIterationsNext: nextResult.iterations ?? null,
      previousSearchStatus,
      nextSearchStatus,
      searchWindowExceeded: {
        previous: previousSearchStatus === "SEARCH_WINDOW_EXCEEDED",
        next: nextSearchStatus === "SEARCH_WINDOW_EXCEEDED",
      },
      ephemerisEngine: ephemeris.engine,
      ephemerisVersion: ephemeris.version,
      ephemerisBackend: ephemeris.backend,
      calculatedAtUtc: new Date().toISOString(),
      cacheStatus: cached.previous && cached.next ? "HIT" : cached.previous || cached.next ? "PARTIAL_HIT" : "MISS",
      rootSearchesPerformed: Number(!cached.previous) + Number(!cached.next),
      ephemerisSamples: (previousResult.samples ?? 0) + (nextResult.samples ?? 0),
      elapsedMs: Date.now() - startedAt,
    },
  };
}
