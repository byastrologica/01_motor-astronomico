import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateStationaryState,
  classifyMotion,
  fallbackMotionState,
  motionSign,
  refineBracketedRoot,
} from "../src/stationary-state/stationary-state.js";
import { clearStationEventCache, stationEventCacheSize, storeStationEvent } from "../src/stationary-state/station-event-cache.js";
import { STATIONARY_PROFILE } from "../src/stationary-state/stationary-profile.js";

const station = (transition, distanceHours) => ({ transition, distanceHours });

test("classifica D e R fora do threshold", () => {
  assert.equal(classifyMotion({ speed: 0.2, thresholdArcsecPerDay: 300 }).motionState, "D");
  assert.equal(classifyMotion({ speed: -0.2, thresholdArcsecPerDay: 300 }).motionState, "R");
});

test("classifica SD e SR pela transicao da estacao associada", () => {
  assert.equal(classifyMotion({
    speed: 0.01,
    thresholdArcsecPerDay: 300,
    previous: station("R_TO_D", 2),
    next: station("D_TO_R", 20),
  }).motionState, "SD");
  assert.equal(classifyMotion({
    speed: -0.01,
    thresholdArcsecPerDay: 300,
    previous: station("R_TO_D", 20),
    next: station("D_TO_R", 2),
  }).motionState, "SR");
});

test("velocidade zero usa a transicao, nao o sinal", () => {
  assert.equal(motionSign(0), "ZERO");
  assert.equal(classifyMotion({
    speed: 0,
    thresholdArcsecPerDay: 300,
    previous: station("R_TO_D", 1),
    next: station("D_TO_R", 10),
  }).motionState, "SD");
  assert.equal(classifyMotion({
    speed: 0,
    thresholdArcsecPerDay: 300,
    previous: station("D_TO_R", 1),
    next: station("R_TO_D", 10),
  }).motionState, "SR");
});

test("ausencia de uma estacao degrada para D/R", () => {
  assert.equal(classifyMotion({
    speed: -0.01,
    thresholdArcsecPerDay: 300,
    previous: station("D_TO_R", 1),
    next: null,
  }).motionState, "R");
  assert.equal(fallbackMotionState(0.01), "D");
});

test("fronteiras do threshold usam comparacao inclusiva", () => {
  const threshold = 300;
  const deg = threshold / 3600;
  const previous = station("R_TO_D", 1);
  const next = station("D_TO_R", 10);
  assert.equal(classifyMotion({ speed: deg - 1e-10, thresholdArcsecPerDay: threshold, previous, next }).motionState, "SD");
  assert.equal(classifyMotion({ speed: deg, thresholdArcsecPerDay: threshold, previous, next }).motionState, "SD");
  assert.equal(classifyMotion({ speed: deg + 1e-10, thresholdArcsecPerDay: threshold, previous, next }).motionState, "D");
});

test("Brent refina brackets nas duas direcoes", () => {
  const positiveToNegative = refineBracketedRoot({
    startJulianDay: 99,
    endJulianDay: 101,
    speedAt: (time) => 100 - time,
  });
  const negativeToPositive = refineBracketedRoot({
    startJulianDay: 199,
    endJulianDay: 201,
    speedAt: (time) => time - 200,
  });
  assert.equal(positiveToNegative.status, "COMPUTED");
  assert.ok(Math.abs(positiveToNegative.julianDay - 100) <= 1 / 86400);
  assert.equal(negativeToPositive.status, "COMPUTED");
  assert.ok(Math.abs(negativeToPositive.julianDay - 200) <= 1 / 86400);
});

test("raiz no inicio e fim do bracket e erro de efemeride", () => {
  assert.equal(refineBracketedRoot({ startJulianDay: 1, endJulianDay: 2, speedAt: (time) => time - 1 }).julianDay, 1);
  assert.equal(refineBracketedRoot({ startJulianDay: 1, endJulianDay: 2, speedAt: (time) => time - 2 }).julianDay, 2);
  assert.equal(refineBracketedRoot({ startJulianDay: 1, endJulianDay: 2, speedAt: () => Number.NaN }).status, "EPHEMERIS_ERROR");
});

test("cache de eventos deduplica a mesma raiz", () => {
  clearStationEventCache();
  storeStationEvent("MERCURIO", { julianDay: 100, transition: "D_TO_R" });
  storeStationEvent("MERCURIO", { julianDay: 100 + 0.5 / 86400, transition: "D_TO_R" });
  assert.equal(stationEventCacheSize(), 1);
  clearStationEventCache();
});

test("bracket sem mudanca de sinal e rejeitado", () => {
  const result = refineBracketedRoot({
    startJulianDay: 1,
    endJulianDay: 2,
    speedAt: () => 1,
  });
  assert.equal(result.status, "ROOT_WITHOUT_CONFIRMED_TRANSITION");
});

test("limite de iteracoes interrompe refinamento sem inventar raiz", () => {
  const profile = {
    ...STATIONARY_PROFILE,
    maximumRootIterations: 1,
    stationRootToleranceSeconds: 1e-9,
    stationRootSpeedToleranceDegPerDay: 1e-15,
  };
  const result = refineBracketedRoot({
    startJulianDay: 0,
    endJulianDay: 2,
    speedAt: (time) => (time ** 3) - 2,
    profile,
  });
  assert.equal(result.status, "ROOT_REFINEMENT_MAX_ITERATIONS");
});

test("timeout degrada para D ou R sem falso estado estacionario", () => {
  const result = calculateStationaryState({
    bodyId: "MERCURIO",
    instantJulianDay: 2450000,
    speedLongitudeDegPerDay: 0.2,
    speedAt: () => 0.2,
    ephemeris: { engine: "TEST", version: "1", backend: "TEST" },
    allBodiesDeadline: 0,
  });
  assert.equal(result.motion.motionState, "D");
  assert.equal(result.motion.stationCalculationStatus, "TIMEOUT");
  assert.equal(result.motion.stationaryClassificationAvailable, false);
});

test("erro de efemeride e degradado sem inferir estacionariedade", () => {
  const result = calculateStationaryState({
    bodyId: "MERCURIO",
    instantJulianDay: 2450000,
    speedLongitudeDegPerDay: -0.2,
    speedAt: () => Number.NaN,
    ephemeris: { engine: "TEST", version: "1", backend: "TEST" },
  });
  assert.equal(result.motion.motionState, "R");
  assert.equal(result.motion.stationaryClassificationAvailable, false);
  assert.equal(result.motion.stationCalculationStatus, "PARTIAL");
});

test("todos os corpos elegiveis usam o mesmo contrato D R SD SR", () => {
  for (const [bodyId, bodyProfile] of Object.entries(STATIONARY_PROFILE.eligibleBodies)) {
    const threshold = bodyProfile.stationaryThresholdArcsecPerDay;
    assert.equal(classifyMotion({ speed: 1, thresholdArcsecPerDay: threshold }).motionState, "D", bodyId);
    assert.equal(classifyMotion({ speed: -1, thresholdArcsecPerDay: threshold }).motionState, "R", bodyId);
    assert.equal(classifyMotion({ speed: 0, thresholdArcsecPerDay: threshold, previous: station("R_TO_D", 1), next: station("D_TO_R", 10) }).motionState, "SD", bodyId);
    assert.equal(classifyMotion({ speed: 0, thresholdArcsecPerDay: threshold, previous: station("D_TO_R", 1), next: station("R_TO_D", 10) }).motionState, "SR", bodyId);
  }
});

test("perfil contem somente os oito corpos homologados", () => {
  assert.deepEqual(Object.keys(STATIONARY_PROFILE.eligibleBodies), [
    "MERCURIO", "VENUS", "MARTE", "JUPITER", "SATURNO", "URANO", "NETUNO", "PLUTAO",
  ]);
});
