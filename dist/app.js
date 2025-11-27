"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const http_1 = require("http");
const socket_io_1 = require("socket.io");
const cors_1 = __importDefault(require("cors"));
const sites_check_1 = require("./services/sites-check");
const app = (0, express_1.default)();
const httpServer = (0, http_1.createServer)(app);
const io = new socket_io_1.Server(httpServer, {
    cors: {
        origin: "*",
        methods: ["GET", "POST"],
    },
});
const PORT = 3333;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
app.get("/", (req, res) => {
    res.send("Servidor de monitoreo en ejecución. Conéctate vía WebSocket en /");
});
io.on("connection", (socket) => {
    console.log(`Cliente conectado: ${socket.id}`);
    socket.on("disconnect", () => {
        console.log(`Cliente desconectado: ${socket.id}`);
    });
});
const tarea = (0, sites_check_1.programarTareaCron)(io);
console.log(`Cron job programado para ejecutarse cada 30 minutos.`);
(0, sites_check_1.ejecutarVerificacion)(io);
httpServer.listen(PORT, () => {
    console.log(`Servidor Socket.IO escuchando en http://localhost:${PORT}`);
});
