const fs = require('fs');
const path = require('path');

// Carpeta donde se guardarán los archivos por página
const BASELINE_DIR = path.join(__dirname, '../../history/pages');

// Asegurar que la carpeta exista
if (!fs.existsSync(BASELINE_DIR)) {
    fs.mkdirSync(BASELINE_DIR, { recursive: true });
}

/**
 * Convierte una URL en un nombre de archivo válido.
 * Ej: "https://www.ford.ca/trucks" -> "www_ford_ca_trucks.json"
 */
function getBaselinePath(url) {
    const safeName = url
        .replace(/^https?:\/\//, '') // Quitar http://
        .replace(/[^a-z0-9]/gi, '_') // Reemplazar símbolos por _
        .toLowerCase();
    return path.join(BASELINE_DIR, `${safeName}.json`);
}

/**
 * Guarda la línea base de UNA sola URL optimizada
 */
function saveUrlBaseline(url, violations) {
    const filePath = getBaselinePath(url);
    
    // Optimización: Solo guardamos ID del error y Selectores CSS
    // Esto reduce drásticamente el tamaño del archivo
    const optimizedData = {
        url: url,
        timestamp: new Date().toISOString(),
        violations: violations.map(v => ({
            id: v.id,
            nodes: v.nodes.map(n => n.target) // Solo guardamos el selector
        }))
    };

    console.log(`[DEBUG] Saving ${url} to ${filePath}`);
    console.log(`[DEBUG] Violations count: ${violations.length}`);
    if (violations.length > 0) console.log(`[DEBUG] First violation: ${violations[0].id}`);

    fs.writeFileSync(filePath, JSON.stringify(optimizedData, null, 2));
    // console.log(`✅ Baseline guardado para: ${url}`);
}

/**
 * Lee la línea base de UNA sola URL
 */
function loadUrlBaseline(url) {
    const filePath = getBaselinePath(url);
    if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    }
    return null; // No existe baseline previo
}

module.exports = { saveUrlBaseline, loadUrlBaseline, getBaselinePath };
