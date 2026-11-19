const BARBAULT_BODIES = Object.freeze([
  "JUPITER",
  "URANO",
  "NETUNO",
  "PLUTAO",
]);

const BARBAULT_REQUIRED_ASPECTS = Object.freeze([
  { bodyA: "JUPITER", bodyB: "URANO", aspect: "SEXTILE", canonicalAngle: 60 },
  { bodyA: "JUPITER", bodyB: "NETUNO", aspect: "TRINE", canonicalAngle: 120 },
  { bodyA: "JUPITER", bodyB: "PLUTAO", aspect: "OPPOSITION", canonicalAngle: 180 },
  { bodyA: "URANO", bodyB: "NETUNO", aspect: "SEXTILE", canonicalAngle: 60 },
  { bodyA: "URANO", bodyB: "PLUTAO", aspect: "TRINE", canonicalAngle: 120 },
  { bodyA: "NETUNO", bodyB: "PLUTAO", aspect: "SEXTILE", canonicalAngle: 60 },
]);

const BODY_ALIASES = Object.freeze({
  JUPITER: "JUPITER",
  URANO: "URANO",
  URANUS: "URANO",
  NETUNO: "NETUNO",
  NEPTUNE: "NETUNO",
  PLUTAO: "PLUTAO",
  PLUTO: "PLUTAO",
});

function normalizedBody(value) {
  const key = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return BODY_ALIASES[key] || key;
}

function normalizedLongitude(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) {
    return null;
  }
  return ((numeric % 360) + 360) % 360;
}

function angularDistance(first, second) {
  const delta = Math.abs(first - second);
  return Math.min(delta, 360 - delta);
}

function pairKey(bodyA, bodyB) {
  return `${bodyA}_${bodyB}`;
}

function orientationFor(longitudes, orbLimit) {
  const jupiter = longitudes.JUPITER;
  const directed = (body) => normalizedLongitude(longitudes[body] - jupiter);
  const matches = (value, expected) => angularDistance(value, expected) <= orbLimit;
  const jupiterToPluto = directed("PLUTAO");

  if (
    matches(directed("URANO"), 300) &&
    matches(directed("NETUNO"), 240) &&
    matches(jupiterToPluto, 180)
  ) {
    return "TEMPLATE_2026";
  }
  if (
    matches(directed("URANO"), 60) &&
    matches(directed("NETUNO"), 120) &&
    matches(jupiterToPluto, 180)
  ) {
    return "MIRRORED";
  }
  return null;
}

export function detectBarbaultBasket(objects, options = {}) {
  const orbLimit = Number.isFinite(Number(options.orbLimit))
    ? Number(options.orbLimit)
    : 6;
  const byBody = new Map();

  for (const item of Array.isArray(objects) ? objects : []) {
    const body = normalizedBody(item?.body ?? item?.name ?? item?.id);
    const longitude = normalizedLongitude(item?.longitude);
    if (BARBAULT_BODIES.includes(body) && longitude !== null) {
      byBody.set(body, longitude);
    }
  }

  const bodyLongitudes = Object.fromEntries(
    BARBAULT_BODIES
      .filter((body) => byBody.has(body))
      .map((body) => [body, byBody.get(body)]),
  );
  const missingBodies = BARBAULT_BODIES.filter((body) => !byBody.has(body));
  const measuredAspects = missingBodies.length === 0
    ? BARBAULT_REQUIRED_ASPECTS.map((required) => {
      const distance = angularDistance(
        byBody.get(required.bodyA),
        byBody.get(required.bodyB),
      );
      const orb = Math.abs(distance - required.canonicalAngle);
      return {
        ...required,
        distance,
        orb,
        withinOrb: orb <= orbLimit,
      };
    })
    : [];
  const individualOrbs = Object.fromEntries(
    measuredAspects.map((item) => [pairKey(item.bodyA, item.bodyB), item.orb]),
  );
  const aspectDistances = Object.fromEntries(
    measuredAspects.map((item) => [pairKey(item.bodyA, item.bodyB), item.distance]),
  );
  const orbs = measuredAspects.map((item) => item.orb);
  const sumOrb = orbs.reduce((total, value) => total + value, 0);
  const meanOrb = orbs.length ? sumOrb / orbs.length : null;
  const rmsOrb = orbs.length
    ? Math.sqrt(orbs.reduce((total, value) => total + (value ** 2), 0) / orbs.length)
    : null;
  const maximumOrb = orbs.length ? Math.max(...orbs) : null;
  const detected = missingBodies.length === 0 &&
    measuredAspects.length === BARBAULT_REQUIRED_ASPECTS.length &&
    measuredAspects.every((item) => item.withinOrb);

  return {
    type: "BARBAULT_BASKET",
    label: "Cesta de Barbault",
    status: detected ? "DETECTED" : "NOT_DETECTED",
    governance: "VISUAL_ONLY / NON_GOVERNED",
    methodologicalStatus: "APPROVED_METHOD_CONTRACT",
    technicalValidationStatus: "PENDING_VALIDATION",
    configurationType: "NAMED_MUNDANE_CONFIGURATION",
    nature: "MULTI_CYCLE_SLOW_PLANET_PATTERN",
    bodies: [...BARBAULT_BODIES],
    missingBodies,
    requiredAspects: measuredAspects,
    bodyLongitudes,
    aspectDistances,
    individualOrbs,
    maximumOrb,
    rmsOrb,
    meanOrb,
    sumOrb: orbs.length ? sumOrb : null,
    orientation: detected ? orientationFor(bodyLongitudes, orbLimit) : null,
    visualOrb: orbLimit,
  };
}

export { BARBAULT_BODIES, BARBAULT_REQUIRED_ASPECTS };
