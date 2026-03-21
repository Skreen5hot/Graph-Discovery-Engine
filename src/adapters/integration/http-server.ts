/**
 * HTTP Server — Minimal router for RPM API endpoints
 *
 * Built on Node.js built-in `http` module. No Express, no runtime deps.
 * Adapter-layer code — MUST NOT be imported by kernel.
 *
 * Provides:
 * - Route registration (GET, POST, DELETE)
 * - JSON request body parsing
 * - Role-based access control via request headers
 * - Structured JSON responses with proper content types
 * - Error handling with TranslatedError format
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Parsed request with route params and body. */
export interface ParsedRequest {
  method: string;
  path: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: unknown;
  role: "sme" | "curator" | null;
  raw: IncomingMessage;
}

/** Route handler function. */
export type RouteHandler = (req: ParsedRequest, res: ServerResponse) => Promise<void>;

/** Route definition. */
interface Route {
  method: string;
  pattern: RegExp;
  paramNames: string[];
  handler: RouteHandler;
}

// ---------------------------------------------------------------------------
// Request Parsing
// ---------------------------------------------------------------------------

/** Parse query string from URL. */
function parseQueryString(url: string): Record<string, string> {
  const queryIndex = url.indexOf("?");
  if (queryIndex === -1) return {};
  const queryString = url.substring(queryIndex + 1);
  const params: Record<string, string> = {};
  for (const pair of queryString.split("&")) {
    const [key, value] = pair.split("=");
    if (key) params[decodeURIComponent(key)] = decodeURIComponent(value ?? "");
  }
  return params;
}

/** Extract path without query string. */
function extractPath(url: string): string {
  const queryIndex = url.indexOf("?");
  return queryIndex === -1 ? url : url.substring(0, queryIndex);
}

/** Read request body as JSON. */
async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8");
      if (raw.length === 0) return resolve(undefined);
      try {
        resolve(JSON.parse(raw));
      } catch {
        resolve(raw);
      }
    });
    req.on("error", reject);
  });
}

/** Extract role from request headers. */
function extractRole(req: IncomingMessage): "sme" | "curator" | null {
  const roleHeader = req.headers["x-rpm-role"] as string | undefined;
  if (roleHeader === "curator") return "curator";
  if (roleHeader === "sme") return "sme";
  return null;
}

// ---------------------------------------------------------------------------
// Response Helpers
// ---------------------------------------------------------------------------

/** Send JSON response. */
export function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(json),
  });
  res.end(json);
}

/** Send error response in TranslatedError format. */
export function sendError(
  res: ServerResponse,
  status: number,
  userMessage: string,
  severity: "validation" | "system" = "system",
): void {
  sendJson(res, status, {
    "@type": "rpm:TranslatedError",
    userMessage,
    severity,
    placement: severity === "validation" ? "inline" : "banner",
    clauseIndex: 0,
  });
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

/** Convert a route pattern like "/rpm/overrides/:overrideId" to a RegExp. */
function patternToRegex(pattern: string): { regex: RegExp; paramNames: string[] } {
  const paramNames: string[] = [];
  const regexStr = pattern.replace(/:([a-zA-Z]+)/g, (_match, name) => {
    paramNames.push(name);
    return "([^/]+)";
  });
  return { regex: new RegExp(`^${regexStr}$`), paramNames };
}

/**
 * Create a minimal HTTP router.
 */
export function createRouter() {
  const routes: Route[] = [];

  function addRoute(method: string, pattern: string, handler: RouteHandler): void {
    const { regex, paramNames } = patternToRegex(pattern);
    routes.push({ method: method.toUpperCase(), pattern: regex, paramNames, handler });
  }

  return {
    get: (pattern: string, handler: RouteHandler) => addRoute("GET", pattern, handler),
    post: (pattern: string, handler: RouteHandler) => addRoute("POST", pattern, handler),
    delete: (pattern: string, handler: RouteHandler) => addRoute("DELETE", pattern, handler),

    /** Find and execute a matching route. Returns false if no match. */
    async handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
      const method = (req.method ?? "GET").toUpperCase();
      const url = req.url ?? "/";
      const path = extractPath(url);

      for (const route of routes) {
        if (route.method !== method) continue;
        const match = path.match(route.pattern);
        if (!match) continue;

        // Extract params
        const params: Record<string, string> = {};
        for (let i = 0; i < route.paramNames.length; i++) {
          params[route.paramNames[i]] = decodeURIComponent(match[i + 1]);
        }

        // Parse request
        const parsedReq: ParsedRequest = {
          method,
          path,
          params,
          query: parseQueryString(url),
          body: method === "POST" ? await readBody(req) : undefined,
          role: extractRole(req),
          raw: req,
        };

        try {
          await route.handler(parsedReq, res);
        } catch (error) {
          sendError(res, 500, "An unexpected error occurred. Please contact your system administrator.");
        }
        return true;
      }

      return false;
    },
  };
}

/**
 * Create an HTTP server with the given router.
 */
export function createHttpServer(router: ReturnType<typeof createRouter>): Server {
  return createServer(async (req, res) => {
    // CORS headers for development
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-RPM-Role");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    const handled = await router.handle(req, res);
    if (!handled) {
      sendError(res, 404, "This endpoint does not exist.");
    }
  });
}
