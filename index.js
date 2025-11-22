import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Endpoint principal
app.get("/", (req, res) => res.send("Gamepass Creator API Running"));

// Endpoint para obtener Gamepasses creados por un jugador
app.get("/creator-gamepasses", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "Falta userId" });

  try {
    console.log(`🔹 Buscando juegos del jugador: ${userId}`);

    // 1️⃣ Obtener juegos del jugador
    const gamesUrl = `https://games.roblox.com/v1/users/${userId}/games?sortOrder=Asc&limit=100`;
    const gamesData = await fetch(gamesUrl).then(r => r.json());

    if (!gamesData.data || gamesData.data.length === 0) {
      console.log("❌ El jugador no tiene juegos creados");
      return res.json({ gamepasses: [] });
    }

    const allGamepasses = [];

    // 2️⃣ Recorrer cada juego
    for (const game of gamesData.data) {
      console.log(`🔹 Revisando juego: ${game.name} (ID: ${game.id})`);

      const gpUrl = `https://games.roblox.com/v1/games/${game.id}/game-passes`;
      const gpData = await fetch(gpUrl).then(r => r.json());

      if (!gpData.data || gpData.data.length === 0) {
        console.log(`⚠️ Juego "${game.name}" no tiene Gamepasses`);
        continue;
      }

      gpData.data.forEach(gp => {
        allGamepasses.push({
          gameId: game.id,
          gameName: game.name,
          gamepassId: gp.id,
          gamepassName: gp.name
        });
      });
    }

    console.log(`✅ Total Gamepasses encontrados: ${allGamepasses.length}`);
    res.json({ gamepasses: allGamepasses });

  } catch (err) {
    console.error("❌ Error obteniendo Gamepasses:", err);
    res.status(500).json({ error: "Error al obtener gamepasses" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`));
