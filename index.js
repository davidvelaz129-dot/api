// index.js

const express = require('express');
const axios = require('axios');
const cors = require('cors'); // Para permitir peticiones desde cualquier origen (incluyendo Roblox Studio)

// --- Configuración de Express ---
const app = express();
const PORT = process.env.PORT || 3000;

// Habilitar CORS para todas las peticiones (Requisito 9)
app.use(cors({
    origin: '*', // Permite cualquier origen (servicios, scripts de Roblox, etc.)
    methods: ['GET'], // Solo permitimos el método GET
}));

app.use(express.json());

// --- URLs base de la API de Roblox ---
const BASE_URL_CREATIONS = "https://develop.roblox.com/v1/user/experiences";
const BASE_URL_GAMEPASSES = "https://economy.roblox.com/v1/assets";

// --- Endpoint de prueba (Requisito 8) ---
app.get('/', (req, res) => {
    res.status(200).json({
        message: "✅ API de Gamepasses de Roblox funcionando. Usa /api/gamepasses/:userId para obtener datos.",
        usage: "GET /api/gamepasses/12345678"
    });
});

// --- Endpoint Principal: Obtener Gamepasses (Requisitos 1-7, 10) ---
app.get('/api/gamepasses/:userId', async (req, res) => {
    const userId = req.params.userId;
    console.log(`\n--- INICIANDO BÚSQUEDA para UserId: ${userId} ---`);

    // 1. Validar el UserId
    if (isNaN(parseInt(userId))) {
        return res.status(400).json({
            error: "❌ Error: UserId inválido. Debe ser un número."
        });
    }

    let allGamepasses = [];
    let nextCursor = null;

    try {
        // --- Paso 1 & 2: Buscar todos los juegos (experiencias) del usuario ---
        let experiences = [];
        let pageCount = 0;

        // Bucle para manejar la paginación de la API de experiencias
        do {
            pageCount++;
            console.log(`[Paginación] Buscando experiencias, página ${pageCount}...`);
            const url = nextCursor ?
                `${BASE_URL_CREATIONS}?userId=${userId}&cursor=${nextCursor}&isArchived=false&limit=50&sortOrder=Asc` :
                `${BASE_URL_CREATIONS}?userId=${userId}&isArchived=false&limit=50&sortOrder=Asc`;

            const response = await axios.get(url, {
                headers: {
                    // No se necesita autenticación para experiencias públicas
                    'Accept': 'application/json'
                }
            });

            experiences.push(...response.data.data);
            nextCursor = response.data.nextPageCursor;

        } while (nextCursor);

        // Filtrar y extraer solo las experiencias que tienen un lugar (PlaceId) asociado.
        const validGames = experiences.filter(exp => exp.gameId && exp.placeId);

        console.log(`\n✅ Juegos encontrados (visibles): ${validGames.length}`); // Requisito 5 (Juegos encontrados)

        if (validGames.length === 0) {
            console.log(`[FIN] No se encontraron juegos públicos para el UserId: ${userId}`);
            return res.status(200).json({
                message: "No se encontraron juegos públicos o visibles para este usuario.",
                results: []
            });
        }

        let totalGamepassesFound = 0;
        let gamesWithoutGamepasses = 0;

        // --- Paso 3: Por cada juego, obtener todos los Gamepasses asociados ---
        for (const game of validGames) {
            const experienceId = game.id;
            const experienceName = game.name;
            const placeId = game.placeId; // El "PlaceId" es lo que la API llama "GameId" en este contexto
            const gameName = game.name;

            console.log(`\n[🔍 PROCESANDO] Experiencia ID: ${experienceId} - Nombre: ${experienceName}`);

            try {
                // La API de Gamepasses usa el PlaceId para listar los Gamepasses asociados a ese lugar.
                const gamepassesUrl = `${BASE_URL_GAMEPASSES}/${placeId}/game-pass`;

                const gamepassesResponse = await axios.get(gamepassesUrl);
                const gamepasses = gamepassesResponse.data.data; // Los Gamepasses están en el array 'data'

                if (gamepasses.length > 0) {
                    // Mapear los Gamepasses a la estructura de JSON solicitada (Requisito 4)
                    const formattedGamepasses = gamepasses.map(gp => {
                        totalGamepassesFound++;
                        return {
                            experienceId: experienceId,
                            experienceName: experienceName,
                            gameId: placeId,
                            gameName: gameName,
                            gamepassId: gp.id,
                            gamepassName: gp.name
                        };
                    });

                    allGamepasses.push(...formattedGamepasses);
                    console.log(`  - 🎁 Gamepasses encontrados: ${formattedGamepasses.length}`);
                } else {
                    console.log("  - 🚫 Juego sin Gamepasses asociados.");
                    gamesWithoutGamepasses++;
                }

            } catch (error) {
                // Manejo de errores específico para la llamada de Gamepasses
                console.error(`  - ❌ Error al obtener Gamepasses para ${experienceName} (ID: ${experienceId}): ${error.message}`);
                // Continuamos con el siguiente juego
            }
        }

        // --- Logs Finales (Requisito 5) ---
        console.log(`\n--- RESUMEN FINAL ---`);
        console.log(`🚫 Juegos sin Gamepasses: ${gamesWithoutGamepasses}`); // Requisito 5 (Juegos sin Gamepasses)
        console.log(`🎉 Total de Gamepasses encontrados: ${totalGamepassesFound}`); // Requisito 5 (Total de Gamepasses)
        console.log(`------------------------`);

        // --- Devolver el resultado final ---
        res.status(200).json({
            message: `Búsqueda completada para UserId: ${userId}`,
            results: allGamepasses
        });

    } catch (error) {
        // Manejo de errores global para la llamada de experiencias o errores inesperados (Requisito 6)
        console.error(`\n🔴 Error FATAL al buscar experiencias para UserId ${userId}:`, error.response?.status, error.message);

        // Devolver un error HTTP al cliente
        res.status(500).json({
            error: "❌ Error interno del servidor al procesar la solicitud.",
            details: error.message
        });
    }
});

// --- Iniciar Servidor ---
app.listen(PORT, () => {
    console.log(`🚀 Servidor Express escuchando en el puerto ${PORT}`);
    console.log(`🔗 Endpoint de ejemplo: http://localhost:${PORT}/api/gamepasses/261`); // Reemplaza '261' con un UserId de prueba
});
