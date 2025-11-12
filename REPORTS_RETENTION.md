# Retención y limpieza de reportes de accesibilidad

Recomendaciones para almacenar y limpiar los reportes generados por la herramienta de auditoría (axe-core).

1. Política sugerida
   - Conservar reportes agregados (HTML) por al menos 90 días.
   - Conservar JSONs completos y capturas por 30 días por defecto.
   - Conservar indefinidamente reportes asociados a releases o fallos críticos (archivado).

2. Almacenamiento
   - En CI: subir artifacts con `actions/upload-artifact` (retención configurable).
   - Para largo plazo: subir a S3 / Azure Blob y aplicar lifecycle policies (transición a cold after 90 days, delete after 365 days, según política).

3. Automatización
   - Script local/servidor `scripts/cleanup-reports.ps1` permite eliminar archivos en `reports/` más antiguos que N días.
   - Integrar limpieza periódica usando GitHub Actions o una tarea programada (Task Scheduler / cron).

4. Seguridad y privacidad
   - Sanitizar PII, cookies y tokens antes de persistir.
   - Controlar acceso a buckets/artifacts.

5. Buenas prácticas
   - No versionar reportes en git.
   - Agregar metadata a cada reporte: timestamp, runId, gitSha, browser.
   - Comprimir JSONs antiguos para ahorrar espacio.

Ejemplo rápido de uso del script:

```powershell
# Ejecutar limpieza de 90 días
pwsh ./scripts/cleanup-reports.ps1 -Days 90 -ReportsPath .\reports
```
