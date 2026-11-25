# Observation events V1

Endpoint aditivo `POST /v1/observation-events`, exclusivo da observação visual
Auto do SkyNow. Não altera chart V1/V2, ranking, CS, SOP, orbes ou scores.

Entrada `SKYNOW_AUTO_REQUEST_V1`: intervalo UTC crescente (1600–2400,
até sete dias), corpos móveis selecionados, referências natais fixas,
definições visuais de aspecto, scopes `SKY` e/ou `TRANSIT_NATAL`, contexto
geográfico/horário e seleção de eixos. IDs natais direcionais não são
simetrizados. A oposição estrutural dos nodos é excluída.

Saída `SKYNOW_AUTO_EVENTS_V1`: eventos agrupados com motivos e posições
calculadas no instante, `complete`, `coveredThroughUtc`, `reason` e `coverage`.
`VISUAL` não é classificação oficial do Método. Movimento usa o perfil
estacionário já existente, sem fabricar SD/SR quando não resolvido.

Amostragem máxima de 20 s (eixos locais móveis) ou 60 s (demais),
refinamento de raízes/fronteiras a 1 s. Eventos menores que a amostragem não
são certificados. Mudanças de ramo de derivados não são interpoladas.
Orçamento operacional padrão: 15 s, 4500 segmentos, 32 motivos por lote
(o último segmento é transacional e pode conter motivos simultâneos).
Uma resposta parcial nunca significa ausência de eventos; o consumidor
deve retomar a busca em `coveredThroughUtc` ou registrar interrupção.

`vendor/` preserva o detector visual e suas dependências de
`byastrologica/00_motor-tester`, commit `25d09b5`, sem mudança de lógica:
`visual-geometry.js`, `skynow-geometry.js`, `skynow-geometry-cluster.js`.
As geometrias acompanham apenas os corpos móveis; nenhuma regra de figura
mista natal/trânsito é introduzida.

Teste: `node --test test/observation-events.test.js` (Node 22 + sweph instalado).
# Auto OOB and stationary transitions (2026-11-25)

OOB_ENTER / OOB_EXIT use the existing SkyNow visual threshold abs(declination)
> 23.436 degrees, only for selected ordinary planets. This is independent of
longitudinal D/R/SR/SD. MOTION_CHANGE now reports the existing stationary
classifier's explicit state, not the generic STATIONARY_BAND display token.
Events describe forward chronological transitions; reverse playback reverses
their presentation order, not their astronomical meaning. No orb or sampling
interval changes. Historical capture files are not retroactively completed.

