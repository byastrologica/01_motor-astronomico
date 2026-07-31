# Motor Astronomico

API publica em Node.js para geracao de dados astronomicos brutos utilizando a Swiss Ephemeris.

## Output versionado

- `POST /v1/chart`: contrato V1 preservado.
- `POST /v2/chart`: service `1.2.0`, motion schema `1.1.0`, with additive `PLANETARY_STATIONARY_STATE_V1` and `STATIONARY_UNRESOLVED` support.

Consulte `docs/PLANETARY_STATIONARY_STATE_V1.md` para o contrato de movimento estacionario e `docs/PLANETARY_STATIONARY_STATE_V1_CLOSEOUT.md` para o registro final `HOMOLOGATED`.
