import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import app from "../src/app.js";

const input = {
  date: "1982-04-14",
  time: "05:35:00",
  timezone: "America/Sao_Paulo",
  latitude: -23.5505,
  longitude: -46.6333,
  houseSystem: "P",
};

test("v1 permanece sem o novo contrato e v2 e aditivo", async () => {
  const v1 = await request(app).post("/v1/chart").send(input).expect(200);
  const v2 = await request(app).post("/v2/chart").send(input).expect(200);
  assert.equal(v1.body.outputSchemaVersion, undefined);
  assert.equal(v1.body.chart.objects[0].motion, undefined);
  assert.equal(v2.body.outputSchemaVersion, "astronomical_output_v2");
  assert.ok(v2.body.features.includes("PLANETARY_STATIONARY_STATE_V1"));
  assert.equal(v2.body.chart.objects.length, v1.body.chart.objects.length);
  assert.deepEqual(v2.body.chart.houses, v1.body.chart.houses);
  assert.deepEqual(v2.body.chart.angles, v1.body.chart.angles);
  for (let index = 0; index < v1.body.chart.objects.length; index += 1) {
    const before = v1.body.chart.objects[index];
    const after = v2.body.chart.objects[index];
    assert.equal(after.id, before.id);
    assert.equal(after.longitude, before.longitude);
    assert.equal(after.speedLongitude, before.speedLongitude);
    assert.ok(after.motion);
  }
  const venus = v2.body.chart.objects.find((object) => object.id === "VENUS");
  assert.equal(venus.motionAudit.initialSearchWindowDays, 120);
  assert.equal(venus.motionAudit.maximumSearchWindowDays, 400);
  assert.equal(venus.motionAudit.searchStepHours, 12);
  assert.ok(Number.isFinite(venus.motionAudit.previousSearchedDays));
  assert.ok(Number.isFinite(venus.motionAudit.nextSearchedDays));
  assert.match(venus.motionAudit.previousSearchEndUtc, /^\d{4}-\d{2}-\d{2}T/);
  assert.match(venus.motionAudit.nextSearchEndUtc, /^\d{4}-\d{2}-\d{2}T/);
});
