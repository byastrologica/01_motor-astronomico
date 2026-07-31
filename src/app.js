import express from "express";
import cors from "cors";

import {
  generateRawChart,
  generateRawChartV2,
  ValidationError,
} from "./astronomy-core/raw-chart-generator.js";

const app = express();

app.disable("x-powered-by");
app.use(cors());
app.use(express.json({ limit: "100kb" }));

app.get("/", (request, response) => {
  response.status(200).json({
    service: "Motor Astronomico",
    version: "1.2.0",
    status: "online",
    description: "API publica de dados astronomicos",
    endpoints: {
      health: "GET /health",
      chart: "POST /v1/chart",
      chartV2: "POST /v2/chart",
    },
  });
});

app.get("/health", (request, response) => {
  response.status(200).json({
    status: "ok",
    timestamp: new Date().toISOString(),
  });
});

app.post("/v1/chart", (request, response, next) => {
  try {
    const chart = generateRawChart(request.body);

    response.status(200).json({
      outputMode: "FULL",
      chart,
    });
  } catch (error) {
    next(error);
  }
});

app.post("/v2/chart", (request, response, next) => {
  try {
    const chart = generateRawChartV2(request.body);
    response.status(200).json({
      outputMode: "FULL",
      outputSchemaVersion: "astronomical_output_v2",
      features: ["PLANETARY_STATIONARY_STATE_V1", "STATIONARY_UNRESOLVED"],
      chart,
    });
  } catch (error) {
    next(error);
  }
});

app.use((request, response) => {
  response.status(404).json({
    error: "NOT_FOUND",
    message: "Rota nao encontrada.",
  });
});

app.use((error, request, response, next) => {
  if (error instanceof ValidationError) {
    return response.status(400).json({
      error: "VALIDATION_ERROR",
      message: error.message,
      details: error.details,
    });
  }

  if (error instanceof SyntaxError && error.status === 400) {
    return response.status(400).json({
      error: "INVALID_JSON",
      message: "O corpo da requisicao contem JSON invalido.",
    });
  }

  console.error(error);

  return response.status(500).json({
    error: "ASTRONOMY_CALCULATION_ERROR",
    message: "Nao foi possivel realizar o calculo astronomico.",
  });
});

export default app;
