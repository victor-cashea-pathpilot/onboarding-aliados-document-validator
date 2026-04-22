# Legal Manual Phase 1

Este branch implementa únicamente la primera fase de alineación con el `MANUAL DE CRITERIOS ONBOARDING LEGAL`.

## Alcance de esta fase

- endurecimiento de política de RIF:
  - prefijos permitidos por modo legal (`J-` para sociedad mercantil, `V-` para firma personal y emprendimiento)
  - ventana de tolerancia de hasta 6 meses para RIF vencido
  - validación exacta de dirección fiscal entre RIF y documento legal
- check determinístico duro de vigencia de compañía
- lógica determinística de vigencia de junta con:
  - cláusula de continuidad `hasta ser sustituidos`
  - gracia igual al plazo estatutario cuando esa cláusula existe
  - gracia general de 5 años cuando no existe cláusula expresa
- alineación de clasificación comercial y exclusiones:
  - soporte para `LCE`
  - check determinístico para actividades excluidas

## Decisión de diseño para esta fase

- sólo se soportan explícitamente `sociedad_mercantil`, `firma_personal` y `emprendimiento`
- esto es intencional en fase 1
- el diseño se dejó preparado para incorporar nuevas figuras extendiendo:
  - prompts de extracción
  - normalización canónica
  - checks determinísticos por modo legal

## Fuera de alcance

- nuevas figuras jurídicas:
  - Asociación Civil
  - Fundación
  - Unidad Productiva Familiar
  - Asociación Cooperativa
- tracto sucesivo completo entre actas y cadena histórica de representación
- UBO / beneficiarios finales / reglas de control por porcentaje accionario

## Limitaciones conocidas de fase 1

- la lógica de junta cubre únicamente lo que puede inferirse del expediente actual
- no se soporta todavía aceptación automática de evidencias externas de trámite o certificaciones adicionales porque esos artefactos no existen aún en el schema de entrada
- las exclusiones se validan hoy con clasificación y palabras clave del giro comercial; una taxonomía más estructurada puede venir después sin romper el contrato actual
