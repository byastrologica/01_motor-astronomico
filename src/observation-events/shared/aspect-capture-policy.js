// Versioned policy distributed identically to the four independent services.
// V2 harmonizes septile and declination capture; activation and pair/type blocks remain independent.
import { isAngularRelationAllowed } from "./angular-aspect-policy.js";
export const CAPTURE_POLICY_VERSION = "CAPTURE_TABLE_2026_V3";
export const HARMONIZED_CAPTURE_WINDOWS = Object.freeze({ SEPTILE: 2, PARALLEL: 1.3, CONTRAPARALLEL: 1.3 });
export const DEFERRED_CAPTURE_POLICIES = Object.freeze([]);
const wide = new Set(["SOL", "LUA", "MERCURIO", "VENUS", "MARTE", "JUPITER", "SATURNO", "URANO", "NETUNO", "PLUTAO", "QUIRON", "ASC", "MC", "DC", "IC"]);
const stars = new Set(["FOMALHAUT", "ALDEBARAN", "ANTARES", "REGULUS", "SIRIUS", "SPICA", "ALGOL"]);
const eclipses = new Set(["ECLIPSE_SOL_PRE_NATAL", "ECLIPSE_LUA_PRE_NATAL", "ECLIPSE_SOL_POS_NATAL", "ECLIPSE_LUA_POS_NATAL"]);
const asteroids = new Set(["CERES", "PALLAS", "JUNO", "VESTA"]);
const derived = new Set(["NODO_NORTE", "NODO_SUL", "FORTUNA", "LILITH_MEDIA", "LILITH_VERDADEIRA", ...eclipses]);
const narrow = new Set(["NODO_NORTE", "NODO_SUL", "FORTUNA", "LILITH_MEDIA", ...stars, ...eclipses, ...asteroids]);
const angles = new Set(["ASC", "MC", "DC", "IC"]);
const planets = new Set([...wide].filter(id => !angles.has(id) && id !== "QUIRON"));
const anchors = new Set([...planets, "ASC", "MC"]);
const major = new Set(["CONJUNCTION", "OPPOSITION", "SQUARE", "TRINE", "SEXTILE"]);
export function captureWindowForBody(body, type) {
  if (!wide.has(body) && !narrow.has(body)) return null;
  if (type in HARMONIZED_CAPTURE_WINDOWS) {
    if (eclipses.has(body) || (type === "SEPTILE" && stars.has(body))) return null;
    return HARMONIZED_CAPTURE_WINDOWS[type];
  }
  const broad = wide.has(body);
  if (["CONJUNCTION", "OPPOSITION", "SQUARE", "TRINE"].includes(type)) return broad ? 10 : 5;
  if (type === "SEXTILE") return broad ? 6 : 3;
  if (["SEMISEXTILE", "QUINCUNX", "SEMISQUARE", "SESQUIQUADRATE"].includes(type)) return broad ? 3 : 1.5;
  if (["QUINTILE", "BIQUINTILE"].includes(type)) return broad ? 2 : 1;
  return null;
}
export function pairCaptureWindow(row) {
  const type = row.aspect || row.relationship;
  const a = captureWindowForBody(row.bodyA, type), b = captureWindowForBody(row.bodyB, type);
  if (a === undefined || b === undefined) return undefined;
  return Number.isFinite(a) && Number.isFinite(b) ? Math.min(a, b) : null;
}
// An already classified ACTIVE remains eligible within harmonized families.
// Never bypass pair/type blocks or unsupported body/type combinations.
export function effectiveCaptureWindow(row, nominal = pairCaptureWindow(row)) {
  const type = row.aspect || row.relationship;
  if (!Number.isFinite(nominal) || !(type in HARMONIZED_CAPTURE_WINDOWS) || row.status !== "ACTIVE") return nominal;
  const orb = typeof row.orbDegrees === "number" ? row.orbDegrees : row.orb;
  return Math.max(nominal, Number.isFinite(row.allowedOrb) ? row.allowedOrb : nominal, Number.isFinite(orb) && orb >= 0 ? orb : nominal);
}
export function relationKey(row) {
  return [...[row.bodyA, row.bodyB].sort(), row.aspect || row.relationship].join("__");
}
export function isMethodologicallyAllowed(row, presentation = false) {
  if (!isAngularRelationAllowed(row)) return false;
  const a = row.bodyA, b = row.bodyB, type = row.aspect || row.relationship;
  if (!a || !b || a === b) return false;
  if (angles.has(a) && angles.has(b)) return false;
  if (derived.has(a) && derived.has(b)) return false;
  if (stars.has(a) && stars.has(b)) return false;
  for (const [body, other] of [[a, b], [b, a]]) {
    if (asteroids.has(body) && !anchors.has(other)) return false;
    if (eclipses.has(body) && (!planets.has(other) && !angles.has(other))) return false;
    if (eclipses.has(body) && !["CONJUNCTION", "OPPOSITION"].includes(type)) return false;
    if (stars.has(body) && !["CONJUNCTION", "PARALLEL", "CONTRAPARALLEL"].includes(type)) return false;
    // Existing governed SOP policy: asteroid minor/keplerian/septile types are not emitted.
    if (presentation && asteroids.has(body) && !major.has(type) && !["PARALLEL", "CONTRAPARALLEL"].includes(type)) return false;
  }
  return true;
}
export function isCapturedForRanking(row) {
  return isCaptured(row, false);
}
export function isCapturedForPresentation(row) {
  return isCaptured(row, true);
}
function isCaptured(row, presentation) {
  if (!isMethodologicallyAllowed(row, presentation)) return false;
  const orb = typeof row.orbDegrees === "number" ? row.orbDegrees : row.orb;
  if (!Number.isFinite(orb) || orb < 0) return false;
  const window = effectiveCaptureWindow(row);
  return window === undefined || (Number.isFinite(window) && orb <= window);
}
