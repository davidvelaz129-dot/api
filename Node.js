import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Lista de todos los gamepasses de tu juego
const gamepasses = [
  { Id: 123456, Name: "VIP" },
  { Id: 234567, Name: "Servidor" },
  { Id: 345678, Name: "OtroGamepass" }
];

app.get("/", (req, res) => {
  res.send("Gamepass API Running");
});

// Nuevo endpoint para obtener todos los gamepasses del jugador
app.get("/all", async (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: "Falta userId" });

  const owned = [];

  for (const gp of gamepasses) {
    try {
      const url = `https://inventory.roblox.com/v1/users/${userId}/items/GamePass/${gp.Id}`;
      const data = await fetch(url).then(r => r.json());
      if (data?.data?.length > 0) {
        owned.push({ Id: gp.Id, Name: gp.Name });
      }
    } catch (err) {
      console.error(err);
    }
  }

  res.json({ gamepasses: owned });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`));
