// index.js
// API en Node.js + Express para obtener todas las experiencias de un usuario de Roblox
// y listar todos los Gamepasses asociados a cada experiencia.
//
// Características:
// - Endpoint raíz "/" para prueba.
// - Endpoint "/gamepasses/:userId" que:
//     1) Recibe un UserId de Roblox.
//     2) Busca todas las experiencias (juegos) creadas por ese usuario (públicas y, opcionalmente, privadas si se configura ROBLOSECURITY).
//     3) Obtiene todos los Gamepasses asociados por experiencia.
//     4) Devuelve JSON con la estructura solicitada.
// - Incluye CORS para consumo desde IA/scripts/Roblox Studio via HTTPS.
// - Manejo de errores con try/catch y mensajes claros.
// - Logs de consola: juegos encontrados, juegos sin gamepasses, total de gamepasses.
//
// Nota importante sobre experiencias privadas:
// Para listar experiencias privadas del desarrollador, Roblox requiere autenticación.
// Si defines la variable de entorno ROBLOSECURITY con tu cookie de sesión válida (del
// desarrollador propietario), la API intentará usar endpoints de “develop” para ampliar
// resultados. Sin esto, sólo se devolverán experiencias públicas del usuario.

// -----------------------------
// Dependencias y configuración
// -----------------------------
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();

// Habilitar CORS (ajusta origins si quieres restringir)
app.use(cors());

// Health check / test
app.get('/', (_req, res) => {
  res.json({ ok: true, message: 'API Roblox Gamepasses – listo para usar.' });
});

// -----------------------------
// Utilidades de solicitud HTTP
// -----------------------------

// Construye headers para llamadas a APIs de Roblox.
// Si ROBLOSECURITY está definida, se agrega la cookie para endpoints que lo requieren.
function buildRobloxHeaders() {
  const headers = {
    'User-Agent': 'Roblox-Gamepass-API/1.0',
    'Accept': 'application/json',
  };

  // Si quieres ampliar acceso (experiencias privadas del dev), agrega la cookie .ROBLOSECURITY
  // desde variables de entorno (NO la hardcodes en el repo).
  if (process.env.ROBLOSECURITY) {
    headers['Cookie'] = `.ROBLOSECURITY=${process.env.ROBLOSECURITY}`;
    // X-CSRF-Token solo si un endpoint lo exige en POST; aquí usamos GET.
  }

  return headers;
}

// Helper: pausa breve para evitar rate limits
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// -----------------------------
// Lógica de obtención de datos
// -----------------------------

// 1) Obtiene experiencias públicas del usuario (sin auth)
// Endpoint: games.roblox.com/v2/users/:userId/games
async function fetchPublicExperiencesByUser(userId) {
  const headers = buildRobloxHeaders();
  const experiences = [];

  // Paginación: el endpoint usa cursor; iteramos hasta agotar páginas o máximo de seguridad
  let cursor = null;
  let safetyCounter = 0;

  do {
    const url = `https://games.roblox.com/v2/users/${userId}/games?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const { data } = await axios.get(url, { headers });
    // data: { data: [{ id, name, ... universeId? }], nextPageCursor }
    if (Array.isArray(data.data)) {
      for (const item of data.data) {
        // En este endpoint, "id" es universeId del juego listado.
        experiences.push({
          universeId: item.id,
          experienceName: item.name,
        });
      }
    }
    cursor = data.nextPageCursor || null;
    safetyCounter++;
    if (safetyCounter > 20) break; // seguridad
    await delay(100); // cortesía para la API
  } while (cursor);

  return experiences;
}

// 2) (Opcional, si hay ROBLOSECURITY) Obtiene experiencias (incluyendo privadas del dev)
// Endpoint: develop.roblox.com/v1/universes/list?userId=...
// Nota: Este endpoint puede cambiar; si no existe en tu caso, considera
// usar otros endpoints de “develop” o “creator” que expongan universos del usuario autenticado.
async function fetchPrivateExperiencesByUserIfPossible(userId) {
  if (!process.env.ROBLOSECURITY) {
    return [];
  }

  const headers = buildRobloxHeaders();

  // Intento 1: listado directo por usuario en develop
  // Si este endpoint no retorna, se capturará error y continuaremos sin privadas.
  try {
    const url = `https://develop.roblox.com/v1/universes/list?userId=${userId}&pageSize=50`;
    const { data } = await axios.get(url, { headers });
    // data: { data: [{ id, name, ... }], nextPageCursor }
    const collected = [];
    if (Array.isArray(data.data)) {
      for (const u of data.data) {
        collected.push({
          universeId: u.id,
          experienceName: u.name,
        });
      }
    }

    // Paginación opcional
    let cursor = data.nextPageCursor || null;
    let safetyCounter = 0;
    while (cursor) {
      const pageUrl = `https://develop.roblox.com/v1/universes/list?userId=${userId}&pageSize=50&cursor=${encodeURIComponent(cursor)}`;
      const page = await axios.get(pageUrl, { headers });
      if (Array.isArray(page.data.data)) {
        for (const u of page.data.data) {
          collected.push({
            universeId: u.id,
            experienceName: u.name,
          });
        }
      }
      cursor = page.data.nextPageCursor || null;
      safetyCounter++;
      if (safetyCounter > 20) break;
      await delay(100);
    }

    return collected;
  } catch (err) {
    // Si falla, solo informamos en log y seguimos con públicas.
    console.warn('No se pudieron obtener experiencias privadas desde develop.roblox.com. Continuando con públicas.');
    return [];
  }
}

// 3) Obtiene nombre del universo (experiencia) si no lo tenemos o para asegurar consistencia
// Endpoint: games.roblox.com/v1/games?universeIds=...
async function fetchUniverseNames(universeIds) {
  if (!Array.isArray(universeIds) || universeIds.length === 0) return {};
  const headers = buildRobloxHeaders();
  const chunks = [];
  const map = {};

  // Partir en lotes de tamaño 50 (límite típico)
  for (let i = 0; i < universeIds.length; i += 50) {
    chunks.push(universeIds.slice(i, i + 50));
  }

  for (const batch of chunks) {
    const url = `https://games.roblox.com/v1/games?universeIds=${batch.join(',')}`;
    const { data } = await axios.get(url, { headers });
    if (Array.isArray(data.data)) {
      for (const item of data.data) {
        map[item.id] = item.name;
      }
    }
    await delay(100);
  }

  return map;
}

// 4) Obtiene lugares (placeId y nombres) de un universo
// Endpoint: places.roblox.com/v1/universes/{universeId}/places
async function fetchPlacesByUniverse(universeId) {
  const headers = buildRobloxHeaders();
  try {
    const url = `https://places.roblox.com/v1/universes/${universeId}/places?limit=50`;
    const { data } = await axios.get(url, { headers });
    // data: { data: [{ id: placeId, name: placeName, ... }], nextPageCursor }
    const places = [];
    if (Array.isArray(data.data)) {
      places.push(...data.data.map((p) => ({ placeId: p.id, placeName: p.name })));
    }
    // Paginación si hubiera más de 50
    let cursor = data.nextPageCursor || null;
    let safetyCounter = 0;
    while (cursor) {
      const pageUrl = `https://places.roblox.com/v1/universes/${universeId}/places?limit=50&cursor=${encodeURIComponent(cursor)}`;
      const page = await axios.get(pageUrl, { headers });
      if (Array.isArray(page.data.data)) {
        places.push(...page.data.data.map((p) => ({ placeId: p.id, placeName: p.name })));
      }
      cursor = page.data.nextPageCursor || null;
      safetyCounter++;
      if (safetyCounter > 20) break;
      await delay(100);
    }
    return places;
  } catch (err) {
    // Si no se puede obtener lugares, devolvemos arreglo vacío.
    return [];
  }
}

// 5) Obtiene Gamepasses asociados a un universo.
// En la práctica, los Gamepasses se publican en el catálogo con creador tipo "Universe".
// Endpoint: catalog.roblox.com/v1/search/items?category=GamePass&creatorType=Universe&creatorTargetId={universeId}
async function fetchGamepassesByUniverse(universeId) {
  const headers = buildRobloxHeaders();
  const gamepasses = [];

  let cursor = null;
  let safetyCounter = 0;

  do {
    const url = `https://catalog.roblox.com/v1/search/items?category=GamePass&creatorType=Universe&creatorTargetId=${universeId}&limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const { data } = await axios.get(url, { headers });
    // data: { items: [{ id, name, ... }], nextPageCursor }
    if (Array.isArray(data.items)) {
      for (const item of data.items) {
        gamepasses.push({
          gamepassId: item.id,
          gamepassName: item.name,
        });
      }
    }
    cursor = data.nextPageCursor || null;
    safetyCounter++;
    if (safetyCounter > 20) break;
    await delay(150);
  } while (cursor);

  return gamepasses;
}

// -----------------------------
// Endpoint principal solicitado
// -----------------------------
app.get('/gamepasses/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    if (!userId || isNaN(Number(userId))) {
      return res.status(400).json({
        ok: false,
        message: 'Parámetro userId inválido. Debe ser numérico.',
      });
    }

    console.log(`Iniciando búsqueda de experiencias y gamepasses para userId=${userId}...`);

    // Paso A: experiencias públicas
    const publicExperiences = await fetchPublicExperiencesByUser(userId);

    // Paso B (opcional): experiencias privadas si existe ROBLOSECURITY
    const privateExperiences = await fetchPrivateExperiencesByUserIfPossible(userId);

    // Unir y deduplicar por universeId
    const allExperiencesMap = new Map();
    for (const exp of [...publicExperiences, ...privateExperiences]) {
      if (!allExperiencesMap.has(exp.universeId)) {
        allExperiencesMap.set(exp.universeId, exp);
      }
    }
    const allExperiences = Array.from(allExperiencesMap.values());

    // Log: total de juegos encontrados
    console.log(`Juegos (experiencias) encontrados: ${allExperiences.length}`);

    if (allExperiences.length === 0) {
      console.log('No se encontraron experiencias para el usuario.');
      return res.json({ ok: true, gamepasses: [], message: 'Sin experiencias para este usuario.' });
    }

    // Asegurar nombres de experiencia (algunos endpoints no los traen o pueden variar)
    const universeIds = allExperiences.map((e) => e.universeId);
    const universeNameMap = await fetchUniverseNames(universeIds);

    const results = [];
    let totalGamepasses = 0;

    // Iterar por experiencia
    for (const exp of allExperiences) {
      const experienceName = exp.experienceName || universeNameMap[exp.universeId] || 'Desconocido';

      // Obtener lugares (placeId y nombre) para esta experiencia
      const places = await fetchPlacesByUniverse(exp.universeId);

      // Obtener gamepasses por universo
      const gamepasses = await fetchGamepassesByUniverse(exp.universeId);

      if (gamepasses.length === 0) {
        console.log(`Juego sin Gamepasses: ${exp.universeId} (${experienceName})`);
      } else {
        console.log(`Gamepasses en juego ${exp.universeId} (${experienceName}): ${gamepasses.length}`);
      }

      // Si hay lugares, devolvemos cada combinación de gamepass + primer lugar (o todos los lugares si prefieres)
      // El requerimiento pide "gameId" y "gameName" (place). Tomaremos el root/primer lugar cuando exista.
      const placeRecord = places[0] || { placeId: null, placeName: null };

      for (const gp of gamepasses) {
        results.push({
          experienceId: exp.universeId,
          experienceName,
          gameId: placeRecord.placeId,
          gameName: placeRecord.placeName,
          gamepassId: gp.gamepassId,
          gamepassName: gp.gamepassName,
        });
      }

      totalGamepasses += gamepasses.length;
      // Pequeña pausa para no saturar APIs
      await delay(200);
    }

    // Log: total de gamepasses encontrados
    console.log(`Total de Gamepasses encontrados: ${totalGamepasses}`);

    // Respuesta
    return res.json({
      ok: true,
      count: results.length,
      gamepasses: results,
    });
  } catch (error) {
    // Manejo de errores claro
    console.error('Error en /gamepasses/:userId:', error?.message || error);
    return res.status(500).json({
      ok: false,
      message: 'Error interno al procesar la solicitud. Revisa los logs del servidor.',
      detail: error?.message || String(error),
    });
  }
});

// -----------------------------
// Servidor listo para despliegue
// -----------------------------
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}.`);
  console.log('Listo para desplegar en Render o Railway.');
  console.log('Endpoints:');
  console.log(`  GET /               -> prueba de salud`);
  console.log(`  GET /gamepasses/:userId -> JSON con gamepasses por experiencia`);
  console.log('Para incluir experiencias privadas del desarrollador, define ROBLOSECURITY en variables de entorno.');
});
