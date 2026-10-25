import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import { isIP, isIPv6 } from "node:net";

/** ¿La dirección es interna o reservada (el propio servidor, la red local, metadatos de la nube…)? */
export function isPrivateAddress(address: string): boolean {
  if (isIPv6(address)) {
    const ip = address.toLowerCase().replace(/^\[|\]$/g, "");
    // IPv4 camuflada dentro de IPv6: ::ffff:10.0.0.1 o ::ffff:0a00:0001
    const mapped = ip.match(/^(?:::ffff:|64:ff9b::)(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateAddress(mapped[1]);
    const hex = ip.match(/^(?:::ffff:|64:ff9b::)([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const hi = parseInt(hex[1], 16);
      const lo = parseInt(hex[2], 16);
      return isPrivateAddress(`${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`);
    }
    if (ip === "::" || ip === "::1") return true;
    const first = parseInt(ip.split(":")[0] || "0", 16);
    if ((first & 0xfe00) === 0xfc00) return true; // fc00::/7 (local única)
    if ((first & 0xffc0) === 0xfe80) return true; // fe80::/10 (enlace local)
    if ((first & 0xff00) === 0xff00) return true; // ff00::/8 (multidifusión)
    if (ip.startsWith("2001:db8")) return true; // documentación
    return false;
  }

  const parts = address.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return true; // no es una IP válida: se rechaza
  const [a, b] = parts;
  return (
    a === 0 || // red "esta máquina"
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    (a === 169 && b === 254) || // enlace local y metadatos de la nube
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && parts[2] === 0) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224 // multidifusión y reservadas
  );
}

/**
 * Resolución de nombres que rechaza direcciones internas EN EL MOMENTO de conectar.
 * Así un nombre que cambia de dirección entre la comprobación y la conexión (DNS rebinding) tampoco pasa.
 */
const safeLookup: typeof dnsLookup = ((hostname: string, options: unknown, callback: (...args: unknown[]) => void) => {
  const cb = typeof options === "function" ? (options as typeof callback) : callback;
  const opts = typeof options === "object" && options ? (options as { all?: boolean }) : {};
  dnsLookup(hostname, { all: true }, (error, addresses: LookupAddress[]) => {
    if (error) return cb(error);
    if (!addresses?.length || addresses.some((a) => isPrivateAddress(a.address))) {
      return cb(Object.assign(new Error("Dirección no permitida"), { code: "EBLOCKED" }));
    }
    if (opts.all) return cb(null, addresses);
    cb(null, addresses[0].address, addresses[0].family);
  });
}) as typeof dnsLookup;

const MAX_BYTES = 600 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 6000;

type Result = { ok: true; finalUrl: string; html: string } | { ok: false; message: string };

/** Valida el enlace antes de pedirlo: solo http(s) normales, sin usuario ni contraseña ni puertos raros. */
export function checkUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (url.username || url.password) return null;
  if (url.port && url.port !== "80" && url.port !== "443") return null;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (!host || host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) return null;
  if (isIP(host) && isPrivateAddress(host)) return null;
  return url;
}

/** Descarga el HTML de una página pública (con límite de tamaño, tiempo y redirecciones). */
export async function fetchHtml(rawUrl: string, redirectsLeft = MAX_REDIRECTS): Promise<Result> {
  const url = checkUrl(rawUrl);
  if (!url) return { ok: false, message: "Ese enlace no se puede consultar." };

  return new Promise<Result>((resolve) => {
    const client = url.protocol === "https:" ? https : http;
    const request = client.get(
      url,
      {
        lookup: safeLookup,
        timeout: TIMEOUT_MS,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; IbashoBot/1.0; vista previa de enlaces)",
          accept: "text/html,application/xhtml+xml",
          "accept-language": "es-ES,es;q=0.9,en;q=0.8",
          "accept-encoding": "identity",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;

        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          if (redirectsLeft <= 0) return resolve({ ok: false, message: "El enlace tiene demasiadas redirecciones." });
          let next: string;
          try {
            next = new URL(response.headers.location, url).toString();
          } catch {
            return resolve({ ok: false, message: "El enlace redirige a una dirección no válida." });
          }
          // Cada salto se vuelve a validar desde cero.
          return fetchHtml(next, redirectsLeft - 1).then(resolve);
        }

        if (status < 200 || status >= 300) {
          response.resume();
          return resolve({ ok: false, message: "La tienda no dejó ver esa página." });
        }
        const type = String(response.headers["content-type"] ?? "").toLowerCase();
        if (!type.includes("html")) {
          response.resume();
          return resolve({ ok: false, message: "Ese enlace no es una página web." });
        }

        const chunks: Buffer[] = [];
        let size = 0;
        const finish = () => {
          const charset = type.match(/charset=([\w-]+)/)?.[1] ?? "utf-8";
          let html: string;
          try {
            html = new TextDecoder(charset).decode(Buffer.concat(chunks));
          } catch {
            html = Buffer.concat(chunks).toString("utf-8");
          }
          resolve({ ok: true, finalUrl: url.toString(), html });
        };
        response.on("data", (chunk: Buffer) => {
          size += chunk.length;
          chunks.push(chunk);
          if (size >= MAX_BYTES) {
            response.destroy(); // con el principio de la página basta: los datos están en el <head>
            finish();
          }
        });
        response.on("end", finish);
        response.on("error", () => resolve({ ok: false, message: "Se cortó la conexión con la tienda." }));
      },
    );
    request.on("timeout", () => {
      request.destroy();
      resolve({ ok: false, message: "La tienda tardó demasiado en responder." });
    });
    request.on("error", (error: NodeJS.ErrnoException) =>
      resolve({
        ok: false,
        message: error.code === "EBLOCKED" ? "Ese enlace no se puede consultar." : "No se pudo abrir ese enlace.",
      }),
    );
  });
}
