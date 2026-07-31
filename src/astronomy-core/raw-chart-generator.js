import { DateTime, IANAZone } from "luxon";

import {
  bodyIds,
  calculateBody,
  calculateEclipsePoints,
  calculateFixedStar,
  calculateHousePosition,
  calculateHouses,
  calculateJulianDay,
  calculateLongitudeSpeed,
  calculateObliquity,
  getEphemerisVersion,
} from "./swiss-ephemeris-adapter.js";
import { calculateStationaryState } from "../stationary-state/stationary-state.js";
import { STATIONARY_PROFILE } from "../stationary-state/stationary-profile.js";

const BODY_DEFINITIONS = Object.freeze([
  ["SOL", "Sol", "PLANET", true],
  ["LUA", "Lua", "PLANET", true],
  ["MERCURIO", "Mercurio", "PLANET", true],
  ["VENUS", "Venus", "PLANET", true],
  ["MARTE", "Marte", "PLANET", true],
  ["JUPITER", "Jupiter", "PLANET", true],
  ["SATURNO", "Saturno", "PLANET", true],
  ["URANO", "Urano", "PLANET", true],
  ["NETUNO", "Netuno", "PLANET", true],
  ["PLUTAO", "Plutao", "PLANET", true],
  ["NODO_NORTE", "Nodo Norte", "NODE", true],
  ["LILITH_MEDIA", "Lilith Media", "NODE", true],
  ["QUIRON", "Quiron", "ASTEROID", false],
  ["CERES", "Ceres", "ASTEROID", false],
  ["PALLAS", "Pallas", "ASTEROID", false],
  ["JUNO", "Juno", "ASTEROID", false],
  ["VESTA", "Vesta", "ASTEROID", false],
].map(([id, name, type, required]) => ({ id, name, type, required })));

const FIXED_STARS = Object.freeze([
  "Aldebaran",
  "Antares",
  "Regulus",
  "Fomalhaut",
  "Sirius",
  "Spica",
  "Algol",
].map((name) => ({ id: name.toUpperCase(), name, catalogName: name })));

const NODE_PAIR = Object.freeze({
  northId: "NODO_NORTE",
  southId: "NODO_SUL",
  southName: "Nodo Sul",
});

export class ValidationError extends Error {
  constructor(message, details = []) {
    super(message);
    this.name = "ValidationError";
    this.details = details;
  }
}

function normalizeDegrees(value) {
  return ((value % 360) + 360) % 360;
}

function calculateZodiacalHouse(longitude, houses) {
  const position = normalizeDegrees(longitude);

  for (let index = 0; index < houses.length; index += 1) {
    const current = houses[index];
    const next = houses[(index + 1) % houses.length];
    const houseArc = normalizeDegrees(next.longitude - current.longitude);
    const objectArc = normalizeDegrees(position - current.longitude);

    if (objectArc < houseArc) {
      return current.house;
    }
  }

  return null;
}

function validateInput(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new ValidationError("O corpo da requisicao deve ser um objeto JSON.");
  }

  const errors = [];

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "")) {
    errors.push("date deve usar o formato AAAA-MM-DD.");
  }
  if (!/^\d{2}:\d{2}:\d{2}$/.test(input.time ?? "")) {
    errors.push("time deve usar o formato HH:MM:SS.");
  }
  if (typeof input.timezone !== "string" || !IANAZone.isValidZone(input.timezone)) {
    errors.push("timezone deve ser um fuso horario IANA valido.");
  }
  if (
    typeof input.latitude !== "number" ||
    !Number.isFinite(input.latitude) ||
    input.latitude < -90 ||
    input.latitude > 90
  ) {
    errors.push("latitude deve ser um numero entre -90 e 90.");
  }
  if (
    typeof input.longitude !== "number" ||
    !Number.isFinite(input.longitude) ||
    input.longitude < -180 ||
    input.longitude > 180
  ) {
    errors.push("longitude deve ser um numero entre -180 e 180.");
  }

  const houseSystem = input.houseSystem ?? "P";
  if (typeof houseSystem !== "string" || !/^[A-Za-z]$/.test(houseSystem)) {
    errors.push("houseSystem deve conter uma unica letra.");
  }
  if (errors.length > 0) {
    throw new ValidationError("Dados de entrada invalidos.", errors);
  }

  const localDateTime = DateTime.fromISO(`${input.date}T${input.time}`, {
    zone: input.timezone,
    setZone: true,
  });

  if (!localDateTime.isValid) {
    throw new ValidationError(
      "A data, hora ou combinacao com o fuso horario e invalida.",
      [localDateTime.invalidExplanation ?? "Data e hora invalidas."],
    );
  }

  return {
    date: input.date,
    time: input.time,
    timezone: input.timezone,
    latitude: input.latitude,
    longitude: input.longitude,
    houseSystem: houseSystem.toUpperCase(),
    localDateTime,
  };
}

function locateMundaneHouse(data, context) {
  return calculateHousePosition({
    armc: context.housesData.armc,
    latitude: context.latitude,
    obliquity: context.obliquity,
    houseSystem: context.houseSystem,
    longitude: data.longitude,
    latitudeEcliptica: data.latitudeEcliptica,
  });
}

function addHousePositions(data, context) {
  return {
    ...data,
    house: calculateZodiacalHouse(data.longitude, context.housesData.houses),
    mundaneHousePosition: locateMundaneHouse(data, context),
  };
}

function calculateObject(definition, context) {
  const data = calculateBody(context.julianDay, bodyIds[definition.id]);
  return addHousePositions(
    { id: definition.id, name: definition.name, type: definition.type, ...data },
    context,
  );
}

function calculateStar(definition, context) {
  const data = calculateFixedStar(context.julianDay, definition.catalogName);
  return addHousePositions(
    {
      id: definition.id,
      name: definition.name,
      type: "FIXED_STAR",
      ...data,
    },
    context,
  );
}

function createSouthNode(northNode, pair, context) {
  return addHousePositions(
    {
      ...northNode,
      id: pair.southId,
      name: pair.southName,
      longitude: normalizeDegrees(northNode.longitude + 180),
      latitudeEcliptica: -northNode.latitudeEcliptica,
      rightAscension: normalizeDegrees(northNode.rightAscension + 180),
      declination: -northNode.declination,
      speedLatitude: -northNode.speedLatitude,
    },
    context,
  );
}

export function generateRawChart(input) {
  const normalized = validateInput(input);
  const utcDateTime = normalized.localDateTime.toUTC();
  const utcHour =
    utcDateTime.hour +
    utcDateTime.minute / 60 +
    utcDateTime.second / 3600 +
    utcDateTime.millisecond / 3600000;

  const julianDay = calculateJulianDay({
    year: utcDateTime.year,
    month: utcDateTime.month,
    day: utcDateTime.day,
    utcHour,
  });
  const obliquity = calculateObliquity(julianDay);
  const housesData = calculateHouses({
    julianDay,
    latitude: normalized.latitude,
    longitude: normalized.longitude,
    houseSystem: normalized.houseSystem,
  });
  const context = {
    julianDay,
    obliquity,
    housesData,
    latitude: normalized.latitude,
    houseSystem: normalized.houseSystem,
  };
  const objects = [];
  const warnings = [];

  for (const definition of BODY_DEFINITIONS) {
    try {
      objects.push(calculateObject(definition, context));
    } catch (error) {
      if (definition.required) {
        throw error;
      }
      warnings.push(`${definition.id} nao foi calculado: ${error.message}`);
    }
  }

  const northIndex = objects.findIndex(
    (object) => object.id === NODE_PAIR.northId,
  );
  if (northIndex >= 0) {
    objects.splice(
      northIndex + 1,
      0,
      createSouthNode(objects[northIndex], NODE_PAIR, context),
    );
  }

  for (const definition of FIXED_STARS) {
    try {
      objects.push(calculateStar(definition, context));
    } catch (error) {
      warnings.push(`${definition.id} nao foi calculada: ${error.message}`);
    }
  }

  for (const eclipse of calculateEclipsePoints(julianDay)) {
    objects.push(
      addHousePositions(eclipse, context),
    );
  }

  return {
    input: {
      date: normalized.date,
      time: normalized.time,
      timezone: normalized.timezone,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      houseSystem: normalized.houseSystem,
    },
    time: {
      localDateTime: normalized.localDateTime.toISO(),
      utcDateTime: utcDateTime.toISO(),
      julianDay,
    },
    chartData: {
      julianDay,
      obliquity,
      latitude: normalized.latitude,
      longitude: normalized.longitude,
      timezone: normalized.timezone,
    },
    objects,
    houses: housesData.houses,
    angles: housesData.angles,
    metadata: {
      service: "Motor Astronomico",
      serviceVersion: "1.0.0",
      astronomicalEngine: "Swiss Ephemeris",
      ephemerisVersion: getEphemerisVersion(),
      houseSystem: normalized.houseSystem,
      coordinateReference: "GEOCENTRIC_TROPICAL_APPARENT",
      houseReference: "ZODIACAL_CUSP_INTERVAL",
      mundaneHouseReference: "SWISS_EPHEMERIS_HOUSE_POS",
      generatedAt: new Date().toISOString(),
      warnings,
    },
  };
}

export function generateRawChartV2(input) {
  const chart = generateRawChart(input);
  const allBodiesDeadline = Date.now() + STATIONARY_PROFILE.allBodiesStationSearchTimeoutMs;
  const ephemeris = {
    engine: "SWISS_EPHEMERIS",
    version: chart.metadata.ephemerisVersion,
    backend: "SWIEPH",
  };
  const objects = chart.objects.map((object) => {
    const bodyId = bodyIds[object.id];
    const stationary = calculateStationaryState({
      bodyId: object.id,
      instantJulianDay: chart.time.julianDay,
      speedLongitudeDegPerDay: object.speedLongitude,
      speedAt: bodyId === undefined
        ? () => Number.NaN
        : (julianDay) => calculateLongitudeSpeed(julianDay, bodyId),
      ephemeris,
      allBodiesDeadline,
    });
    return { ...object, ...stationary };
  });

  return {
    ...chart,
    objects,
    metadata: {
      ...chart.metadata,
      serviceVersion: "1.2.0",
      outputSchemaVersion: "astronomical_output_v2",
      motionSchemaVersion: "1.1.0",
      stationaryStateContractVersion: "1.1.0",
      features: ["PLANETARY_STATIONARY_STATE_V1", "STATIONARY_UNRESOLVED"],
      stationaryProfileId: STATIONARY_PROFILE.id,
      stationaryProfileVersion: STATIONARY_PROFILE.version,
    },
  };
}

