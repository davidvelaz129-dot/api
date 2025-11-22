// index.js
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express();
app.use(cors());

// Endpoint raíz de prueba
app.get('/', (_req, res) => {
  res.json({ ok: true, message: 'API Roblox Gamepasses – listo para usar.' });
});

// Headers para llamadas a Roblox
function buildRobloxHeaders() {
  const headers = {
    'User-Agent': 'Roblox-Gamepass-API/1.0',
    'Accept': 'application/json',
  };
  if (process.env.ROBLOSECURITY) {
    headers['Cookie'] = `.ROBLOSECURITY=${process.env.ROBLOSECURITY}`;
  }
  return headers;
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Obtener experiencias públicas de un usuario
async function fetchPublicExperiencesByUser(userId) {
  const headers = buildRobloxHeaders();
  const experiences = [];
  let cursor = null;
  let safetyCounter = 0;

  do {
    const url = `https://games.roblox.com/v2/users/${userId}/games?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
    const { data } = await axios.get(url, { headers });
    if (Array.isArray(data.data)) {
      for (const item of data.data) {
        experiences.push({ universeId: item.id, experienceName: item.name });
      }
    }
    cursor = data.nextPageCursor || null;
    safetyCounter++;
    if (safetyCounter > 20) break;
    await delay(100);
  } while (cursor);

  return experiences;
}

// Obtener nombres de universos
async function fetchUniverseNames(universeIds) {
  if (!Array.isArray(universeIds) || universeIds.length === 0) return {};
  const headers = buildRobloxHeaders();
  const map = {};
  for (let i = 0; i < universeIds.length; i += 50) {
    const batch = universeIds.slice(i, i + 50);
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

// Obtener lugares de un universo
async function fetchPlacesByUniverse(universeId) {
  const headers = buildRobloxHeaders();
  try {
    const url = `https://places.roblox.com/v1/universes/${universeId}/places?limit=50`;
    const { data } = await axios.get(url, { headers });
    const places = [];
    if (Array.isArray(data.data)) {
      places.push(...data.data.map((p) => ({ placeId: p.id, placeName: p.name })));
    }
    return places;
  } catch {
    return [];
  }
}

// ✅ Función depurada para obtener Gamepasses desde el catálogo
async function fetchGamepassesByUniverse(universeId) {
  const headers = buildRobloxHeaders();
  const gamepasses = [];
  let cursor = null;
  let safetyCounter = 0;

  try {
    do {
      const url = `https://catalog.roblox.com/v1/search/items?category=GamePass&creatorType=Universe&creatorTargetId=${universeId}&limit=30${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      console.log("Consultando Gamepasses en:", url);

      const response = await axios.get(url, { headers });

      if (response.status !== 200) {
        console.warn(`Respuesta inesperada (${response.status}) para universo ${universeId}`);
        break;
      }

      const data = response.data;

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
  } catch (err) {
    if (err.response && err.response.status === 400) {
      console.warn(`Universo ${universeId} no tiene Gamepasses o no está habilitado para catálogo.`);
    } else {
      console.error(`Error obteniendo gamepasses para universo ${universeId}:`, err.message);
    }
  }

  return gamepasses;
}

// Endpoint principal
app.get('/gamepasses/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    if (!userId || isNaN(Number(userId))) {
      return res.status(400).json({ ok: false, message: 'Parámetro userId inválido.' });
    }

    console.log(`Iniciando búsqueda de experiencias y gamepasses para userId=${userId}...`);
    const publicExperiences = await fetchPublicExperiencesByUser(userId);
    const allExperiences = publicExperiences;

    console.log(`Juegos (experiencias) encontrados: ${allExperiences.length}`);
    if (allExperiences.length === 0) {
      return res.json({ ok: true, gamepasses: [], message: 'Sin experiencias para este usuario.' });
    }

    const universeIds = allExperiences.map((e) => e.universeId);
    const universeNameMap = await fetchUniverseNames(universeIds);

    const results = [];
    let totalGamepasses = 0;

    for (const exp of allExperiences) {
      const experienceName = exp.experienceName || universeNameMap[exp.universeId] || 'Desconocido';
      const places = await fetchPlacesByUniverse(exp.universeId);
      const gamepasses = await fetchGamepassesByUniverse(exp.universeId);

      if (gamepasses.length === 0) {
        console.log(`Juego sin Gamepasses: ${exp.universeId} (${experienceName})`);
      } else {
        console.log(`Gamepasses en juego ${exp.universeId} (${experienceName}): ${gamepasses.length}`);
      }

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
      await delay(200);
    }

    console.log(`Total de Gamepasses encontrados: ${totalGamepasses}`);
    return res.json({ ok: true, count: results.length, gamepasses: results });
  } catch (error) {
    console.error('Error en /gamepasses/:userId:', error?.message || error);
    return res.status(500).json({ ok: false, message: 'Error interno', detail: error?.message || String(error) });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor iniciado en puerto ${PORT}.`);
});
