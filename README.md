# Axe Automation

Pequeña utilidad para ejecutar Axe Core con Playwright y generar un reporte HTML bonito.

Requisitos
- Node.js 16+ (o la versión que soporte Playwright del package.json)

Instalación

En PowerShell (desde la raíz del proyecto):

```powershell
npm install
# ó si usan yarn:
# yarn
```

Uso

Ejecuta la auditoría contra una URL pública o local:

```powershell
# Ejemplo
npm run axe -- --url "https://example.com"

# Si quieres especificar un archivo JSON de salida:
npm run axe -- --url "https://example.com" --output ./reports/example.json
```

Salida
- Genera un JSON con los resultados (axe-run) y un HTML con un resumen y detalles por violación.

Notas
- La herramienta usa Playwright (Chromium) en modo headless.
- Si quieres auditar páginas que requieren autenticación, podemos ampliar la CLI para aceptar cookies/session o pasos de login.

Siguientes pasos sugeridos
- Añadir opciones para ejecutar contra múltiples URLs.
- Integrar con CI para fallar el build si hay violaciones con impacto crítico.
- Añadir pruebas unitarias y ejemplos.
