# Hoja de Ruta del Proyecto (Mejoras)

Las mejoras se han ordenado de manera progresiva, desde ajustes de lectura básicos y configuraciones iniciales, hasta operaciones de mutación avanzadas y manejo de errores.

## Fase 1: Estabilización y Exploración (Lectura Avanzada)
*Antes de permitir la escritura, es mejor optimizar lo que ya existe para que el MCP y la IA sean más eficientes.* 

- [x] **Paginación automática en SELECTs:** Asegurar que si una tabla tiene millones de registros, un `execute_read_query` genérico aplique un `LIMIT` por defecto para no saturar el servidor ni el contexto del LLM.
- [x] **Selección de entorno de trabajo:** Permitir tener varios entornos configurados en el `.env` e indicar explícitamente con cuál de ellos se va a trabajar.
- [x] **Soporte para Relaciones y Llaves Foráneas (Foreign Keys):** Una herramienta para consultar cómo se relacionan las tablas entre sí, para que el LLM sepa automáticamente qué tablas cruzar en un `JOIN`.
- [ ] **Análisis de índices:** Herramienta para revisar qué índices tiene una tabla antes de realizar consultas pesadas.
- [x] **Lectura de modelos de MySQL Workbench (.mwb):** [PRIORIDAD] Crear una herramienta (`read_workbench_model`) que reciba la ruta de un archivo `.mwb` local, lo descomprima y parsee su XML interno para permitir a la IA analizar los cambios modelados antes de que se sincronicen con la base de datos de `development`.

## Fase 2: Fundamentos de Seguridad y Control
*Preparar el terreno asegurando que cuando se habiliten las escrituras, no haya riesgos de destruir datos por error.*

- [ ] **Control de permisos por entorno:** Restringir operaciones peligrosas (como DELETE o DROP) en entornos marcados como `producción`, pero permitirlos libremente en `desarrollo`.
- [ ] **Límites de seguridad (Safeguards):** 
  - Exigir siempre una cláusula `WHERE` en los `UPDATE` y `DELETE`.
  - Limitar el número máximo de filas modificadas por defecto a menos que se fuerce explícitamente.
- [ ] **Log de cambios (Auditoría):** Registrar cada consulta de mutación que realice el MCP (con timestamp) en un archivo local o una tabla para tener un historial de qué se modificó.

## Fase 3: Mutaciones Básicas (Escritura)
*Habilitar las operaciones de modificación de datos de forma controlada.*

- [ ] **Nuevas herramientas de escritura (`insert_record`, `update_record`, `delete_record`):** En lugar de inyectar SQL crudo, estas herramientas recibirían parámetros estructurados (tabla, datos, condiciones) para usar _prepared statements_ de MySQL y evitar SQL Injection.
- [ ] **Modo 'Simulación' (Dry-Run / EXPLAIN):** Antes de ejecutar un `UPDATE` o `DELETE` masivo, devolver una estimación de las filas afectadas o el resultado de un `EXPLAIN` para verificar si es lo que se espera.

## Fase 4: Resiliencia y Operaciones Complejas
*Manejar escenarios donde la IA necesite hacer muchos cambios de golpe o el proceso se interrumpa.*

- [ ] **Transacciones Internas Automatizadas:** Modificar el código interno de las herramientas de escritura en `index.js` para que envuelvan automáticamente las operaciones complejas o por lotes en transacciones (`BEGIN ... COMMIT`). Si el modelo interrumpe la conexión o envía datos mal formados a la mitad, el sistema ejecutará un `ROLLBACK` automático.
- [ ] **Procesamiento por Lotes (Batching) para Mutaciones:** Crear herramientas como `batch_update_records` o `batch_insert_records` que acepten un array de registros en una sola llamada.
- [ ] **Transacciones explícitas:** (Opcional) Herramientas para `iniciar`, `confirmar` (commit) y `revertir` (rollback) transacciones manualmente por la IA, asegurando que múltiples llamadas se hagan de forma atómica.
