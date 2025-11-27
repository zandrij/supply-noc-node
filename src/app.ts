import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import {
  ejecutarVerificacion,
  programarTareaCron,
} from "./services/sites-check";

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
const PORT = 3333;

app.use(cors());
app.use(express.json());

app.get("/", (req, res) => {
  res.send("Servidor de monitoreo en ejecución. Conéctate vía WebSocket en /");
});

io.on("connection", (socket) => {
  console.log(`Cliente conectado: ${socket.id}`);

  socket.on("disconnect", () => {
    console.log(`Cliente desconectado: ${socket.id}`);
  });
});

const tarea = programarTareaCron(io);
console.log(`Cron job programado para ejecutarse cada 30 minutos.`);

ejecutarVerificacion(io);

httpServer.listen(PORT, () => {
  console.log(`Servidor Socket.IO escuchando en http://localhost:${PORT}`);
});
