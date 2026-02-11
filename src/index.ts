import { GoogleGenAI } from "@google/genai";
import { argv, serve } from "bun";
import path from "path";
import { fileURLToPath } from "url";

import index from "./index.html";
import {
  classifyParseError,
  extractYearFromPdf,
  type ParseProgressEvent,
  parseTaxReturnWithProgress,
} from "./lib/parser";
import { clearAllData, deleteReturn, getApiKey, getReturns, saveReturn } from "./lib/storage";

// ── Progress store for polling ──────────────────────────────────────────────
interface ParseJob {
  percent: number;
  phase: string;
  message?: string;
  done: boolean;
  error?: string;
}
const parseJobs = new Map<string, ParseJob>();

function updateJob(id: string, event: ParseProgressEvent) {
  parseJobs.set(id, {
    percent: event.percent,
    phase: event.phase,
    message: event.message,
    done: false,
  });
}

function completeJob(id: string) {
  const job = parseJobs.get(id);
  if (job) job.done = true;
  // Clean up after 60s
  setTimeout(() => parseJobs.delete(id), 60_000);
}

function failJob(id: string, error: string) {
  parseJobs.set(id, { percent: 0, phase: "error", message: error, done: true, error });
  setTimeout(() => parseJobs.delete(id), 60_000);
}

// Model used for lightweight operations (validation, suggestions)
const FAST_MODEL = "gemini-3-flash-preview";

function isAuthError(message: string): boolean {
  return (
    message.includes("authentication") || message.includes("401") || message.includes("API key")
  );
}

function getParseErrorResponse(error: unknown): {
  status: number;
  error: string;
  category: string;
} {
  const classified = classifyParseError(error);
  const message = classified.message || "Unknown error";

  if (classified.category === "auth" || isAuthError(message)) {
    return { status: 401, error: "Invalid API key", category: "auth" };
  }
  if (
    classified.category === "invalid_request" ||
    message.includes("prompt is too long") ||
    message.includes("too many tokens")
  ) {
    return {
      status: 400,
      error: "PDF is too large to process. Try uploading just the main tax forms.",
      category: "invalid_request",
    };
  }
  if (classified.category === "invalid_response" || message.includes("JSON")) {
    return {
      status: 422,
      error: "Failed to parse tax return data",
      category: "invalid_response",
    };
  }

  return {
    status: 500,
    error: message,
    category: classified.category,
  };
}

/** Serialize Server-Timing metric: name;dur=ms or name;dur=ms;desc="..." */
function serverTiming(name: string, durMs: number, desc?: string): string {
  let s = `${name};dur=${durMs.toFixed(2)}`;
  if (desc) s += `;desc="${desc.replace(/"/g, "'")}"`;
  return s;
}

/** Wrap a route handler to add Server-Timing header to the response */
function withServerTiming<T extends Request>(
  name: string,
  handler: (req: T) => Promise<Response>,
): (req: T) => Promise<Response> {
  return async (req: T) => {
    const start = performance.now();
    const res = await handler(req);
    const dur = performance.now() - start;
    const timing = serverTiming(name, dur);
    const headers = new Headers(res.headers);
    headers.set("Server-Timing", timing);
    return new Response(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers,
    });
  };
}

// Parse --port from command line args (supports --port=XXXX or --port XXXX)
function parsePort(): number {
  const idx = argv.findIndex((arg) => arg === "--port" || arg.startsWith("--port="));
  if (idx === -1) return 3000;
  const arg = argv[idx]!;
  if (arg.startsWith("--port=")) return Number(arg.split("=")[1]);
  return Number(argv[idx + 1]) || 3000;
}
const port = parsePort();
const isProd = process.env.NODE_ENV === "production";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const STATIC_ROOT = process.env.TAX_UI_STATIC_DIR || __dirname;

function buildChatSystemPrompt(returns: Record<number, unknown>): string {
  const years = Object.keys(returns)
    .map(Number)
    .sort((a, b) => a - b);
  const yearRange =
    years.length > 1 ? `${years[0]}-${years[years.length - 1]}` : years[0]?.toString() || "none";

  return `You are a helpful tax data analysis assistant. You have access to the user's tax return data.

IMPORTANT FORMATTING RULES:
- Format all currency values with $ and commas (e.g., $1,234,567)
- Format percentages to 1 decimal place (e.g., 22.5%)
- Be concise and direct in your responses
- When comparing years, show values side by side

TAX DATA AVAILABLE:
Years: ${yearRange}
${JSON.stringify(returns, null, 2)}

Answer questions about the user's income, taxes, deductions, credits, and tax rates based on this data.`;
}

const routes: Record<string, any> = {
  "/api/config": {
    GET: withServerTiming("config", async () => {
      const hasKey = Boolean(getApiKey());
      const isDemo = process.env.DEMO_MODE === "true";
      const isDev = process.env.NODE_ENV !== "production";
      return Response.json({ hasKey, isDemo, isDev });
    }),
  },
  "/api/clear-data": {
    POST: withServerTiming("clear-data", async () => {
      await clearAllData();
      return Response.json({ success: true });
    }),
  },
  "/api/returns": {
    GET: withServerTiming("returns", async () => {
      return Response.json(await getReturns());
    }),
  },
  "/api/returns/:year": {
    DELETE: withServerTiming(
      "delete-return",
      async (req: Request & { params: { year: string } }) => {
        const year = Number(req.params.year);
        if (isNaN(year)) {
          return Response.json({ error: "Invalid year" }, { status: 400 });
        }
        await deleteReturn(year);
        return Response.json({ success: true });
      },
    ),
  },
  "/api/extract-year": {
    POST: withServerTiming("extract-year", async (req: Request) => {
      console.log("[extract-year] request received");
      const formData = await req.formData();
      const file = formData.get("pdf") as File | null;

      if (!file) {
        return Response.json({ error: "No PDF file provided" }, { status: 400 });
      }

      const apiKey = getApiKey();
      if (!apiKey) {
        return Response.json({ error: "Set GEMINI_API_KEY in .env" }, { status: 400 });
      }

      try {
        console.log("[extract-year] calling Gemini...");
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        const year = await extractYearFromPdf(base64, apiKey);
        console.log("[extract-year] done, year:", year);
        return Response.json({ year });
      } catch (error) {
        console.error("Year extraction error:", error);
        const message = error instanceof Error ? error.message : "";
        if (isAuthError(message)) {
          return Response.json({ error: "Invalid API key" }, { status: 401 });
        }
        return Response.json({ year: null, error: message || "PDF failed to load" });
      }
    }),
  },
  "/api/chat": {
    POST: withServerTiming("chat", async (req: Request) => {
      const { prompt, history, returns: clientReturns } = await req.json();

      if (!prompt || typeof prompt !== "string") {
        return Response.json({ error: "No prompt provided" }, { status: 400 });
      }

      const apiKey = getApiKey();
      if (!apiKey) {
        return Response.json({ error: "Set GEMINI_API_KEY in .env" }, { status: 400 });
      }

      // Use client-provided returns or fall back to stored returns
      const returns =
        clientReturns && Object.keys(clientReturns).length > 0 ? clientReturns : await getReturns();
      const ai = new GoogleGenAI({ apiKey });

      try {
        // Build contents from history + prompt (Gemini uses user/model roles)
        const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];
        for (const msg of history || []) {
          contents.push({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }],
          });
        }
        contents.push({ role: "user", parts: [{ text: prompt }] });

        const response = await ai.models.generateContent({
          model: "gemini-3-flash-preview",
          contents,
          config: {
            systemInstruction: buildChatSystemPrompt(returns),
            maxOutputTokens: 2048,
          },
        });

        const responseText = response.text ?? "No response";

        return Response.json({ response: responseText });
      } catch (error) {
        console.error("Chat error:", error);
        const message = error instanceof Error ? error.message : "Unknown error";
        if (isAuthError(message)) {
          return Response.json({ error: "Invalid API key" }, { status: 401 });
        }
        return Response.json({ error: message }, { status: 500 });
      }
    }),
  },
  "/api/suggestions": {
    POST: withServerTiming("suggestions", async (req: Request) => {
      const { history, returns: clientReturns } = await req.json();

      const apiKey = getApiKey();
      if (!apiKey) {
        return Response.json({ suggestions: [] });
      }

      const _returns =
        clientReturns && Object.keys(clientReturns).length > 0 ? clientReturns : await getReturns();

      const ai = new GoogleGenAI({ apiKey });

      try {
        const contents: Array<{ role: string; parts: Array<{ text: string }> }> = (
          history || []
        ).map((msg: { role: string; content: string }) => ({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        }));
        contents.push({
          role: "user",
          parts: [{ text: "Suggest 3 follow-up questions I might ask." }],
        });

        const response = await ai.models.generateContent({
          model: FAST_MODEL,
          contents,
          config: {
            systemInstruction: `You are helping a user explore their own tax return data. Generate 3 short follow-up questions the user might want to ask about their finances. Phrase questions in FIRST PERSON (e.g., "Why did my income drop?" not "Why did your income drop?"). Respond with a JSON array of strings only.`,
            maxOutputTokens: 256,
            responseMimeType: "application/json",
            responseJsonSchema: {
              type: "array",
              items: { type: "string" },
            },
          },
        });

        const text = response.text;
        const suggestions = text ? JSON.parse(text) : [];

        return Response.json({ suggestions: suggestions.slice(0, 3) });
      } catch (error) {
        console.error("Suggestions error:", error);
        return Response.json({ suggestions: [] });
      }
    }),
  },
  "/api/parse": {
    POST: withServerTiming("parse", async (req: Request) => {
      let formData: FormData;
      try {
        formData = await req.formData();
      } catch {
        return Response.json({ error: "Invalid multipart form data" }, { status: 400 });
      }
      const file = formData.get("pdf") as File | null;
      const progressId = formData.get("progressId") as string | null;

      if (!file) {
        return Response.json({ error: "No PDF file provided" }, { status: 400 });
      }

      const apiKey = getApiKey();
      if (!apiKey) {
        return Response.json({ error: "Set GEMINI_API_KEY in .env" }, { status: 400 });
      }

      try {
        const buffer = await file.arrayBuffer();
        const base64 = Buffer.from(buffer).toString("base64");
        console.log(
          "[parse] Starting",
          file.name,
          "size:",
          (buffer.byteLength / 1024).toFixed(0),
          "KB",
        );

        const { taxReturn, timings } = await parseTaxReturnWithProgress(base64, apiKey, {
          onProgress: progressId ? (event) => updateJob(progressId, event) : undefined,
        });
        console.log("[parse] Done", file.name, timings);

        await saveReturn(taxReturn);
        if (progressId) completeJob(progressId);
        return Response.json(taxReturn);
      } catch (error) {
        console.error("Parse error:", error);
        const parseError = getParseErrorResponse(error);
        if (progressId) failJob(progressId, parseError.error);
        return Response.json({ error: parseError.error }, { status: parseError.status });
      }
    }),
  },
  "/api/parse-progress/:id": {
    GET: async (req: Request & { params: { id: string } }) => {
      const job = parseJobs.get(req.params.id);
      if (!job) {
        return Response.json({ percent: 0, phase: "pending", done: false });
      }
      return Response.json(job);
    },
  },
};

if (!isProd) {
  routes["/*"] = index;
}

const server = serve({
  port,
  routes,
  fetch: isProd
    ? async (req) => {
        const url = new URL(req.url);
        const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
        const resolvedPath = path.resolve(STATIC_ROOT, `.${pathname}`);

        if (!resolvedPath.startsWith(STATIC_ROOT)) {
          return new Response("Not found", { status: 404 });
        }

        const file = Bun.file(resolvedPath);
        if (await file.exists()) {
          return new Response(file);
        }

        return new Response("Not found", { status: 404 });
      }
    : undefined,
  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`Server running at ${server.url}`);
