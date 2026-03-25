# Onboarding Aliados Document Validator

Servicio asíncrono en Google Cloud con Gemini para validar documentos legales de onboarding y cruzar información de aliados para Cashea.

## Resumen

Este repositorio define el MVP de un validador documental para onboarding de aliados. El sistema recibe URLs de documentos ya tipados por Cashea, extrae información estructurada según el tipo de documento, normaliza los datos y ejecuta validaciones cruzadas para determinar si el caso puede aprobarse, rechazarse o requiere revisión manual.

El diseño actual parte de una arquitectura Google-native y elimina dependencias del prototipo que ya no aplican al MVP, como la integración con HubSpot y la clasificación automática del tipo de documento.

## Objetivo del MVP

- recibir documentos legales mediante una API asíncrona
- descargar y validar archivos desde URLs provistas por Cashea
- extraer datos con Gemini según el tipo documental
- normalizar campos legales y fiscales a un modelo interno común
- cruzar la información entre documentos
- retornar un veredicto con evidencia y motivos claros

## Documentación

- Plan de ejecución: [docs/Execution_Plan_v2.md](/Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/docs/Execution_Plan_v2.md)
- Especificación de API: [docs/API_Spec_v2.md](/Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/docs/API_Spec_v2.md)
- Arquitectura MVP: [docs/Architecture_v2.md](/Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/docs/Architecture_v2.md)
- Guía de setup de GitHub para esta cuenta/repositorio: [docs/GitHub_Setup_Cashea.md](/Users/vitupro14/Documents/Projects/PathPilot/Cashea/onboarding_agent/docs/GitHub_Setup_Cashea.md)

## Alcance actual

Incluido:

- API asíncrona para crear jobs y consultar estado
- extracción por tipo de documento
- normalización de datos
- validación cruzada entre documentos
- despliegue sobre Google Cloud

Excluido del MVP:

- integración con HubSpot
- clasificación automática de documentos
- generación de contratos
- backoffice de revisión manual

## Flujo propuesto

1. Cashea envía un `merchant_id` y un conjunto de documentos tipados.
2. La API crea un `job` y lo encola para procesamiento.
3. Un worker descarga los archivos y ejecuta extracción estructurada con Gemini.
4. Los resultados se normalizan a un esquema interno canónico.
5. El motor de validación cruzada compara identidad, RIF, razón social, vigencia y facultades.
6. El sistema persiste el resultado y lo expone a través del endpoint de estado.

## Estado del repositorio

Actualmente este repositorio contiene la documentación saneada del proyecto y la base para iniciar la implementación del MVP.

## Próximo paso recomendado

Implementar la base del servicio con:

- API en `Cloud Run`
- procesamiento asíncrono con `Cloud Tasks` o `Pub/Sub`
- persistencia en `Firestore`
- extracción y validación con `Vertex AI Gemini`
