import { detectBarbaultBasket } from "./skynow-geometry.js?v=20260717-geometry-001";
import {
  buildGeometryClusterPresentation,
  canonicalRelationKey,
} from "./skynow-geometry-cluster.js?v=20260921-ontology-freeze-007";

export const VISUAL_GEOMETRY_BODIES = Object.freeze([
  "SOL", "LUA", "MERCURIO", "VENUS", "MARTE",
  "JUPITER", "SATURNO", "URANO", "NETUNO", "PLUTAO",
]);

export const VISUAL_GEOMETRY_ORBS_V1 = Object.freeze({
  CONJUNCTION: 8,
  CONJUNCTION_LUMINARY: 10,
  OPPOSITION: 8,
  OPPOSITION_LUMINARY: 10,
  TRINE: 8,
  SQUARE: 8,
  SEXTILE: 6,
  QUINCUNX: 3,
  MAX_AVERAGE_ORB: 5,
});

const ASPECT_ANGLES = Object.freeze({
  CONJUNCTION: 0,
  OPPOSITION: 180,
  TRINE: 120,
  SQUARE: 90,
  SEXTILE: 60,
  QUINCUNX: 150,
});

const ASPECT_ALIASES = Object.freeze({
  CONJUNCTION: "CONJUNCTION", CONJUNCAO: "CONJUNCTION",
  OPPOSITION: "OPPOSITION", OPOSICAO: "OPPOSITION",
  TRINE: "TRINE", TRIGONO: "TRINE",
  SQUARE: "SQUARE", QUADRATURA: "SQUARE",
  SEXTILE: "SEXTILE", SEXTIL: "SEXTILE",
  QUINCUNX: "QUINCUNX", QUINCUNCIO: "QUINCUNX",
});

const BODY_LABELS = Object.freeze({
  SOL: "Sol", LUA: "Lua", MERCURIO: "Mercúrio", VENUS: "Vênus",
  MARTE: "Marte", JUPITER: "Júpiter", SATURNO: "Saturno",
  URANO: "Urano", NETUNO: "Netuno", PLUTAO: "Plutão",
});

function normalizedKey(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function normalizedAspect(value) {
  const key = normalizedKey(value);
  return ASPECT_ALIASES[key] || key;
}

function normalizedLongitude(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? ((numeric % 360) + 360) % 360 : null;
}

function angularDistance(first, second) {
  const delta = Math.abs(first - second) % 360;
  return Math.min(delta, 360 - delta);
}

function objectBody(item) {
  return normalizedKey(item?.body ?? item?.id ?? item?.name);
}

function bodyLabel(body) {
  return BODY_LABELS[body] || body;
}

function resolveRelation(longitudes, bodyA, bodyB, aspect, orbResolver=null) {
  const first = longitudes.get(bodyA);
  const second = longitudes.get(bodyB);
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  const orb = Math.abs(angularDistance(first, second) - ASPECT_ANGLES[aspect]);
  const hasLuminary = [bodyA, bodyB].some((body) => ["SOL", "LUA"].includes(body));
  const limit = orbResolver?orbResolver(bodyA,bodyB,aspect):aspect === "CONJUNCTION"
    ? (hasLuminary ? VISUAL_GEOMETRY_ORBS_V1.CONJUNCTION_LUMINARY : VISUAL_GEOMETRY_ORBS_V1.CONJUNCTION)
    : aspect === "OPPOSITION"
      ? (hasLuminary ? VISUAL_GEOMETRY_ORBS_V1.OPPOSITION_LUMINARY : VISUAL_GEOMETRY_ORBS_V1.OPPOSITION)
      : VISUAL_GEOMETRY_ORBS_V1[aspect];
  return orb <= limit ? { bodyA, bodyB, aspect, orb } : null;
}

function averageOrb(relations) {
  return relations.length
    ? relations.reduce((sum, item) => sum + item.orb, 0) / relations.length
    : Number.POSITIVE_INFINITY;
}

function sharedBody(firstPair, secondPair, excludedBodies = []) {
  return firstPair.find((body) => secondPair.includes(body) && !excludedBodies.includes(body)) || null;
}

function structureRoles(geometryId, relations, metadata = {}) {
  if (geometryId === "T_SQUARE") {
    const opposition = relations.find((item) => item.aspect === "OPPOSITION");
    const squares = relations.filter((item) => item.aspect === "SQUARE");
    const base = opposition ? [opposition.bodyA, opposition.bodyB] : [];
    return {
      oppositionBase: base,
      apex: squares.length === 2
        ? sharedBody([squares[0].bodyA, squares[0].bodyB], [squares[1].bodyA, squares[1].bodyB], base)
        : null,
      squareArms: squares.map((item) => [item.bodyA, item.bodyB]),
    };
  }
  if (geometryId === "YOD") {
    const sextile = relations.find((item) => item.aspect === "SEXTILE");
    const quincunxes = relations.filter((item) => item.aspect === "QUINCUNX");
    const base = sextile ? [sextile.bodyA, sextile.bodyB] : [];
    return {
      sextileBase: base,
      apex: quincunxes.length === 2
        ? sharedBody([quincunxes[0].bodyA, quincunxes[0].bodyB], [quincunxes[1].bodyA, quincunxes[1].bodyB], base)
        : null,
      quincunxArms: quincunxes.map((item) => [item.bodyA, item.bodyB]),
    };
  }
  if (geometryId === "GRAND_TRINE") {
    return {
      vertices: [...new Set(relations.flatMap((item) => [item.bodyA, item.bodyB]))],
      trineEdges: relations.map((item) => [item.bodyA, item.bodyB]),
    };
  }
  if (geometryId === "KITE") {
    const opposition = relations.find((item) => item.aspect === "OPPOSITION");
    return {
      grandTrine: [...new Set(relations.filter((item) => item.aspect === "TRINE").flatMap((item) => [item.bodyA, item.bodyB]))],
      focus: metadata.focusBody || opposition?.bodyA || null,
      oppositionAxis: opposition ? [opposition.bodyA, opposition.bodyB] : [],
      sextileArms: relations.filter((item) => item.aspect === "SEXTILE").map((item) => [item.bodyA, item.bodyB]),
    };
  }
  if (geometryId === "MYSTIC_RECTANGLE") {
    return {
      oppositionAxes: relations.filter((item) => item.aspect === "OPPOSITION").map((item) => [item.bodyA, item.bodyB]),
      harmonicLinks: relations.filter((item) => ["TRINE", "SEXTILE"].includes(item.aspect)).map((item) => ({ pair: [item.bodyA, item.bodyB], aspect: item.aspect })),
    };
  }
  return {};
}

function makeRecord(name, geometryId, relations, metadata = {}, enforceAverage = true) {
  const planets = [...new Set(relations.flatMap((item) => [item.bodyA, item.bodyB]))].sort();
  const mean = averageOrb(relations);
  if (enforceAverage && mean > VISUAL_GEOMETRY_ORBS_V1.MAX_AVERAGE_ORB) return null;
  return {
    name,
    labelPtBr: geometryId === "KITE" ? `Pipa com ${bodyLabel(metadata.focusBody)}` : {
      GRAND_TRINE: "Grande Trígono",
      T_SQUARE: "Cruz em T",
      YOD: "Yod",
      MYSTIC_RECTANGLE: "Retângulo Místico",
    }[geometryId] || name,
    geometryId,
    planets,
    aspects: relations,
    averageOrb: mean,
    key: metadata.key || `${geometryId}|${planets.join("|")}`,
    structureRoles: structureRoles(geometryId, relations, metadata),
    ...metadata,
  };
}

export function detectVisualGeometries(objects, options = {}) {
  // One immutable sky per detector invocation. Reuse identical directed
  // relations across triangles/quadrilaterals without sharing between dates.
  const relationCache=[];
  const bodyIndex=Object.fromEntries(VISUAL_GEOMETRY_BODIES.map((body,i)=>[body,i]));
  const aspectIndex={CONJUNCTION:0,OPPOSITION:1,TRINE:2,SQUARE:3,SEXTILE:4,QUINCUNX:5};
  const relationFor=(longitudes,a,b,aspect)=>{
    const key=(bodyIndex[a]*10+bodyIndex[b])*6+aspectIndex[aspect];
    if(relationCache[key]===undefined)relationCache[key]=resolveRelation(longitudes,a,b,aspect,options.orbResolver);
    return relationCache[key];
  };
  const includeBarbault = options.includeBarbault !== false;
  const longitudes = new Map();
  for (const item of Array.isArray(objects) ? objects : []) {
    const body = objectBody(item);
    const longitude = normalizedLongitude(item?.longitude);
    if (VISUAL_GEOMETRY_BODIES.includes(body) && longitude !== null && !longitudes.has(body)) {
      longitudes.set(body, longitude);
    }
  }
  const bodies = VISUAL_GEOMETRY_BODIES.filter((body) => longitudes.has(body));
  const records = [];
  const push = (record) => {
    if (record && !records.some((item) => item.key === record.key)) records.push(record);
  };

  for (let a = 0; a < bodies.length - 2; a += 1) {
    for (let b = a + 1; b < bodies.length - 1; b += 1) {
      for (let c = b + 1; c < bodies.length; c += 1) {
        const trio = [bodies[a], bodies[b], bodies[c]];
        const trines = [
          relationFor(longitudes, trio[0], trio[1], "TRINE"),
          relationFor(longitudes, trio[0], trio[2], "TRINE"),
          relationFor(longitudes, trio[1], trio[2], "TRINE"),
        ];
        if (trines.every(Boolean)) push(makeRecord("GRANDE TRIGONO", "GRAND_TRINE", trines));
        for (const apex of trio) {
          const base = trio.filter((body) => body !== apex);
          const tSquare = [
            relationFor(longitudes, base[0], base[1], "OPPOSITION"),
            relationFor(longitudes, apex, base[0], "SQUARE"),
            relationFor(longitudes, apex, base[1], "SQUARE"),
          ];
          if (tSquare.every(Boolean)) push(makeRecord("CRUZ EM T", "T_SQUARE", tSquare));
          const yod = [
            relationFor(longitudes, base[0], base[1], "SEXTILE"),
            relationFor(longitudes, apex, base[0], "QUINCUNX"),
            relationFor(longitudes, apex, base[1], "QUINCUNX"),
          ];
          if (yod.every(Boolean)) push(makeRecord("YOD", "YOD", yod));
        }
      }
    }
  }

  for (const grandTrine of records.filter((item) => item.geometryId === "GRAND_TRINE")) {
    for (const focusBody of bodies.filter((body) => !grandTrine.planets.includes(body))) {
      for (const oppositionTarget of grandTrine.planets) {
        const opposition = relationFor(longitudes, focusBody, oppositionTarget, "OPPOSITION");
        const sextiles = grandTrine.planets
          .filter((body) => body !== oppositionTarget)
          .map((body) => relationFor(longitudes, focusBody, body, "SEXTILE"));
        if (!opposition || !sextiles.every(Boolean)) continue;
        const relations = [...grandTrine.aspects, opposition, ...sextiles];
        push(makeRecord(
          `PIPA COM ${bodyLabel(focusBody).toLocaleUpperCase("pt-BR")}`,
          "KITE",
          relations,
          {
            focusBody,
            oppositionTarget,
            derivedFrom: grandTrine.key,
            key: `KITE|${grandTrine.planets.join("|")}|${focusBody}`,
          },
          false,
        ));
      }
    }
  }

  for (let a = 0; a < bodies.length - 3; a += 1) {
    for (let b = a + 1; b < bodies.length - 2; b += 1) {
      for (let c = b + 1; c < bodies.length - 1; c += 1) {
        for (let d = c + 1; d < bodies.length; d += 1) {
          const quad = [bodies[a], bodies[b], bodies[c], bodies[d]];
          const pairings = [
            [[quad[0], quad[1]], [quad[2], quad[3]]],
            [[quad[0], quad[2]], [quad[1], quad[3]]],
            [[quad[0], quad[3]], [quad[1], quad[2]]],
          ];
          for (const [first, second] of pairings) {
            const oppositions = [
              relationFor(longitudes, first[0], first[1], "OPPOSITION"),
              relationFor(longitudes, second[0], second[1], "OPPOSITION"),
            ];
            if (!oppositions.every(Boolean)) continue;
            const soft = quad.flatMap((body, index) => quad.slice(index + 1).map((other) =>
              relationFor(longitudes, body, other, "TRINE") || relationFor(longitudes, body, other, "SEXTILE")
            )).filter(Boolean);
            if (soft.length === 4 && soft.filter((item) => item.aspect === "TRINE").length === 2 && soft.filter((item) => item.aspect === "SEXTILE").length === 2) {
              push(makeRecord("RETANGULO MISTICO", "MYSTIC_RECTANGLE", [...oppositions, ...soft.slice(0, 4)]));
            }
          }
        }
      }
    }
  }

  if (includeBarbault) {
    const barbault = detectBarbaultBasket(objects);
    if (barbault.status === "DETECTED") {
      const relations = barbault.requiredAspects.map((item) => ({
        bodyA: item.bodyA,
        bodyB: item.bodyB,
        aspect: item.aspect,
        orb: item.orb,
      }));
      push({
        name: "CESTA DE BARBAULT",
        labelPtBr: "Cesta de Barbault",
        geometryId: "BARBAULT_BASKET",
        planets: [...barbault.bodies],
        aspects: relations,
        averageOrb: barbault.meanOrb,
        key: `BARBAULT_BASKET|${barbault.orientation || "UNSPECIFIED"}`,
        structureRoles: {},
        details: barbault,
      });
    }
  }
  return records;
}

function governedRelationMap(aspects) {
  const statusRank = { ACTIVE: 2, NON_ACTIVE: 1 };
  const map = new Map();
  for (const item of Array.isArray(aspects) ? aspects : []) {
    const aspect = normalizedAspect(item?.aspectType ?? item?.aspect);
    const key = canonicalRelationKey(item?.bodyA, aspect, item?.bodyB);
    const status = String(item?.status || "").toUpperCase();
    const existing = map.get(key);
    if (!existing || (statusRank[status] || 0) > (statusRank[existing.status] || 0)) {
      map.set(key, { ...item, aspect, status });
    }
  }
  return map;
}

function supportFor(record, relationMap) {
  const requiredRelations = record.aspects.map((relation) => {
    const relationKey = canonicalRelationKey(relation.bodyA, relation.aspect, relation.bodyB);
    const governed = relationMap.get(relationKey);
    const supportStatus = governed?.status === "ACTIVE"
      ? "ACTIVE"
      : governed
        ? "LATENT_OR_NON_ACTIVE"
        : "MISSING_FROM_GOVERNED_ASPECTARIUM";
    return { ...relation, relationKey, supportStatus, governedAspectId: governed?.aspectId || null };
  });
  const activeRequiredRelationCount = requiredRelations.filter((item) => item.supportStatus === "ACTIVE").length;
  const latentRequiredRelationCount = requiredRelations.filter((item) => item.supportStatus === "LATENT_OR_NON_ACTIVE").length;
  const missingRequiredRelationCount = requiredRelations.filter((item) => item.supportStatus === "MISSING_FROM_GOVERNED_ASPECTARIUM").length;
  const governedSupportStatus = activeRequiredRelationCount === requiredRelations.length
    ? "FULLY_GOVERNED"
    : activeRequiredRelationCount + latentRequiredRelationCount > 0
      ? "PARTIALLY_GOVERNED"
      : "VISUAL_ONLY_UNCORROBORATED";
  return {
    governedSupportStatus,
    requiredRelationCount: requiredRelations.length,
    activeRequiredRelationCount,
    latentRequiredRelationCount,
    missingRequiredRelationCount,
    requiredRelations,
  };
}

function presentationTier(member) {
  if (member.visualAnchor) return "TIER_1_INDEPENDENT_ANCHOR";
  if (member.geometryRole === "COMPOSITE_TOP_LEVEL") return "TIER_2_SECONDARY_COMPOSITE";
  if (member.geometryRole === "CONSTITUTIVE_NESTED_GEOMETRY") return "TIER_4_CONSTITUTIVE_SUBSTRUCTURE";
  return "TIER_3_RELATED_GEOMETRY";
}

export function buildVisualGeometryContract({
  objects,
  governedAspects = [],
  birthTimeKnown = true,
  includeBarbault = true,
} = {}) {
  if (!birthTimeKnown) {
    return {
      detections: {
        schemaVersion: "VISUAL_GEOMETRY_DETECTION_V1",
        methodVersion: "FIGURE_ORBS_V1",
        governanceStatus: "VISUAL_ONLY_NON_GOVERNED",
        status: "NOT_APPLICABLE_HD",
        reason: "UNKNOWN_BIRTH_TIME",
        eligibleBodies: [...VISUAL_GEOMETRY_BODIES],
        orbPolicy: { ...VISUAL_GEOMETRY_ORBS_V1 },
        detections: [],
      },
      hierarchy: {
        schemaVersion: "VISUAL_GEOMETRY_HIERARCHY_V1",
        status: "NOT_APPLICABLE_HD",
        reason: "UNKNOWN_BIRTH_TIME",
        geometries: [],
        relationships: [],
        clusters: [],
        summary: {
          totalDetectedFigures: 0,
          totalIndependentSystems: 0,
          fullyGovernedFigures: 0,
          partiallyGovernedFigures: 0,
          uncorroboratedFigures: 0,
        },
      },
    };
  }

  const records = detectVisualGeometries(objects, { includeBarbault });
  const relationMap = governedRelationMap(governedAspects);
  const supportBySourceKey = new Map(records.map((record) => [record.key, supportFor(record, relationMap)]));
  const presentation = buildGeometryClusterPresentation(records);
  const geometryById = new Map(presentation.canonicalDetectedGeometries.map((item) => [item.geometryId, item]));
  const recordByKey = new Map(records.map((item) => [item.key, item]));

  const geometries = presentation.canonicalDetectedGeometries.map((geometry) => {
    const sourceKey = geometry.sourceKeys.find((key) => recordByKey.has(key));
    const record = recordByKey.get(sourceKey);
    const member = presentation.geometryClusters.flatMap((cluster) => cluster.members).find((item) => item.geometryId === geometry.geometryId);
    return {
      ...geometry,
      labelPtBr: record?.labelPtBr || geometry.label,
      structureRoles: record?.structureRoles || geometry.roles || {},
      focusBody: record?.focusBody || null,
      support: supportBySourceKey.get(sourceKey),
      presentationTier: presentationTier(member),
      clusterRank: member?.clusterRank || null,
      clusterRole: member?.clusterRole || null,
    };
  });
  const enrichedById = new Map(geometries.map((item) => [item.geometryId, item]));
  const clusters = presentation.geometryClusters.map((cluster) => ({
    ...cluster,
    members: cluster.members.map((member) => ({
      ...member,
      labelPtBr: enrichedById.get(member.geometryId)?.labelPtBr || member.label,
      support: enrichedById.get(member.geometryId)?.support || null,
      presentationTier: presentationTier(member),
    })),
  }));
  const fullyGovernedFigures = geometries.filter((item) => item.support.governedSupportStatus === "FULLY_GOVERNED").length;
  const partiallyGovernedFigures = geometries.filter((item) => item.support.governedSupportStatus === "PARTIALLY_GOVERNED").length;
  const uncorroboratedFigures = geometries.filter((item) => item.support.governedSupportStatus === "VISUAL_ONLY_UNCORROBORATED").length;

  return {
    detections: {
      schemaVersion: "VISUAL_GEOMETRY_DETECTION_V1",
      methodVersion: "FIGURE_ORBS_V1",
      governanceStatus: "VISUAL_ONLY_NON_GOVERNED",
      status: "COMPUTED",
      eligibleBodies: [...VISUAL_GEOMETRY_BODIES],
      orbPolicy: { ...VISUAL_GEOMETRY_ORBS_V1 },
      detections: records.map((record) => ({
        sourceKey: record.key,
        geometryType: record.geometryId,
        labelPtBr: record.labelPtBr,
        bodies: [...record.planets],
        structureRoles: record.structureRoles,
        focusBody: record.focusBody || null,
        derivedFromSourceKey: record.derivedFrom || null,
        requiredRelations: record.aspects.map((item) => ({ ...item })),
        meanOrb: record.averageOrb,
        technicalDetails: record.details || null,
        support: supportBySourceKey.get(record.key),
      })),
    },
    hierarchy: {
      schemaVersion: "VISUAL_GEOMETRY_HIERARCHY_V1",
      status: "COMPUTED",
      governance: presentation.governance,
      geometries,
      relationships: presentation.geometryRelationships,
      clusters,
      summary: {
        totalDetectedFigures: geometries.length,
        totalIndependentSystems: clusters.length,
        primaryClusterAnchors: clusters.length,
        secondaryCompositeFigures: geometries.filter((item) => item.presentationTier === "TIER_2_SECONDARY_COMPOSITE").length,
        relatedNamedFigures: geometries.filter((item) => item.presentationTier === "TIER_3_RELATED_GEOMETRY").length,
        constitutiveSubstructures: geometries.filter((item) => item.presentationTier === "TIER_4_CONSTITUTIVE_SUBSTRUCTURE").length,
        fullyGovernedFigures,
        partiallyGovernedFigures,
        uncorroboratedFigures,
      },
    },
  };
}
