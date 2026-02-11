import { GoogleGenAI } from "@google/genai";
import { ParseSpeeds, PDFDocument } from "pdf-lib";
import { z } from "zod";

import { classifyPages } from "./classifier";
import { EXTRACTION_PROMPT } from "./prompt";
import { type LabeledAmount, type TaxReturn, TaxReturnSchema } from "./schema";
import { selectPages } from "./selector";

// Max pages per extraction chunk (after smart selection)
const MAX_PAGES = 40;

// Threshold for using smart classification (skip for small PDFs)
const CLASSIFICATION_THRESHOLD = 20;

const PRIMARY_MODEL = "gemini-3-flash-preview";
const DEFAULT_FALLBACK_MODEL = "gemini-2.5-flash";
const DEFAULT_CHUNK_CONCURRENCY = 3;
const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_MAX_RETRIES = 4;
const DEFAULT_RETRY_BASE_MS = 750;

export type ParseErrorCategory =
  | "rate_limit"
  | "capacity"
  | "timeout"
  | "auth"
  | "invalid_request"
  | "invalid_response"
  | "server"
  | "unknown";

export class ParseApiError extends Error {
  category: ParseErrorCategory;
  statusCode?: number;
  retryable: boolean;

  constructor(
    message: string,
    category: ParseErrorCategory,
    retryable: boolean,
    statusCode?: number,
  ) {
    super(message);
    this.name = "ParseApiError";
    this.category = category;
    this.retryable = retryable;
    this.statusCode = statusCode;
  }
}

export interface ParseProgressEvent {
  phase:
    | "start"
    | "pdf_loaded"
    | "classifying"
    | "classification_done"
    | "classification_fallback"
    | "chunk_progress"
    | "merging"
    | "parsed";
  percent: number;
  message?: string;
  meta?: Record<string, unknown>;
}

export type ParseProgressHandler = (event: ParseProgressEvent) => void;

export interface ParseOptions {
  onProgress?: ParseProgressHandler;
  timeoutMs?: number;
  maxRetries?: number;
  retryBaseMs?: number;
  fallbackModel?: string;
  chunkConcurrency?: number;
}

export interface ParseResult {
  taxReturn: TaxReturn;
  timings: Record<string, number>;
}

interface ResilienceOptions {
  timeoutMs: number;
  maxRetries: number;
  retryBaseMs: number;
  fallbackModel: string;
}

interface ParseContext {
  ai: GoogleGenAI;
  emitProgress: ParseProgressHandler;
  timings: Record<string, number>;
  options: ParseOptions;
  resilience: ResilienceOptions;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function createProgressEmitter(
  onProgress?: ParseProgressHandler,
): (event: ParseProgressEvent) => void {
  let last = 0;
  return (event) => {
    if (!onProgress) return;
    const next = clampPercent(event.percent);
    const monotonic = next < last ? last : next;
    last = monotonic;
    onProgress({ ...event, percent: monotonic });
  };
}

function getErrorStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  const anyErr = error as { status?: unknown; code?: unknown };
  if (typeof anyErr.status === "number") return anyErr.status;
  if (typeof anyErr.code === "number") return anyErr.code;
  return undefined;
}

export function classifyParseError(error: unknown): ParseApiError {
  if (error instanceof ParseApiError) return error;

  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();
  const status = getErrorStatus(error);

  if (status === 429 || lowered.includes("resource_exhausted")) {
    return new ParseApiError(message, "rate_limit", true, status);
  }
  if (status === 503 || lowered.includes("unavailable") || lowered.includes("high demand")) {
    return new ParseApiError(message, "capacity", true, status);
  }
  if (status === 504 || lowered.includes("deadline_exceeded") || lowered.includes("timed out")) {
    return new ParseApiError(message, "timeout", true, status);
  }
  if (status === 401 || status === 403 || lowered.includes("api key")) {
    return new ParseApiError(message, "auth", false, status);
  }
  if (status === 400 || lowered.includes("invalid_argument")) {
    return new ParseApiError(message, "invalid_request", false, status);
  }
  if (status !== undefined && status >= 500 && status <= 599) {
    return new ParseApiError(message, "server", true, status);
  }
  return new ParseApiError(message, "unknown", false, status);
}

function startProgressTicker(
  emitProgress: ParseProgressHandler,
  phase: ParseProgressEvent["phase"],
  fromPercent: number,
  toPercent: number,
  message: string,
  intervalMs = 1800,
): () => void {
  let current = fromPercent;
  const tick = setInterval(() => {
    current = Math.min(toPercent, current + 1);
    emitProgress({ phase, percent: current, message });
  }, intervalMs);
  return () => clearInterval(tick);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffDelayMs(baseMs: number, attempt: number): number {
  const exp = baseMs * 2 ** (attempt - 1);
  const jitter = exp * 0.25 * Math.random();
  return exp + jitter;
}

async function timed<T>(
  timings: Record<string, number>,
  key: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  try {
    return await fn();
  } finally {
    timings[key] = (timings[key] ?? 0) + (performance.now() - start);
  }
}

async function withTimeout<T>(
  task: () => Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  return Promise.race([
    task(),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new ParseApiError(message, "timeout", true, 504)), timeoutMs),
    ),
  ]);
}

async function generateTaxReturnChunk(
  ai: GoogleGenAI,
  pdfBase64: string,
  resilience: ResilienceOptions,
  emitProgress: ParseProgressHandler,
): Promise<TaxReturn> {
  const requestContents = [
    {
      inlineData: {
        mimeType: "application/pdf",
        data: pdfBase64,
      },
    },
    { text: EXTRACTION_PROMPT },
  ];

  const models = [PRIMARY_MODEL, resilience.fallbackModel];
  let lastError: ParseApiError | null = null;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex]!;
    for (let attempt = 1; attempt <= resilience.maxRetries + 1; attempt++) {
      try {
        const response = await withTimeout(
          () =>
            ai.models.generateContent({
              model,
              contents: requestContents,
              config: {
                responseMimeType: "application/json",
                responseJsonSchema: z.toJSONSchema(TaxReturnSchema),
              },
            }),
          resilience.timeoutMs,
          `Gemini request timed out after ${Math.round(resilience.timeoutMs / 1000)}s`,
        );

        const text = response.text;
        if (!text) {
          throw new ParseApiError("No text response from Gemini", "invalid_response", false);
        }
        try {
          return TaxReturnSchema.parse(JSON.parse(text));
        } catch (error) {
          throw new ParseApiError(
            `Failed structured parse: ${error instanceof Error ? error.message : "invalid JSON"}`,
            "invalid_response",
            false,
            422,
          );
        }
      } catch (error) {
        const classified = classifyParseError(error);
        lastError = classified;

        const isCapacityOnPrimary =
          classified.category === "capacity" && modelIndex === 0 && models.length > 1;
        if (isCapacityOnPrimary) {
          emitProgress({
            phase: "chunk_progress",
            percent: 40,
            message: "Primary model busy, retrying with fallback model",
            meta: { fallbackModel: models[1] },
          });
          break;
        }

        if (!classified.retryable || attempt > resilience.maxRetries) {
          throw classified;
        }

        const delayMs = backoffDelayMs(resilience.retryBaseMs, attempt);
        console.warn(
          "[parse] Gemini retry",
          JSON.stringify({
            attempt,
            model,
            delayMs: Math.round(delayMs),
            category: classified.category,
            statusCode: classified.statusCode,
          }),
        );
        await sleep(delayMs);
      }
    }
  }

  throw lastError ?? new ParseApiError("Unknown Gemini failure", "unknown", false);
}

async function classifyPagesWithResilience(
  pdfBase64: string,
  context: ParseContext,
  totalPages: number,
): Promise<Awaited<ReturnType<typeof classifyPages>>> {
  const models = [PRIMARY_MODEL, context.resilience.fallbackModel];
  let lastError: ParseApiError | null = null;

  for (let modelIndex = 0; modelIndex < models.length; modelIndex++) {
    const model = models[modelIndex]!;
    for (let attempt = 1; attempt <= context.resilience.maxRetries + 1; attempt++) {
      try {
        return await withTimeout(
          () =>
            timed(context.timings, "classify_ms", () =>
              classifyPages(pdfBase64, context.ai, model),
            ),
          context.resilience.timeoutMs,
          `Classification timed out after ${Math.round(context.resilience.timeoutMs / 1000)}s`,
        );
      } catch (error) {
        const classified = classifyParseError(error);
        lastError = classified;
        const isCapacityOnPrimary =
          classified.category === "capacity" && modelIndex === 0 && models.length > 1;
        if (isCapacityOnPrimary) {
          context.emitProgress({
            phase: "classifying",
            percent: 30,
            message: "Classifier switching to fallback model...",
            meta: { fallbackModel: models[1], totalPages },
          });
          break;
        }

        if (!classified.retryable || attempt > context.resilience.maxRetries) {
          throw classified;
        }

        const delayMs = backoffDelayMs(context.resilience.retryBaseMs, attempt);
        context.emitProgress({
          phase: "classifying",
          percent: 20 + Math.min(attempt * 2, 15),
          message: `Classifier retry ${attempt}/${context.resilience.maxRetries}`,
          meta: {
            attempt,
            maxRetries: context.resilience.maxRetries,
            category: classified.category,
            statusCode: classified.statusCode,
          },
        });
        console.warn(
          "[parse] Classification retry",
          JSON.stringify({
            attempt,
            model,
            delayMs: Math.round(delayMs),
            category: classified.category,
            statusCode: classified.statusCode,
          }),
        );
        await sleep(delayMs);
      }
    }
  }

  throw lastError ?? new ParseApiError("Unknown classification failure", "unknown", false);
}

async function extractPages(pdfBase64: string, pageNumbers: number[]): Promise<string> {
  const pdfBytes = Buffer.from(pdfBase64, "base64");
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const totalPages = pdfDoc.getPageCount();

  // Filter out invalid page numbers (1-indexed input)
  const validPageNumbers = pageNumbers.filter((p) => p >= 1 && p <= totalPages);

  if (validPageNumbers.length === 0) {
    throw new Error(
      `No valid pages to extract. Requested: ${pageNumbers.join(", ")}, PDF has ${totalPages} pages`,
    );
  }

  const newDoc = await PDFDocument.create();
  // pageNumbers are 1-indexed, copyPages needs 0-indexed
  const pages = await newDoc.copyPages(
    pdfDoc,
    validPageNumbers.map((p) => p - 1),
  );
  pages.forEach((page) => newDoc.addPage(page));

  const newBytes = await newDoc.save();
  return Buffer.from(newBytes).toString("base64");
}

async function splitPdf(pdfBase64: string): Promise<string[]> {
  const pdfBytes = Buffer.from(pdfBase64, "base64");
  const pdfDoc = await PDFDocument.load(pdfBytes);
  const totalPages = pdfDoc.getPageCount();

  if (totalPages <= MAX_PAGES) {
    return [pdfBase64];
  }

  const chunks: string[] = [];
  for (let start = 0; start < totalPages; start += MAX_PAGES) {
    const end = Math.min(start + MAX_PAGES, totalPages);
    const chunkDoc = await PDFDocument.create();
    const pages = await chunkDoc.copyPages(
      pdfDoc,
      Array.from({ length: end - start }, (_, i) => start + i),
    );
    pages.forEach((page) => chunkDoc.addPage(page));
    const chunkBytes = await chunkDoc.save();
    chunks.push(Buffer.from(chunkBytes).toString("base64"));
  }

  return chunks;
}

function mergeLabeledAmounts(
  existing: LabeledAmount[],
  incoming: LabeledAmount[],
): LabeledAmount[] {
  const map = new Map<string, number>();

  for (const item of existing) {
    map.set(item.label, item.amount);
  }
  for (const item of incoming) {
    if (!map.has(item.label)) {
      map.set(item.label, item.amount);
    }
  }

  return Array.from(map.entries()).map(([label, amount]) => ({ label, amount }));
}

function mergeReturns(returns: TaxReturn[]): TaxReturn {
  const first = returns[0];
  if (!first) {
    throw new Error("No tax returns to merge");
  }

  if (returns.length === 1) {
    return first;
  }

  // Start with the first result as the base (usually has the main 1040 data)
  const base = first;

  for (let i = 1; i < returns.length; i++) {
    const chunk = returns[i]!;

    // Merge income items
    base.income.items = mergeLabeledAmounts(base.income.items, chunk.income.items);

    // Use the higher total income if found
    if (chunk.income.total > base.income.total) {
      base.income.total = chunk.income.total;
    }

    // Merge federal deductions, additional taxes, credits, payments
    base.federal.deductions = mergeLabeledAmounts(
      base.federal.deductions,
      chunk.federal.deductions,
    );
    base.federal.additionalTaxes = mergeLabeledAmounts(
      base.federal.additionalTaxes,
      chunk.federal.additionalTaxes,
    );
    base.federal.credits = mergeLabeledAmounts(base.federal.credits, chunk.federal.credits);
    base.federal.payments = mergeLabeledAmounts(base.federal.payments, chunk.federal.payments);

    // Merge state returns
    for (const chunkState of chunk.states) {
      const existingState = base.states.find((s) => s.name === chunkState.name);
      if (existingState) {
        existingState.deductions = mergeLabeledAmounts(
          existingState.deductions,
          chunkState.deductions,
        );
        existingState.adjustments = mergeLabeledAmounts(
          existingState.adjustments,
          chunkState.adjustments,
        );
        existingState.payments = mergeLabeledAmounts(existingState.payments, chunkState.payments);
      } else {
        base.states.push(chunkState);
      }
    }

    // Merge dependents
    const existingDependentNames = new Set(base.dependents.map((d) => d.name));
    for (const dep of chunk.dependents) {
      if (!existingDependentNames.has(dep.name)) {
        base.dependents.push(dep);
      }
    }

    // Use rates if base doesn't have them
    if (!base.rates && chunk.rates) {
      base.rates = chunk.rates;
    }
  }

  return base;
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  if (items.length === 0) return [];
  const bounded = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function runner(): Promise<void> {
    while (true) {
      const current = nextIndex++;
      if (current >= items.length) return;
      results[current] = await worker(items[current]!, current);
    }
  }

  await Promise.all(Array.from({ length: bounded }, () => runner()));
  return results;
}

async function parseChunksWithProgress(
  chunks: string[],
  context: ParseContext,
  percentStart: number,
  percentEnd: number,
): Promise<TaxReturn[]> {
  const total = chunks.length;
  let completed = 0;
  return mapWithConcurrency(
    chunks,
    context.options.chunkConcurrency ?? DEFAULT_CHUNK_CONCURRENCY,
    async (chunk, index) => {
      const parsed = await timed(context.timings, "chunk_parse_ms", () =>
        generateTaxReturnChunk(context.ai, chunk, context.resilience, context.emitProgress),
      );
      completed += 1;
      const span = percentEnd - percentStart;
      context.emitProgress({
        phase: "chunk_progress",
        percent: percentStart + (span * completed) / total,
        message: `Parsed chunk ${index + 1} of ${total}`,
        meta: { chunkIndex: index + 1, chunkTotal: total, completedChunks: completed },
      });
      return parsed;
    },
  );
}

async function smartExtract(pdfBase64: string, context: ParseContext): Promise<TaxReturn> {
  const pdfBytes = Buffer.from(pdfBase64, "base64");
  const pdfDoc = await timed(context.timings, "pdf_load_ms", () =>
    PDFDocument.load(pdfBytes, { parseSpeed: ParseSpeeds.Fastest }),
  );
  const totalPages = pdfDoc.getPageCount();
  console.log("[parse] PDF loaded,", totalPages, "pages");
  context.emitProgress({ phase: "pdf_loaded", percent: 5, meta: { totalPages } });

  // For small PDFs, process directly without classification
  if (totalPages <= CLASSIFICATION_THRESHOLD) {
    const chunks = await timed(context.timings, "split_ms", () => splitPdf(pdfBase64));
    console.log("[parse] Chunks:", chunks.length, "(no classification)");
    const firstChunk = chunks[0];
    if (chunks.length === 1 && firstChunk) {
      const parsed = await timed(context.timings, "chunk_parse_ms", () =>
        generateTaxReturnChunk(context.ai, firstChunk, context.resilience, context.emitProgress),
      );
      context.emitProgress({
        phase: "chunk_progress",
        percent: 96,
        message: "Parsed single chunk",
        meta: { chunkIndex: 1, chunkTotal: 1, selectedPages: totalPages },
      });
      context.emitProgress({ phase: "merging", percent: 98 });
      return parsed;
    }
    const results = await parseChunksWithProgress(chunks, context, 40, 96);
    context.emitProgress({ phase: "merging", percent: 98 });
    return timed(context.timings, "merge_ms", async () => mergeReturns(results));
  }

  // Classify pages using Gemini
  console.log("[parse] Classifying", totalPages, "pages...");
  context.emitProgress({
    phase: "classifying",
    percent: 10,
    message: "Classifying pages",
    meta: { totalPages },
  });
  let classifications;
  const stopClassifyTicker = startProgressTicker(
    context.emitProgress,
    "classifying",
    10,
    39,
    "Classifying pages...",
  );
  try {
    classifications = await classifyPagesWithResilience(pdfBase64, context, totalPages);
  } catch (error) {
    stopClassifyTicker();
    // Fallback: process first 40 pages if classification fails
    console.error("Classification failed, using fallback:", error);
    const fallbackPages = Array.from({ length: Math.min(totalPages, MAX_PAGES) }, (_, i) => i + 1);
    context.emitProgress({
      phase: "classification_fallback",
      percent: 45,
      message: "Classification failed, falling back to first pages",
      meta: { fallbackPages: fallbackPages.length },
    });
    const fallbackPdf = await timed(context.timings, "extract_ms", () =>
      extractPages(pdfBase64, fallbackPages),
    );
    const parsed = await timed(context.timings, "chunk_parse_ms", () =>
      generateTaxReturnChunk(context.ai, fallbackPdf, context.resilience, context.emitProgress),
    );
    context.emitProgress({ phase: "merging", percent: 98 });
    return parsed;
  }
  stopClassifyTicker();

  // Select important pages based on classification
  const selection = selectPages(classifications);
  const { selectedPages } = selection;
  console.log("[parse] Selected", selectedPages.length, "pages");
  context.emitProgress({
    phase: "classification_done",
    percent: 40,
    message: "Classification complete",
    meta: { selectedPages: selectedPages.length, totalPages },
  });

  // If no pages selected or selection too small, use fallback
  if (selectedPages.length === 0) {
    const fallbackPages = Array.from({ length: Math.min(totalPages, MAX_PAGES) }, (_, i) => i + 1);
    const fallbackPdf = await timed(context.timings, "extract_ms", () =>
      extractPages(pdfBase64, fallbackPages),
    );
    const parsed = await timed(context.timings, "chunk_parse_ms", () =>
      generateTaxReturnChunk(context.ai, fallbackPdf, context.resilience, context.emitProgress),
    );
    context.emitProgress({ phase: "merging", percent: 98 });
    return parsed;
  }

  // Extract only selected pages
  if (selectedPages.length <= MAX_PAGES) {
    const selectedPdf = await timed(context.timings, "extract_ms", () =>
      extractPages(pdfBase64, selectedPages),
    );
    const parsed = await timed(context.timings, "chunk_parse_ms", () =>
      generateTaxReturnChunk(context.ai, selectedPdf, context.resilience, context.emitProgress),
    );
    context.emitProgress({
      phase: "chunk_progress",
      percent: 96,
      message: "Parsed selected pages",
      meta: { chunkIndex: 1, chunkTotal: 1, selectedPages: selectedPages.length },
    });
    context.emitProgress({ phase: "merging", percent: 98 });
    return parsed;
  }

  // If still too many pages, chunk the selected pages
  const numChunks = Math.ceil(selectedPages.length / MAX_PAGES);
  const chunkPageSets: number[][] = [];
  for (let start = 0; start < selectedPages.length; start += MAX_PAGES) {
    chunkPageSets.push(selectedPages.slice(start, start + MAX_PAGES));
  }
  const chunkPdfs = await timed(context.timings, "extract_ms", () =>
    mapWithConcurrency(
      chunkPageSets,
      context.options.chunkConcurrency ?? DEFAULT_CHUNK_CONCURRENCY,
      async (pages) => extractPages(pdfBase64, pages),
    ),
  );
  console.log("[parse] Chunks:", numChunks, "selected pages:", selectedPages.length);
  const results = await parseChunksWithProgress(chunkPdfs, context, 40, 96);
  context.emitProgress({ phase: "merging", percent: 98, meta: { chunkTotal: numChunks } });
  return timed(context.timings, "merge_ms", async () => mergeReturns(results));
}

export async function parseTaxReturnWithProgress(
  pdfBase64: string,
  apiKey: string,
  options: ParseOptions = {},
): Promise<ParseResult> {
  const ai = new GoogleGenAI({ apiKey });
  const timings: Record<string, number> = {};
  const emitProgress = createProgressEmitter(options.onProgress);
  const resilience: ResilienceOptions = {
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    maxRetries: options.maxRetries ?? DEFAULT_MAX_RETRIES,
    retryBaseMs: options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS,
    fallbackModel: options.fallbackModel ?? DEFAULT_FALLBACK_MODEL,
  };
  const context: ParseContext = {
    ai,
    timings,
    options,
    resilience,
    emitProgress,
  };

  emitProgress({ phase: "start", percent: 2, message: "Starting parse" });
  const start = performance.now();
  const taxReturn = await smartExtract(pdfBase64, context);
  timings.total_ms = performance.now() - start;
  emitProgress({
    phase: "parsed",
    percent: 98,
    message: "Parse complete, saving",
    meta: { timings },
  });
  return { taxReturn, timings };
}

// Try to extract year from first-page text using pdfjs-dist (lazy-loads, fast for large PDFs)
async function extractYearFromPdfText(pdfBytes: Uint8Array): Promise<number | null> {
  try {
    const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const workerPath = new URL(
      "../../node_modules/pdfjs-dist/build/pdf.worker.mjs",
      import.meta.url,
    ).pathname;
    GlobalWorkerOptions.workerSrc = workerPath;

    const doc = await getDocument({ data: pdfBytes }).promise;
    const page = await doc.getPage(1);
    const textContent = await page.getTextContent();
    const text = textContent.items.map((item) => ("str" in item ? item.str : "")).join(" ");

    const yearMatch = text.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      const year = parseInt(yearMatch[0], 10);
      if (year >= 1990 && year <= new Date().getFullYear() + 1) {
        return year;
      }
    }
  } catch {
    // pdfjs-dist failed, fall through to pdf-lib
  }
  return null;
}

export async function extractYearFromPdf(
  pdfBase64: string,
  apiKey: string,
): Promise<number | null> {
  console.log("[extractYearFromPdf] starting");
  const pdfBytes = Buffer.from(pdfBase64, "base64");
  console.log(
    "[extractYearFromPdf] loading PDF...",
    "size:",
    (pdfBytes.length / 1024).toFixed(0),
    "KB",
  );

  // Fast path: pdfjs-dist lazy-loads first page only (good for large PDFs)
  const textYear = await extractYearFromPdfText(pdfBytes);
  if (textYear !== null) {
    console.log("[extractYearFromPdf] found year in text:", textYear);
    return textYear;
  }

  // Fallback: pdf-lib + Gemini (use ParseSpeeds.Fastest for large PDFs)
  console.log("[extractYearFromPdf] text extraction failed, using pdf-lib + Gemini...");
  const ai = new GoogleGenAI({ apiKey });
  const loadPdf = () =>
    PDFDocument.load(pdfBytes, { ignoreEncryption: true, parseSpeed: ParseSpeeds.Fastest });
  const timeoutMs = 30_000;
  const pdfDoc = await Promise.race([
    loadPdf(),
    new Promise<never>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `PDF load timed out after ${timeoutMs / 1000}s. File may be corrupted or too large.`,
            ),
          ),
        timeoutMs,
      ),
    ),
  ]);
  console.log("[extractYearFromPdf] PDF loaded, extracting first page...");
  const firstPageDoc = await PDFDocument.create();
  const [firstPage] = await firstPageDoc.copyPages(pdfDoc, [0]);
  if (!firstPage) throw new Error("Failed to copy first page");
  firstPageDoc.addPage(firstPage);
  const firstPageBase64 = Buffer.from(await firstPageDoc.save()).toString("base64");

  try {
    console.log("[extractYearFromPdf] calling Gemini API...");
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: [
        {
          inlineData: {
            mimeType: "application/pdf",
            data: firstPageBase64,
          },
        },
        {
          text: "What tax year is this document for? Respond with ONLY the 4-digit year (e.g., 2023). If you cannot determine the year, respond with 'UNKNOWN'.",
        },
      ],
    });

    const text = response.text;
    if (!text) {
      return null;
    }

    const yearMatch = text.match(/\b(19|20)\d{2}\b/);
    if (yearMatch) {
      return parseInt(yearMatch[0], 10);
    }
    return null;
  } catch (error) {
    console.error("Year extraction failed:", error);
    return null;
  }
}
