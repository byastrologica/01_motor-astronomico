export const ANGULAR_ASPECT_POLICY_VERSION = "ANGULAR_ASPECT_POLICY_V1";
export function angularContextFromChart(chart = {}) {
  const identity = chart.IDENTITY || chart.input || {};
  const geometry = chart.NATAL_GEOMETRY || chart.geometry || chart;
  const objects = [...(geometry.objects || []), ...(geometry.aspectableObjects || []), ...(geometry.geometry?.objects || [])];
  const longitudes = {}, firstMagnitudeStars = [];
  for (const object of objects) {
    const id = object.id || object.body;
    if (id && Number.isFinite(object.longitude)) longitudes[id] = object.longitude;
    if (object.firstMagnitude === true || object.magnitudeClass === "FIRST_MAGNITUDE") firstMagnitudeStars.push(id);
  }
  for (const cusp of geometry.houses || chart.houses || []) {
    const id = {1:"ASC",4:"IC",7:"DC",10:"MC"}[cusp.house ?? cusp.number];
    if (id && Number.isFinite(cusp.longitude)) longitudes[id] = cusp.longitude;
  }
  return {birthTimeExact: identity.birthTimeKnown === true && identity.timePrecision === "EXACT", longitudes, firstMagnitudeStars};
}
const angles = new Set(["ASC", "MC", "DC", "DSC", "IC"]);
const primary = new Set(["ASC", "MC"]);
const planets = new Set(["SOL", "LUA", "MERCURIO", "VENUS", "MARTE", "JUPITER", "SATURNO", "URANO", "NETUNO", "PLUTAO"]);
const stars = new Set(["FOMALHAUT", "ALDEBARAN", "ANTARES", "REGULUS", "SIRIUS", "SPICA", "ALGOL"]);
const major = new Set(["CONJUNCTION", "SEXTILE", "SQUARE", "TRINE", "OPPOSITION"]);
export function isAngularRelationAllowed(row) {
  const {bodyA:a, bodyB:b} = row;
  if (!angles.has(a) && !angles.has(b)) return true;
  const angle = angles.has(a) ? a : b;
  const other = angle === a ? b : a;
  const type = row.aspect || row.relationship;
  if (planets.has(other)) return primary.has(angle) && major.has(type);
  const context = row.angularContext || {};
  if (context.birthTimeExact !== true) return false;
  const orb = row.orbDegrees ?? row.orb;
  if (!Number.isFinite(orb) || orb < 0) return false;
  if (String(other).startsWith("ECLIPSE_")) {
    return ["CONJUNCTION", "OPPOSITION"].includes(type) && orb <= 2;
  }
  if (!stars.has(other) || !primary.has(angle) || type !== "CONJUNCTION") return false;
  const lonA = context.longitudes?.[a], lonB = context.longitudes?.[b];
  if (!Number.isFinite(lonA) || !Number.isFinite(lonB)) return false;
  const sign = lon => Math.floor((((lon % 360) + 360) % 360) / 30);
  if (sign(lonA) !== sign(lonB)) return false;
  const limit = context.firstMagnitudeStars?.includes(other) ? 1.5 : 1;
  return orb <= limit;
}
