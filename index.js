import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
app.use(cors());

app.get("/", (req, res) => {
    res.send("Gamepass API Running");
});

// 🔥 ENDPOINT PARA VERIFICAR GAMEPASS
app.get("/check", async (req, res) => {
    const userId = req.query.userId;
    const gamepassId = req.query.gamepassId;

    if (!userId || !gamepassId) {
        return res.status(400).json({ error: "Faltan parámetros" });
    }

    try {
        const url = `https://inventory.roblox.com/v1/users/${userId}/items/GamePass/${gamepassId}`;

        const data = await fetch(url).then(r => r.json());

        if (data && data.data && data.data.length > 0) {
            return res.json({ owns: true });
        } else {
            return res.json({ owns: false });
        }

    } catch (err) {
        console.error(err);
        return res.status(500).json({ error: "Error al verificar" });
    }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("API corriendo en el puerto " + PORT));
