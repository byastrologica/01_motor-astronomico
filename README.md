# Motor Astronomico

API publica em Node.js para geracao de dados astronomicos brutos utilizando a Swiss Ephemeris.

## Output versionado

- `POST /v1/chart`: contrato V1 preservado.
- `POST /v2/chart`: output aditivo com `PLANETARY_STATIONARY_STATE_V1`.

Consulte `docs/PLANETARY_STATIONARY_STATE_V1.md` para o contrato de movimento estacionario.
