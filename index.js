import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => res.send("Gamepass Creator API Running"));

// Endpoint para obtener todos los gamepasses creados por un jugador
app.get("/creator-gamepasses", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "Falta userId" });

  try {
    // 1️⃣ Obtener los juegos creados por el usuario
    const gamesUrl = `https://games.roblox.com/v1/users/${userId}/games?sortOrder=Asc&limit=100`;
    const gamesData = await fetch(gamesUrl).then(r => r.json());
    const games = gamesData.data || [];

    const allGamepasses = [];

    // 2️⃣ Para cada juego, obtener sus gamepasses
    for (const game of games) {
      const placeId = game.id;
      const gpUrl = `https://games.roblox.com/v1/games/${placeId}/game-passes`;
      const gpData = await fetch(gpUrl).then(r => r.json());
      if (gpData.data) {
        gpData.data.forEach(gp => {
          allGamepasses.push({
            gameId: placeId,
            gameName: game.name,
            gamepassId: gp.id,
            gamepassName: gp.name
          });
        });
      }
    }

    res.json({ gamepasses: allGamepasses });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error al obtener gamepasses" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`));
