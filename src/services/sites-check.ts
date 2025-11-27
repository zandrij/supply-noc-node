import cron from "node-cron";
import { Pages } from "@prisma/client";
import { Server } from "socket.io";
import { prisma } from "../database/db";

const TIMEOUT_MS = 50000;
const EVENT_NAME = "dominio_status";

const normalizarUrl = (dominio: string): string => {
  if (dominio.startsWith("http://") || dominio.startsWith("https://")) {
    return dominio;
  }
  return `https://${dominio}`;
};

function emitStatus(
  io: Server,
  pageId: number,
  url: string,
  statusEmoji: string,
  message: string
) {
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

async function chequearDominio(dominio: Pages, io: Server) {
  const url = normalizarUrl(dominio.url);

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let statusEmoji: string;
  let statusMessage: string;

  try {
    const respuesta = await fetch(url, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const statusCode = respuesta.status;
    const contenido = await respuesta.text();

    if (statusCode >= 200 && statusCode < 300) {
      if (contenido.trim().length < 50) {
        statusEmoji = "🟡";
        statusMessage = "EN LINEA/BLANCO";
      } else {
        statusEmoji = "🟢";
        statusMessage = "EN LINEA";
      }
    } else if (statusCode >= 400 && statusCode < 500) {
      statusEmoji = "🟡";
      statusMessage = "EN LINEA/ERROR 400s";
      await prisma.pages.update({
        where: { id: dominio.id },
        data: { status: "INACTIVE" },
      });
    } else if (statusCode >= 500) {
      statusEmoji = "🔴";
      statusMessage = "CAIDO 500s";
      await prisma.pages.update({
        where: { id: dominio.id },
        data: { status: "FAILED" },
      });
    } else {
      statusEmoji = "🔴";
      statusMessage = "CAIDO ERROR (STATUS DESCONOCIDO)";
      await prisma.pages.update({
        where: { id: dominio.id },
        data: { status: "FAILED" },
      });
    }

    emitStatus(io, dominio.id, url, statusEmoji, statusMessage);
  } catch (error) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === "AbortError") {
      statusEmoji = "🔴";
      statusMessage = "CAIDO (TIMEOUT)";
      await prisma.pages.update({
        where: { id: dominio.id },
        data: { status: "FAILED" },
      });
    } else if (
      error instanceof Error &&
      (error.message.includes("getaddrinfo") ||
        error.message.includes("ERR_INVALID_URL"))
    ) {
      statusEmoji = "🟠";
      statusMessage = "URL INVALIDA/DNS";
      await prisma.pages.update({
        where: { id: dominio.id },
        data: { status: "FAILED" },
      });
    } else {
      statusEmoji = "🔴";
      statusMessage = "CAIDO ERROR (CONEXIÓN)";
      await prisma.pages.update({
        where: { id: dominio.id },
        data: { status: "FAILED" },
      });
    }

    emitStatus(io, dominio.id, url, statusEmoji, statusMessage);
  }
}

// Ahora recibe la instancia de Socket.IO
export async function ejecutarVerificacion(io: Server) {
  const dominios = await prisma.pages.findMany();

  io.emit(EVENT_NAME, {
    message: `--- INICIANDO VERIFICACIÓN CRON: ${new Date().toLocaleString()} ---`,
  });
  console.log(
    `\n--- INICIANDO VERIFICACIÓN CRON: ${new Date().toLocaleString()} ---`
  );

  for (const dominio of dominios) {
    // Le pasamos la instancia de IO a cada chequeo
    await chequearDominio(dominio, io);
  }

  io.emit(EVENT_NAME, { message: `--- VERIFICACIÓN CRON FINALIZADA ---` });
  console.log(`--- VERIFICACIÓN CRON FINALIZADA ---`);
}

// Exportamos la función que programa la tarea cron
export function programarTareaCron(io: Server) {
  // La tarea programada llama a ejecutarVerificacion y le pasa 'io'
  return cron.schedule("*/30 * * * *", () => ejecutarVerificacion(io));
}
