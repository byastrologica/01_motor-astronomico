const BODY_THRESHOLD = 0.5;
const RELATION_THRESHOLD = 2;

const ASPECT_ALIASES = Object.freeze({
  CONJUNCTION: "CONJUNCTION",
  CONJUNCAO: "CONJUNCTION",
  OPPOSITION: "OPPOSITION",
  OPOSICAO: "OPPOSITION",
  TRINE: "TRINE",
  TRIGONO: "TRINE",
  SQUARE: "SQUARE",
  QUADRATURA: "SQUARE",
  SEXTILE: "SEXTILE",
  SEXTIL: "SEXTILE",
  QUINCUNX: "QUINCUNX",
  QUINCUNCIO: "QUINCUNX",
});

const TECHNICAL_STATUS_RANK = Object.freeze({
  VALIDATED: 4,
  APPROVED: 3,
  DETECTED: 2,
  PENDING_VALIDATION: 1,
  PENDING_IMPLEMENTATION_VALIDATION: 1,
  INVALID: 0,
  REJECTED: 0,
});

function canonicalValue(value) {
  if (Array.isArray(value)) {
    return value
      .map(canonicalValue)
      .sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonicalValue(value[key])]),
    );
  }
  return value ?? null;
}

function stableJson(value) {
  return JSON.stringify(canonicalValue(value));
}

// Synchronous SHA-256 keeps cluster identifiers deterministic in browsers and Node.
function sha256Ascii(input) {
  const rightRotate = (value, amount) => (value >>> amount) | (value << (32 - amount));
  const maxWord = 2 ** 32;
  const words = [];
  const hash = [];
  const constants = [];
  const composite = {};
  let primeCounter = 0;

  for (let candidate = 2; primeCounter < 64; candidate += 1) {
    if (composite[candidate]) {
      continue;
    }
    for (let multiple = candidate * candidate; multiple < 313; multiple += candidate) {
      composite[multiple] = true;
    }
    hash[primeCounter] = (Math.sqrt(candidate) * maxWord) | 0;
    constants[primeCounter] = (candidate ** (1 / 3) * maxWord) | 0;
    primeCounter += 1;
  }

  const ascii = unescape(encodeURIComponent(String(input)));
  const bitLength = ascii.length * 8;
  let message = `${ascii}\x80`;
  while ((message.length % 64) !== 56) {
    message += "\x00";
  }
  for (let index = 0; index < message.length; index += 1) {
    words[index >> 2] |= message.charCodeAt(index) << ((3 - index) % 4) * 8;
  }
  words.push((bitLength / maxWord) | 0);
  words.push(bitLength);

  let currentHash = hash.slice(0, 8);
  for (let blockStart = 0; blockStart < words.length; blockStart += 16) {
    const oldHash = currentHash.slice();
    const schedule = words.slice(blockStart, blockStart + 16);
    for (let index = 16; index < 64; index += 1) {
      const word15 = schedule[index - 15];
      const word2 = schedule[index - 2];
      const sigma0 = rightRotate(word15, 7) ^ rightRotate(word15, 18) ^ (word15 >>> 3);
      const sigma1 = rightRotate(word2, 17) ^ rightRotate(word2, 19) ^ (word2 >>> 10);
      schedule[index] = (schedule[index - 16] + sigma0 + schedule[index - 7] + sigma1) | 0;
    }
    for (let index = 0; index < 64; index += 1) {
      const [a, b, c, d, e, f, g, h] = currentHash;
      const sum1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + constants[index] + schedule[index]) | 0;
      const sum0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) | 0;
      currentHash = [
        (temp1 + temp2) | 0,
        a,
        b,
        c,
        (d + temp1) | 0,
        e,
        f,
        g,
      ];
    }
    currentHash = currentHash.map((value, index) => (value + oldHash[index]) | 0);
  }

  return currentHash
    .map((value) => (value >>> 0).toString(16).padStart(8, "0"))
    .join("");
}

function normalizedAspectType(value) {
  const key = String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return ASPECT_ALIASES[key] || key || "UNKNOWN";
}

export function canonicalRelationKey(bodyA, aspectType, bodyB) {
  const [first, second] = [String(bodyA), String(bodyB)].sort();
  return `${first}|${normalizedAspectType(aspectType)}|${second}`;
}

function normalizeRelation(relation) {
  const [bodyA, bodyB] = [String(relation.bodyA), String(relation.bodyB)].sort();
  const aspectType = normalizedAspectType(relation.aspectType || relation.aspect);
  const orb = Number(relation.orb);
  return {
    bodyA,
    bodyB,
    aspectType,
    relationKey: canonicalRelationKey(bodyA, aspectType, bodyB),
    orb: Number.isFinite(orb) ? orb : null,
  };
}

function setIntersection(left, right) {
  return new Set([...left].filter((item) => right.has(item)));
}

function isSubset(left, right) {
  return [...left].every((item) => right.has(item));
}

function metrics(relations) {
  const orbs = relations.map((item) => item.orb).filter(Number.isFinite);
  if (!orbs.length) {
    return { rmsOrb: null, maximumOrb: null };
  }
  return {
    rmsOrb: Math.sqrt(orbs.reduce((sum, orb) => sum + (orb ** 2), 0) / orbs.length),
    maximumOrb: Math.max(...orbs),
  };
}

function technicalStatus(record) {
  return String(
    record.details?.technicalValidationStatus ||
    record.technicalValidationStatus ||
    record.status ||
    "DETECTED",
  ).toUpperCase();
}

function anchorEligibility(record, status) {
  if (["INVALID", "REJECTED"].includes(status)) {
    return { eligible: false, reason: status };
  }
  if (
    record.geometryId === "BARBAULT_BASKET" &&
    ["PENDING_VALIDATION", "PENDING_IMPLEMENTATION_VALIDATION"].includes(status)
  ) {
    return { eligible: false, reason: status };
  }
  return { eligible: true, reason: null };
}

function canonicalGeometry(record) {
  const bodies = [...new Set(record.planets || record.bodies || [])].map(String).sort();
  const requiredRelations = (record.aspects || record.requiredRelations || [])
    .map(normalizeRelation)
    .sort((left, right) => left.relationKey.localeCompare(right.relationKey));
  const roles = canonicalValue(record.structureRoles || record.roles || {});
  const geometryType = String(record.geometryId || record.geometryType || "UNKNOWN");
  const signature = stableJson({
    geometryType,
    bodies,
    requiredRelations: requiredRelations.map((item) => item.relationKey),
    roles,
  });
  const status = technicalStatus(record);
  const eligibility = anchorEligibility(record, status);
  return {
    geometryId: `${geometryType}_${sha256Ascii(signature).slice(0, 12)}`,
    geometryType,
    label: String(record.name || record.label || geometryType),
    bodies,
    requiredRelations,
    roles,
    signature,
    sourceKeys: [String(record.key || signature)],
    sourceGeometryIds: [String(record.key || signature)],
    derivedFromSourceKeys: record.derivedFrom ? [String(record.derivedFrom)] : [],
    technicalValidationStatus: status,
    anchorEligible: eligibility.eligible,
    anchorIneligibilityReason: eligibility.reason,
    ...metrics(requiredRelations),
  };
}

function deduplicateExact(records) {
  const bySignature = new Map();
  records.map(canonicalGeometry).forEach((geometry) => {
    const existing = bySignature.get(geometry.signature);
    if (!existing) {
      bySignature.set(geometry.signature, geometry);
      return;
    }
    existing.sourceKeys.push(...geometry.sourceKeys);
    existing.sourceGeometryIds.push(...geometry.sourceGeometryIds);
    existing.derivedFromSourceKeys.push(...geometry.derivedFromSourceKeys);
    existing.sourceKeys.sort();
    existing.sourceGeometryIds.sort();
    existing.derivedFromSourceKeys = [...new Set(existing.derivedFromSourceKeys)].sort();
  });
  return [...bySignature.values()].sort((left, right) =>
    left.geometryId.localeCompare(right.geometryId)
  );
}

function pairEvidence(left, right, sourceToCanonical) {
  const leftBodies = new Set(left.bodies);
  const rightBodies = new Set(right.bodies);
  const leftRelations = new Set(left.requiredRelations.map((item) => item.relationKey));
  const rightRelations = new Set(right.requiredRelations.map((item) => item.relationKey));
  const sharedBodies = [...setIntersection(leftBodies, rightBodies)].sort();
  const sharedRelations = [...setIntersection(leftRelations, rightRelations)].sort();
  const sharedBodiesRatio = Math.min(leftBodies.size, rightBodies.size)
    ? sharedBodies.length / Math.min(leftBodies.size, rightBodies.size)
    : 0;
  const leftDerivesRight = left.derivedFromSourceKeys.some((key) =>
    sourceToCanonical.get(key) === right.geometryId
  );
  const rightDerivesLeft = right.derivedFromSourceKeys.some((key) =>
    sourceToCanonical.get(key) === left.geometryId
  );
  const explicitDerivativeRelation = leftDerivesRight || rightDerivesLeft;
  const genericLinkMatched =
    sharedBodiesRatio >= BODY_THRESHOLD &&
    sharedRelations.length >= RELATION_THRESHOLD;
  const relationshipTypes = [];

  if (explicitDerivativeRelation) {
    relationshipTypes.push("DERIVED_FROM");
  }
  const leftContainsRight =
    left.signature !== right.signature &&
    isSubset(rightBodies, leftBodies) &&
    isSubset(rightRelations, leftRelations);
  const rightContainsLeft =
    left.signature !== right.signature &&
    isSubset(leftBodies, rightBodies) &&
    isSubset(leftRelations, rightRelations);
  if (leftContainsRight || rightContainsLeft) {
    relationshipTypes.push("CONTAINS", "NESTED_IN");
  }
  if (sharedRelations.some((key) => key.includes("|OPPOSITION|"))) {
    relationshipTypes.push("SHARED_AXIS");
  }
  if (sharedRelations.length >= 2) {
    relationshipTypes.push("SHARED_STRUCTURE");
  }
  if (
    [left.geometryType, right.geometryType].includes("BARBAULT_BASKET") &&
    (explicitDerivativeRelation || genericLinkMatched)
  ) {
    relationshipTypes.push("SPECIAL_RELATED_GEOMETRY");
  }
  if (genericLinkMatched) {
    relationshipTypes.push("RELATED_TO");
  }

  return {
    relationshipId: `REL_${sha256Ascii(`${left.geometryId}|${right.geometryId}`).slice(0, 12)}`,
    sourceGeometryId: left.geometryId,
    targetGeometryId: right.geometryId,
    relationshipTypes: [...new Set(relationshipTypes)],
    sharedBodies,
    sharedBodiesRatio,
    sharedRequiredRelations: sharedRelations,
    sharedRequiredRelationsCount: sharedRelations.length,
    explicitDerivativeRelation,
    derivativeSourceGeometryId: leftDerivesRight
      ? left.geometryId
      : rightDerivesLeft
        ? right.geometryId
        : null,
    derivativeTargetGeometryId: leftDerivesRight
      ? right.geometryId
      : rightDerivesLeft
        ? left.geometryId
        : null,
    genericLinkMatched,
    directClusterLink: explicitDerivativeRelation || genericLinkMatched,
    clusterGenericLinkRule: "CONSERVATIVE_AND",
  };
}

function compareAnchor(left, right) {
  const relationDifference = right.requiredRelations.length - left.requiredRelations.length;
  if (relationDifference) return relationDifference;
  const bodyDifference = right.bodies.length - left.bodies.length;
  if (bodyDifference) return bodyDifference;
  const leftRms = Number.isFinite(left.rmsOrb) ? left.rmsOrb : Number.POSITIVE_INFINITY;
  const rightRms = Number.isFinite(right.rmsOrb) ? right.rmsOrb : Number.POSITIVE_INFINITY;
  if (leftRms !== rightRms) return leftRms - rightRms;
  const leftMax = Number.isFinite(left.maximumOrb) ? left.maximumOrb : Number.POSITIVE_INFINITY;
  const rightMax = Number.isFinite(right.maximumOrb) ? right.maximumOrb : Number.POSITIVE_INFINITY;
  if (leftMax !== rightMax) return leftMax - rightMax;
  const statusDifference =
    (TECHNICAL_STATUS_RANK[right.technicalValidationStatus] || 0) -
    (TECHNICAL_STATUS_RANK[left.technicalValidationStatus] || 0);
  if (statusDifference) return statusDifference;
  return left.geometryId.localeCompare(right.geometryId);
}

function connectedComponents(geometries, relationships) {
  const adjacency = new Map(geometries.map((item) => [item.geometryId, new Set()]));
  relationships.filter((item) => item.directClusterLink).forEach((item) => {
    adjacency.get(item.sourceGeometryId)?.add(item.targetGeometryId);
    adjacency.get(item.targetGeometryId)?.add(item.sourceGeometryId);
  });
  const seen = new Set();
  const components = [];
  for (const geometry of geometries) {
    if (seen.has(geometry.geometryId)) continue;
    const queue = [geometry.geometryId];
    const component = [];
    seen.add(geometry.geometryId);
    while (queue.length) {
      const current = queue.shift();
      component.push(current);
      for (const neighbor of adjacency.get(current) || []) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    components.push(component.sort());
  }
  return { components, adjacency };
}

function shortestPath(adjacency, start, target) {
  if (start === target) return [start];
  const queue = [[start]];
  const visited = new Set([start]);
  while (queue.length) {
    const path = queue.shift();
    for (const neighbor of adjacency.get(path.at(-1)) || []) {
      if (visited.has(neighbor)) continue;
      const nextPath = [...path, neighbor];
      if (neighbor === target) return nextPath;
      visited.add(neighbor);
      queue.push(nextPath);
    }
  }
  return [];
}

function roleForMember(member, anchor, relationships) {
  if (member.geometryId === anchor.geometryId) return "VISUAL_ANCHOR";
  if (member.geometryRole === "CONSTITUTIVE_NESTED_GEOMETRY") return "NESTED_STRUCTURE";
  const memberRelationships = relationships.filter((item) =>
    [item.sourceGeometryId, item.targetGeometryId].includes(member.geometryId)
  );
  const pairWithAnchor = memberRelationships.find((item) =>
    [item.sourceGeometryId, item.targetGeometryId].includes(member.geometryId) &&
    [item.sourceGeometryId, item.targetGeometryId].includes(anchor.geometryId)
  );
  if (member.geometryType === "BARBAULT_BASKET") return "SPECIAL_RELATED_GEOMETRY";
  if (memberRelationships.some((item) =>
    item.derivativeSourceGeometryId === member.geometryId
  )) return "DERIVED_STRUCTURE";
  if (pairWithAnchor?.relationshipTypes.includes("NESTED_IN")) return "NESTED_STRUCTURE";
  if (pairWithAnchor?.relationshipTypes.includes("SHARED_AXIS")) return "SHARED_AXIS_GEOMETRY";
  return "RELATED_GEOMETRY";
}

export function buildGeometryClusterPresentation(records, options = {}) {
  const rawRecords = Array.isArray(records) ? records : [];
  const hiddenKeys = new Set(options.hiddenGeometryKeys || []);
  const renderableKeys = options.renderableGeometryKeys == null
    ? new Set(rawRecords.map((record) => String(record.key || "")))
    : new Set(options.renderableGeometryKeys);
  const canonicalDetectedGeometries = deduplicateExact(rawRecords);
  const sourceToCanonical = new Map();
  canonicalDetectedGeometries.forEach((geometry) => {
    geometry.sourceKeys.forEach((key) => sourceToCanonical.set(key, geometry.geometryId));
  });

  const geometryRelationships = [];
  for (let leftIndex = 0; leftIndex < canonicalDetectedGeometries.length; leftIndex += 1) {
    for (
      let rightIndex = leftIndex + 1;
      rightIndex < canonicalDetectedGeometries.length;
      rightIndex += 1
    ) {
      const evidence = pairEvidence(
        canonicalDetectedGeometries[leftIndex],
        canonicalDetectedGeometries[rightIndex],
        sourceToCanonical,
      );
      if (evidence.relationshipTypes.length || evidence.directClusterLink) {
        geometryRelationships.push(evidence);
      }
    }
  }

  canonicalDetectedGeometries.forEach((geometry) => {
    geometry.participatingBodies = [...geometry.bodies];
    geometry.parentGeometryIds = [];
    geometry.constitutiveGeometryIds = [];
    geometry.independentlyDetected = true;
    geometry.independentlyViewable = true;
    geometry.visualAnchor = false;
    geometry.clusterId = null;
    geometry.geometryRole = "RELATED_GEOMETRY";
  });
  geometryRelationships
    .filter((relationship) => relationship.explicitDerivativeRelation)
    .forEach((relationship) => {
      const composite = canonicalDetectedGeometries.find((geometry) =>
        geometry.geometryId === relationship.derivativeSourceGeometryId
      );
      const constitutive = canonicalDetectedGeometries.find((geometry) =>
        geometry.geometryId === relationship.derivativeTargetGeometryId
      );
      if (!composite || !constitutive) {
        return;
      }
      composite.constitutiveGeometryIds.push(constitutive.geometryId);
      constitutive.parentGeometryIds.push(composite.geometryId);
    });
  canonicalDetectedGeometries.forEach((geometry) => {
    geometry.parentGeometryIds = [...new Set(geometry.parentGeometryIds)].sort();
    geometry.constitutiveGeometryIds = [...new Set(geometry.constitutiveGeometryIds)].sort();
    geometry.geometryRole = geometry.constitutiveGeometryIds.length
      ? "COMPOSITE_TOP_LEVEL"
      : geometry.parentGeometryIds.length
        ? "CONSTITUTIVE_NESTED_GEOMETRY"
        : "RELATED_GEOMETRY";
  });

  const { components, adjacency } = connectedComponents(
    canonicalDetectedGeometries,
    geometryRelationships,
  );
  const byId = new Map(canonicalDetectedGeometries.map((item) => [item.geometryId, item]));
  const geometryClusters = components.map((memberIds) => {
    const members = memberIds.map((id) => byId.get(id));
    const eligible = members.filter((item) => item.anchorEligible).sort(compareAnchor);
    const anchor = eligible[0] || [...members].sort(compareAnchor)[0];
    if (members.length === 1 && anchor.geometryRole === "RELATED_GEOMETRY") {
      anchor.geometryRole = "INDEPENDENT_TOP_LEVEL";
    }
    const clusterRelationships = geometryRelationships.filter((item) =>
      memberIds.includes(item.sourceGeometryId) && memberIds.includes(item.targetGeometryId)
    );
    const clusterId = `GEOMETRY_CLUSTER_${sha256Ascii(memberIds.join("|")).slice(0, 12)}`;
    members.forEach((member) => {
      member.clusterId = clusterId;
      member.visualAnchor = member.geometryId === anchor.geometryId;
    });
    const rankedMembers = members.map((member) => ({
      geometryId: member.geometryId,
      geometryType: member.geometryType,
      label: member.label,
      sourceKeys: member.sourceKeys,
      clusterRole: roleForMember(member, anchor, clusterRelationships),
      geometryRole: member.geometryRole,
      participatingBodies: member.participatingBodies,
      parentGeometryIds: member.parentGeometryIds,
      constitutiveGeometryIds: member.constitutiveGeometryIds,
      independentlyDetected: member.independentlyDetected,
      independentlyViewable: member.independentlyViewable,
      visualAnchor: member.visualAnchor,
      clusterId,
      pathFromAnchor: shortestPath(adjacency, anchor.geometryId, member.geometryId),
      technicalValidationStatus: member.technicalValidationStatus,
      anchorEligible: member.anchorEligible,
      anchorIneligibilityReason: member.anchorIneligibilityReason,
      requiredRelationsCount: member.requiredRelations.length,
      bodyCount: member.bodies.length,
      rmsOrb: member.rmsOrb,
      maximumOrb: member.maximumOrb,
    })).sort((left, right) => {
      if (left.geometryId === anchor.geometryId) return -1;
      if (right.geometryId === anchor.geometryId) return 1;
      const importanceDifference = compareAnchor(
        byId.get(left.geometryId),
        byId.get(right.geometryId),
      );
      if (importanceDifference) {
        return importanceDifference;
      }
      if (left.pathFromAnchor.length !== right.pathFromAnchor.length) {
        return left.pathFromAnchor.length - right.pathFromAnchor.length;
      }
      return left.geometryId.localeCompare(right.geometryId);
    });
    rankedMembers.forEach((member, index) => {
      member.clusterRank = index + 1;
    });
    return {
      clusterId,
      visualAnchorGeometryId: anchor.geometryId,
      visualAnchorGeometryType: anchor.geometryType,
      visualAnchorLabel: anchor.label,
      memberGeometryIds: memberIds,
      members: rankedMembers,
      topLevelGeometryCount: rankedMembers.filter((member) =>
        member.geometryRole === "COMPOSITE_TOP_LEVEL"
      ).length,
      constitutiveGeometryCount: rankedMembers.filter((member) =>
        member.geometryRole === "CONSTITUTIVE_NESTED_GEOMETRY"
      ).length,
      relatedGeometryCount: rankedMembers.filter((member) =>
        member.geometryRole === "RELATED_GEOMETRY"
      ).length,
      independentTopLevelGeometryCount: rankedMembers.filter((member) =>
        member.geometryRole === "INDEPENDENT_TOP_LEVEL"
      ).length,
      directRelationships: clusterRelationships.filter((item) => item.directClusterLink),
      descriptiveRelationships: clusterRelationships,
    };
  }).sort((left, right) => {
    const importanceDifference = compareAnchor(
      byId.get(left.visualAnchorGeometryId),
      byId.get(right.visualAnchorGeometryId),
    );
    return importanceDifference || left.clusterId.localeCompare(right.clusterId);
  });

  const metadataBySourceKey = {};
  geometryClusters.forEach((cluster) => {
    cluster.members.forEach((member, index) => {
      member.sourceKeys.forEach((sourceKey) => {
        metadataBySourceKey[sourceKey] = {
          clusterId: cluster.clusterId,
          clusterRole: member.clusterRole,
          clusterRank: index + 1,
          visualAnchorGeometryId: cluster.visualAnchorGeometryId,
          pathFromAnchor: member.pathFromAnchor,
          geometryRole: member.geometryRole,
          parentGeometryIds: member.parentGeometryIds,
          constitutiveGeometryIds: member.constitutiveGeometryIds,
          visualAnchor: member.visualAnchor,
        };
      });
    });
  });

  const totalHiddenByUser = canonicalDetectedGeometries.filter((geometry) =>
    geometry.sourceKeys.every((key) => hiddenKeys.has(key))
  ).length;
  const totalHiddenByBodyFilter = canonicalDetectedGeometries.filter((geometry) =>
    geometry.sourceKeys.every((key) => !renderableKeys.has(key))
  ).length;
  const canonicalIsVisible = (geometry) => geometry.sourceKeys.some((key) =>
    !hiddenKeys.has(key) && renderableKeys.has(key)
  );
  Object.entries(metadataBySourceKey).forEach(([sourceKey, metadata]) => {
    metadata.visibilityStatus = hiddenKeys.has(sourceKey)
      ? "HIDDEN_BY_USER"
      : !renderableKeys.has(sourceKey)
        ? "HIDDEN_BY_BODY_FILTER"
        : "VISIBLE";
  });

  return {
    schemaVersion: "GEOMETRY_CLUSTER_V1",
    governance: {
      layer: "VISUAL_ONLY",
      methodStatus: "NON_GOVERNED",
      clusterGenericLinkRule: "CONSERVATIVE_AND",
      explicitDerivativeRelation: "ALWAYS_LINKS",
      originalOrRule: "SUPERSEDED_BY_CONSERVATIVE_V1_CLUSTER_RULE",
      sharedBodiesRatioThreshold: BODY_THRESHOLD,
      sharedRequiredRelationsThreshold: RELATION_THRESHOLD,
      clusterIdAlgorithm: "SHA256_FIRST12_SORTED_GEOMETRY_IDS",
      allValidGeometriesRemainIndividuallyAvailable: true,
      automaticSuppressionApplied: false,
    },
    rawDetectedGeometries: rawRecords.map((record) => ({
      sourceKey: String(record.key || ""),
      geometryType: String(record.geometryId || record.geometryType || "UNKNOWN"),
      label: String(record.name || record.label || ""),
      bodies: [...new Set(record.planets || record.bodies || [])].sort(),
    })),
    canonicalDetectedGeometries,
    geometryRelationships,
    geometryClusters,
    geometryViewState: {
      hiddenByUserSourceKeys: [...hiddenKeys].sort(),
      hiddenByBodyFilterSourceKeys: rawRecords
        .map((record) => String(record.key || ""))
        .filter((key) => !renderableKeys.has(key))
        .sort(),
      visibleSourceKeys: rawRecords
        .map((record) => String(record.key || ""))
        .filter((key) => !hiddenKeys.has(key) && renderableKeys.has(key))
        .sort(),
    },
    summary: {
      totalRawDetectedGeometries: rawRecords.length,
      totalCanonicalDetectedGeometries: canonicalDetectedGeometries.length,
      totalExactDuplicatesRemoved: rawRecords.length - canonicalDetectedGeometries.length,
      totalClusters: geometryClusters.length,
      totalDirectClusterLinks: geometryRelationships.filter((item) => item.directClusterLink).length,
      topLevelGeometryCount: canonicalDetectedGeometries.filter((geometry) =>
        geometry.geometryRole === "COMPOSITE_TOP_LEVEL"
      ).length,
      constitutiveGeometryCount: canonicalDetectedGeometries.filter((geometry) =>
        geometry.geometryRole === "CONSTITUTIVE_NESTED_GEOMETRY"
      ).length,
      relatedGeometryCount: canonicalDetectedGeometries.filter((geometry) =>
        geometry.geometryRole === "RELATED_GEOMETRY"
      ).length,
      totalVisibleAnchors: geometryClusters.filter((cluster) => {
        const anchor = byId.get(cluster.visualAnchorGeometryId);
        return anchor && canonicalIsVisible(anchor);
      }).length,
      totalVisible: canonicalDetectedGeometries.filter(canonicalIsVisible).length,
      totalHiddenByUser,
      totalHiddenByBodyFilter,
    },
    metadataBySourceKey,
  };
}
