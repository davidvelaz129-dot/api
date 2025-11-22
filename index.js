import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
    res.send("Gamepass API Running");
});

// Endpoint para verificar gamepass
app.get("/check", async (req, res) => {
    const userId = req.query.userId;
    const gamepassId = req.query.gamepassId;

    if (!userId || !gamepassId) {
        return res.status(400).json({ error: "Faltan parámetros" });
    }

    try {
        const url = `https://inventory.roblox.com/v1/users/${userId}/items/GamePass/${gamepassId}`;
        const data = await fetch(url).then(r => r.json());

        const owns = data?.data?.length > 0 || false;

        return res.json({ owns });
    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al verificar" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`API corriendo en puerto ${PORT}`));
