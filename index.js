import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Endpoint principal
app.get("/", (req, res) => res.send("Gamepass Creator API Running"));

// Función para obtener todos los games/places de un usuario
async function getUserExperiences(userId) {
  try {
    const url = `https://games.roblox.com/v1/users/${userId}/experiences?limit=100`;
    const response = await fetch(url);
    const data = await response.json();
    return data.data || [];
  } catch (err) {
    console.error("Error obteniendo experiencias:", err);
    return [];
  }
}

// Función para obtener gamepasses de un juego
async function getGamepasses(gameId) {
  try {
    const url = `https://games.roblox.com/v1/games/${gameId}/game-passes`;
    const response = await fetch(url);
    const data = await response.json();
    return data.data || [];
  } catch (err) {
    console.error(`Error obteniendo gamepasses del juego ${gameId}:`, err);
    return [];
  }
}

app.get("/creator-gamepasses", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "Falta userId" });

  try {
    console.log(`🔹 Buscando experiencias del jugador: ${userId}`);
    const experiences = await getUserExperiences(userId);

    if (experiences.length === 0) {
      console.log("❌ No se encontraron experiencias para este jugador");
      return res.json({ gamepasses: [] });
    }

    const allGamepasses = [];

    for (const exp of experiences) {
      const places = exp.places || [];
      for (const place of places) {
        const gps = await getGamepasses(place.id);
        gps.forEach(gp => {
          allGamepasses.push({
            experienceId: exp.id,
            experienceName: exp.name,
            gameId: place.id,
            gameName: place.name,
            gamepassId: gp.id,
            gamepassName: gp.name
          });
        });
      }
    }

    console.log(`✅ Total Gamepasses encontrados: ${allGamepasses.length}`);
    res.json({ gamepasses: allGamepasses });
  } catch (err) {
    console.error("❌ Error general:", err);
    res.status(500).json({ error: "Error al obtener gamepasses" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`));
