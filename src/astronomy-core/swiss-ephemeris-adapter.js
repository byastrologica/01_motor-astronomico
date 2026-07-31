import { fileURLToPath } from "node:url";

import {
  calc_ut,
  fixstar2_ut,
  house_pos,
  houses_ex2,
  julday,
  lun_eclipse_when,
  revjul,
  set_ephe_path,
  sol_eclipse_when_glob,
  version,
  constants,
} from "sweph";

const ephemerisPath = fileURLToPath(
  new URL("../../ephe/", import.meta.url),
);

set_ephe_path(ephemerisPath);

const DEFAULT_FLAGS =
  constants.SEFLG_SWIEPH |
  constants.SEFLG_SPEED;

const EQUATORIAL_FLAGS =
  DEFAULT_FLAGS |
  constants.SEFLG_EQUATORIAL;

function validateResult(result, operation) {
  if (!result || result.flag === constants.ERR) {
    throw new Error(
      result?.error ||
        `Falha da Swiss Ephemeris em ${operation}.`,
    );
  }

  return result;
}

export function calculateJulianDay({
  year,
  month,
  day,
  utcHour,
}) {
  return julday(
    year,
    month,
    day,
    utcHour,
    constants.SE_GREG_CAL,
  );
}

export function calculateBody(julianDay, bodyId) {
  const ecliptic = validateResult(
    calc_ut(julianDay, bodyId, DEFAULT_FLAGS),
    "calculateBody/ecliptic",
  );

  const equatorial = validateResult(
    calc_ut(julianDay, bodyId, EQUATORIAL_FLAGS),
    "calculateBody/equatorial",
  );

  return {
    longitude: ecliptic.data[0],
    latitudeEcliptica: ecliptic.data[1],
    distanceAU: ecliptic.data[2],
    speedLongitude: ecliptic.data[3],
    speedLatitude: ecliptic.data[4],
    speedRadial: ecliptic.data[5],
    rightAscension: equatorial.data[0],
    declination: equatorial.data[1],
  };
}

export function calculateLongitudeSpeed(julianDay, bodyId) {
  const ecliptic = validateResult(
    calc_ut(julianDay, bodyId, DEFAULT_FLAGS),
    "calculateLongitudeSpeed/ecliptic",
  );

  return ecliptic.data[3];
}

export function calculateFixedStar(julianDay, starName) {
  const ecliptic = validateResult(
    fixstar2_ut(starName, julianDay, DEFAULT_FLAGS),
    `calculateFixedStar/${starName}/ecliptic`,
  );

  const equatorial = validateResult(
    fixstar2_ut(starName, julianDay, EQUATORIAL_FLAGS),
    `calculateFixedStar/${starName}/equatorial`,
  );

  return {
    catalogName: ecliptic.name,
    longitude: ecliptic.data[0],
    latitudeEcliptica: ecliptic.data[1],
    distanceAU: ecliptic.data[2],
    speedLongitude: ecliptic.data[3],
    speedLatitude: ecliptic.data[4],
    speedRadial: ecliptic.data[5],
    rightAscension: equatorial.data[0],
    declination: equatorial.data[1],
  };
}

export function calculateObliquity(julianDay) {
  const result = validateResult(
    calc_ut(
      julianDay,
      constants.SE_ECL_NUT,
      constants.SEFLG_SWIEPH,
    ),
    "calculateObliquity",
  );

  return result.data[0];
}

function eclipseTypeFromFlag(flag, kind) {
  if (flag & constants.SE_ECL_ANNULAR_TOTAL) {
    return "HYBRID";
  }
  if (flag & constants.SE_ECL_TOTAL) {
    return "TOTAL";
  }
  if (flag & constants.SE_ECL_ANNULAR) {
    return "ANNULAR";
  }
  if (flag & constants.SE_ECL_PARTIAL) {
    return "PARTIAL";
  }
  if (
    kind === "LUNAR" &&
    flag & constants.SE_ECL_PENUMBRAL
  ) {
    return "PENUMBRAL";
  }

  return "UNKNOWN";
}

function julianDayToIso(julianDay) {
  const date = revjul(
    julianDay,
    constants.SE_GREG_CAL,
  );
  const millisecondsSinceMidnight = Math.round(
    date.hour * 60 * 60 * 1000,
  );

  return new Date(
    Date.UTC(
      date.year,
      date.month - 1,
      date.day,
    ) + millisecondsSinceMidnight,
  ).toISOString();
}

function searchSolarEclipse(startJulianDay, backwards) {
  return validateResult(
    sol_eclipse_when_glob(
      startJulianDay,
      constants.SEFLG_SWIEPH,
      0,
      backwards,
    ),
    "searchSolarEclipse",
  );
}

function searchLunarEclipse(startJulianDay, backwards) {
  return validateResult(
    lun_eclipse_when(
      startJulianDay,
      constants.SEFLG_SWIEPH,
      0,
      backwards,
    ),
    "searchLunarEclipse",
  );
}

function createEclipsePoint({
  id,
  name,
  kind,
  direction,
  searchResult,
}) {
  const eclipseJulianDay = searchResult.data[0];
  const bodyId =
    kind === "SOLAR"
      ? constants.SE_SUN
      : constants.SE_MOON;

  return {
    id,
    name,
    type: "ECLIPSE",
    available: true,
    eclipseKind: kind,
    temporalDirection: direction,
    eclipseType: eclipseTypeFromFlag(
      searchResult.flag,
      kind,
    ),
    eclipseJulianDay,
    eclipseUtcDateTime:
      julianDayToIso(eclipseJulianDay),
    ...calculateBody(eclipseJulianDay, bodyId),
  };
}

export function calculateEclipsePoints(julianDay) {
  const epsilon = 1e-7;

  return [
    createEclipsePoint({
      id: "ECLIPSE_SOL_PRE_NATAL",
      name: "Eclipse Solar Pre-Natal",
      kind: "SOLAR",
      direction: "PRE_NATAL",
      searchResult: searchSolarEclipse(
        julianDay - epsilon,
        true,
      ),
    }),
    createEclipsePoint({
      id: "ECLIPSE_LUA_PRE_NATAL",
      name: "Eclipse Lunar Pre-Natal",
      kind: "LUNAR",
      direction: "PRE_NATAL",
      searchResult: searchLunarEclipse(
        julianDay - epsilon,
        true,
      ),
    }),
    createEclipsePoint({
      id: "ECLIPSE_SOL_POS_NATAL",
      name: "Eclipse Solar Pos-Natal",
      kind: "SOLAR",
      direction: "POS_NATAL",
      searchResult: searchSolarEclipse(
        julianDay + epsilon,
        false,
      ),
    }),
    createEclipsePoint({
      id: "ECLIPSE_LUA_POS_NATAL",
      name: "Eclipse Lunar Pos-Natal",
      kind: "LUNAR",
      direction: "POS_NATAL",
      searchResult: searchLunarEclipse(
        julianDay + epsilon,
        false,
      ),
    }),
  ];
}

export function calculateHouses({
  julianDay,
  latitude,
  longitude,
  houseSystem = "P",
}) {
  const result = validateResult(
    houses_ex2(
      julianDay,
      0,
      latitude,
      longitude,
      houseSystem,
    ),
    "calculateHouses",
  );

  return {
    houses: result.data.houses.map(
      (cuspLongitude, index) => ({
        house: index + 1,
        longitude: cuspLongitude,
      }),
    ),
    angles: {
      asc: result.data.points[constants.SE_ASC],
      mc: result.data.points[constants.SE_MC],
      vertex: result.data.points[constants.SE_VERTEX],
    },
    armc: result.data.points[constants.SE_ARMC],
  };
}

export function calculateHousePosition({
  armc,
  latitude,
  obliquity,
  houseSystem = "P",
  longitude,
  latitudeEcliptica,
}) {
  const result = house_pos(
    armc,
    latitude,
    obliquity,
    houseSystem,
    [longitude, latitudeEcliptica],
  );

  if (!result || result.error) {
    throw new Error(
      result?.error ||
        "Falha ao determinar a posicao mundana do corpo.",
    );
  }

  return result.data >= 1 && result.data < 13
    ? result.data
    : null;
}

export function getEphemerisVersion() {
  return version();
}

export const bodyIds = Object.freeze({
  SOL: constants.SE_SUN,
  LUA: constants.SE_MOON,
  MERCURIO: constants.SE_MERCURY,
  VENUS: constants.SE_VENUS,
  MARTE: constants.SE_MARS,
  JUPITER: constants.SE_JUPITER,
  SATURNO: constants.SE_SATURN,
  URANO: constants.SE_URANUS,
  NETUNO: constants.SE_NEPTUNE,
  PLUTAO: constants.SE_PLUTO,
  NODO_NORTE: constants.SE_TRUE_NODE,
  LILITH_MEDIA: constants.SE_MEAN_APOG,
  QUIRON: constants.SE_CHIRON,
  CERES: constants.SE_CERES,
  PALLAS: constants.SE_PALLAS,
  JUNO: constants.SE_JUNO,
  VESTA: constants.SE_VESTA,
});

