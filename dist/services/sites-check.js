"use strict";
// src/cron-checker.ts
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ejecutarVerificacion = ejecutarVerificacion;
exports.programarTareaCron = programarTareaCron;
const node_cron_1 = __importDefault(require("node-cron"));
const db_1 = require("../database/db");
const TIMEOUT_MS = 30000;
const EVENT_NAME = "dominio_status";
const normalizarUrl = (dominio) => {
    if (dominio.startsWith("http://") || dominio.startsWith("https://")) {
        return dominio;
    }
    return `https://${dominio}`;
};
function emitStatus(io, pageId, url, statusEmoji, message) {
    const logMessage = `${pageId} ${statusEmoji} ${message} = ${url}`;
    io.emit(EVENT_NAME, {
        timestamp: new Date().toISOString(),
        pageId: pageId,
        url: url,
        message: logMessage,
        isAlert: statusEmoji === "🔴" || statusEmoji === "🟠",
    });
    console.log(logMessage);
}
function chequearDominio(dominio, io) {
    return __awaiter(this, void 0, void 0, function* () {
        const url = normalizarUrl(dominio.url);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);
        let statusEmoji;
        let statusMessage;
        try {
            const respuesta = yield fetch(url, {
                signal: controller.signal,
            });
            clearTimeout(timeoutId);
            const statusCode = respuesta.status;
            const contenido = yield respuesta.text();
            if (statusCode >= 200 && statusCode < 300) {
                if (contenido.trim().length < 50) {
                    statusEmoji = "🟡";
                    statusMessage = "EN LINEA/BLANCO";
                }
                else {
                    statusEmoji = "🟢";
                    statusMessage = "EN LINEA";
                }
            }
            else if (statusCode >= 400 && statusCode < 500) {
                statusEmoji = "🟡";
                statusMessage = "EN LINEA/ERROR 400s";
                yield db_1.prisma.pages.update({
                    where: { id: dominio.id },
                    data: { status: "INACTIVE" },
                });
            }
            else if (statusCode >= 500) {
                statusEmoji = "🔴";
                statusMessage = "CAIDO 500s";
                yield db_1.prisma.pages.update({
                    where: { id: dominio.id },
                    data: { status: "FAILED" },
                });
            }
            else {
                statusEmoji = "🔴";
                statusMessage = "CAIDO ERROR (STATUS DESCONOCIDO)";
                yield db_1.prisma.pages.update({
                    where: { id: dominio.id },
                    data: { status: "FAILED" },
                });
            }
            emitStatus(io, dominio.id, url, statusEmoji, statusMessage);
        }
        catch (error) {
            clearTimeout(timeoutId);
            if (error instanceof Error && error.name === "AbortError") {
                statusEmoji = "🔴";
                statusMessage = "CAIDO (TIMEOUT)";
                yield db_1.prisma.pages.update({
                    where: { id: dominio.id },
                    data: { status: "FAILED" },
                });
            }
            else if (error instanceof Error &&
                (error.message.includes("getaddrinfo") ||
                    error.message.includes("ERR_INVALID_URL"))) {
                statusEmoji = "🟠";
                statusMessage = "URL INVALIDA/DNS";
                yield db_1.prisma.pages.update({
                    where: { id: dominio.id },
                    data: { status: "FAILED" },
                });
            }
            else {
                statusEmoji = "🔴";
                statusMessage = "CAIDO ERROR (CONEXIÓN)";
                yield db_1.prisma.pages.update({
                    where: { id: dominio.id },
                    data: { status: "FAILED" },
                });
            }
            emitStatus(io, dominio.id, url, statusEmoji, statusMessage);
        }
    });
}
// Ahora recibe la instancia de Socket.IO
function ejecutarVerificacion(io) {
    return __awaiter(this, void 0, void 0, function* () {
        const dominios = yield db_1.prisma.pages.findMany();
        io.emit(EVENT_NAME, {
            message: `--- INICIANDO VERIFICACIÓN CRON: ${new Date().toLocaleString()} ---`,
        });
        console.log(`\n--- INICIANDO VERIFICACIÓN CRON: ${new Date().toLocaleString()} ---`);
        for (const dominio of dominios) {
            // Le pasamos la instancia de IO a cada chequeo
            yield chequearDominio(dominio, io);
        }
        io.emit(EVENT_NAME, { message: `--- VERIFICACIÓN CRON FINALIZADA ---` });
        console.log(`--- VERIFICACIÓN CRON FINALIZADA ---`);
    });
}
// Exportamos la función que programa la tarea cron
function programarTareaCron(io) {
    // La tarea programada llama a ejecutarVerificacion y le pasa 'io'
    return node_cron_1.default.schedule("*/30 * * * *", () => ejecutarVerificacion(io));
}
