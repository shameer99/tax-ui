import { useState, useEffect, useCallback } from "react";
import type { TaxReturn, PendingUpload } from "./lib/schema";
import type { NavItem } from "./lib/types";
import { demoReturn } from "./data/demo";
import { sampleReturns } from "./data/sampleData";
import { MainPanel } from "./components/MainPanel";
import { UploadModal } from "./components/UploadModal";
import { SettingsModal } from "./components/SettingsModal";
import { Chat } from "./components/Chat";
import { extractYearFromFilename } from "./lib/year-extractor";
import "./index.css";

const DEV_SAMPLE_DATA_KEY = "dev-use-sample-data";
const CHAT_OPEN_KEY = "tax-chat-open";

type SelectedView = "summary" | "demo" | number | `pending:${string}`;

interface AppState {
  returns: Record<number, TaxReturn>;
  hasStoredKey: boolean;
  selectedYear: SelectedView;
  isLoading: boolean;
  isDev: boolean;
}

async function fetchInitialState(): Promise<Pick<AppState, "returns" | "hasStoredKey" | "isDev">> {
  const [configRes, returnsRes] = await Promise.all([
    fetch("/api/config"),
    fetch("/api/returns"),
  ]);
  const { hasKey, isDev } = await configRes.json();
  const returns = await returnsRes.json();
  return { hasStoredKey: hasKey, returns, isDev: isDev ?? false };
}

function getDefaultSelection(returns: Record<number, TaxReturn>): SelectedView {
  const years = Object.keys(returns).map(Number).sort((a, b) => a - b);
  if (years.length === 0) return "demo";
  if (years.length === 1) return years[0] ?? "demo";
  return "summary";
}

function buildNavItems(returns: Record<number, TaxReturn>): NavItem[] {
  const years = Object.keys(returns).map(Number).sort((a, b) => b - a);
  if (years.length === 0) return [{ id: "demo", label: "Demo" }];

  const items: NavItem[] = [];
  if (years.length > 1) items.push({ id: "summary", label: "Summary" });
  items.push(...years.map((y) => ({ id: String(y), label: String(y) })));
  return items;
}

function parseSelectedId(id: string): SelectedView {
  if (id === "demo") return "demo";
  if (id === "summary") return "summary";
  if (id.startsWith("pending:")) return id as `pending:${string}`;
  return Number(id);
}

export function App() {
  const [state, setState] = useState<AppState>({
    returns: {},
    hasStoredKey: false,
    selectedYear: "demo",
    isLoading: true,
    isDev: false,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [configureKeyOnly, setConfigureKeyOnly] = useState(false);
  const [pendingUploads, setPendingUploads] = useState<PendingUpload[]>([]);
  const [isChatOpen, setIsChatOpen] = useState(() => {
    const stored = localStorage.getItem(CHAT_OPEN_KEY);
    return stored === null ? true : stored === "true";
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDark, setIsDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  const navItems = buildNavItems(state.returns);

  useEffect(() => {
    fetchInitialState()
      .then(({ returns, hasStoredKey, isDev }) => {
        // In dev mode, check if we should load sample data
        const useSampleData = isDev && localStorage.getItem(DEV_SAMPLE_DATA_KEY) === "true";
        const effectiveReturns = useSampleData ? sampleReturns : returns;
        setState({
          returns: effectiveReturns,
          hasStoredKey,
          selectedYear: getDefaultSelection(effectiveReturns),
          isLoading: false,
          isDev,
        });
      })
      .catch((err) => {
        console.error("Failed to load:", err);
        setState((s) => ({ ...s, isLoading: false }));
      });
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark);
  }, [isDark]);

  useEffect(() => {
    localStorage.setItem(CHAT_OPEN_KEY, String(isChatOpen));
  }, [isChatOpen]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const currentId =
        state.selectedYear === "demo"
          ? "demo"
          : state.selectedYear === "summary"
            ? "summary"
            : String(state.selectedYear);
      const selectedIndex = navItems.findIndex((item) => item.id === currentId);

      if (e.key === "j" && selectedIndex < navItems.length - 1) {
        const nextItem = navItems[selectedIndex + 1];
        if (nextItem) {
          setState((s) => ({
            ...s,
            selectedYear: parseSelectedId(nextItem.id),
          }));
        }
      }
      if (e.key === "k" && selectedIndex > 0) {
        const prevItem = navItems[selectedIndex - 1];
        if (prevItem) {
          setState((s) => ({
            ...s,
            selectedYear: parseSelectedId(prevItem.id),
          }));
        }
      }
    },
    [state.selectedYear, navItems]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  async function processUpload(file: File, apiKey: string) {
    const formData = new FormData();
    formData.append("pdf", file);
    if (apiKey) formData.append("apiKey", apiKey);

    const res = await fetch("/api/parse", { method: "POST", body: formData });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || `HTTP ${res.status}`);
    }

    const taxReturn: TaxReturn = await res.json();
    const returnsRes = await fetch("/api/returns");
    const returns = await returnsRes.json();

    setState((s) => ({
      ...s,
      returns,
      hasStoredKey: true,
      // Stay on summary if already there, otherwise navigate to new year
      selectedYear: s.selectedYear === "summary" ? "summary" : taxReturn.year,
    }));
  }

  async function handleUploadFromSidebar(files: File[]) {
    if (files.length === 0) return;

    // If no API key, open modal with all files
    if (!state.hasStoredKey) {
      setPendingFiles(files);
      setIsModalOpen(true);
      return;
    }

    // Create pending uploads immediately (optimistic) for all files
    const newPendingUploads: PendingUpload[] = files.map((file) => {
      const filenameYear = extractYearFromFilename(file.name);
      return {
        id: crypto.randomUUID(),
        filename: file.name,
        year: filenameYear,
        status: filenameYear ? "parsing" : "extracting-year",
        file,
      };
    });

    setPendingUploads((prev) => [...prev, ...newPendingUploads]);

    // Select the first pending upload
    const firstPending = newPendingUploads[0];
    if (firstPending) {
      setState((s) => ({ ...s, selectedYear: `pending:${firstPending.id}` }));
    }

    // Extract years in parallel for files that don't have one from filename
    await Promise.all(
      newPendingUploads
        .filter((p) => !p.year)
        .map(async (pending) => {
          try {
            const formData = new FormData();
            formData.append("pdf", pending.file);
            const yearRes = await fetch("/api/extract-year", { method: "POST", body: formData });
            const { year: extractedYear } = await yearRes.json();
            setPendingUploads((prev) =>
              prev.map((p) =>
                p.id === pending.id ? { ...p, year: extractedYear, status: "parsing" } : p
              )
            );
          } catch (err) {
            console.error("Year extraction failed:", err);
            setPendingUploads((prev) =>
              prev.map((p) =>
                p.id === pending.id ? { ...p, status: "parsing" } : p
              )
            );
          }
        })
    );

    // Process files sequentially (full parsing)
    setIsUploading(true);
    for (const pending of newPendingUploads) {
      try {
        await processUpload(pending.file, "");
        // Remove from pending uploads after success
        setPendingUploads((prev) => prev.filter((p) => p.id !== pending.id));
      } catch (err) {
        console.error("Upload failed:", err);
        // Remove from pending uploads on error, but continue processing others
        setPendingUploads((prev) => prev.filter((p) => p.id !== pending.id));
      }
    }
    setIsUploading(false);

    // Navigate to appropriate view after all uploads complete
    setState((s) => ({
      ...s,
      selectedYear: getDefaultSelection(s.returns),
    }));
  }

  async function handleUploadFromModal(files: File[], apiKey: string) {
    for (const file of files) {
      await processUpload(file, apiKey);
    }
    setPendingFiles([]);
  }

  async function handleSaveApiKey(apiKey: string) {
    const res = await fetch("/api/config/key", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ apiKey }),
    });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || `HTTP ${res.status}`);
    }
    setState((s) => ({ ...s, hasStoredKey: true }));
  }

  async function handleClearData() {
    const res = await fetch("/api/clear-data", { method: "POST" });
    if (!res.ok) {
      const { error } = await res.json();
      throw new Error(error || `HTTP ${res.status}`);
    }
    // Reset to initial state
    setState({
      returns: {},
      hasStoredKey: false,
      selectedYear: "demo",
      isLoading: false,
      isDev: state.isDev,
    });
    // Clear dev sample data preference and chat data
    localStorage.removeItem(DEV_SAMPLE_DATA_KEY);
    localStorage.removeItem(CHAT_OPEN_KEY);
    localStorage.removeItem("tax-chat-history");
    localStorage.removeItem("tax-chat-width");
    // Reset chat to open (default for new users)
    setIsChatOpen(true);
  }

  function handleSelect(id: string) {
    setState((s) => ({
      ...s,
      selectedYear: parseSelectedId(id),
    }));
  }

  async function handleDelete(id: string) {
    const year = Number(id);
    if (isNaN(year)) return;

    await fetch(`/api/returns/${year}`, { method: "DELETE" });

    setState((s) => {
      const newReturns = { ...s.returns };
      delete newReturns[year];
      const newSelection = s.selectedYear === year ? getDefaultSelection(newReturns) : s.selectedYear;
      return {
        ...s,
        returns: newReturns,
        selectedYear: newSelection,
      };
    });
  }

  if (state.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span className="text-sm text-[var(--color-text-muted)]">Loading...</span>
      </div>
    );
  }

  function getSelectedId(): string {
    if (typeof state.selectedYear === "string" && state.selectedYear.startsWith("pending:")) {
      return state.selectedYear;
    }
    if (state.selectedYear === "demo") return "demo";
    if (state.selectedYear === "summary") return "summary";
    return String(state.selectedYear);
  }
  const selectedId = getSelectedId();

  function getReceiptData(): TaxReturn {
    if (state.selectedYear === "demo") return demoReturn;
    if (typeof state.selectedYear === "number") {
      return state.returns[state.selectedYear] || demoReturn;
    }
    return demoReturn;
  }

  function renderMainPanel() {
    const commonProps = {
      isChatOpen,
      onToggleChat: () => setIsChatOpen(!isChatOpen),
      navItems,
      selectedId,
      onSelect: handleSelect,
      onOpenSettings: () => setIsSettingsOpen(true),
    };

    if (selectedPendingUpload) {
      return <MainPanel view="loading" pendingUpload={selectedPendingUpload} {...commonProps} />;
    }
    if (state.selectedYear === "summary") {
      return <MainPanel view="summary" returns={state.returns} {...commonProps} />;
    }
    return (
      <MainPanel
        view="receipt"
        data={getReceiptData()}
        title={state.selectedYear === "demo" ? "Demo" : String(state.selectedYear)}
        {...commonProps}
      />
    );
  }

  // Find pending upload if selected
  const selectedPendingUpload =
    typeof state.selectedYear === "string" && state.selectedYear.startsWith("pending:")
      ? pendingUploads.find((p) => `pending:${p.id}` === state.selectedYear)
      : null;

  return (
    <div className="flex h-screen">
      {renderMainPanel()}

      {isChatOpen && (
        <Chat
          returns={state.returns}
          hasApiKey={state.hasStoredKey}
          onClose={() => setIsChatOpen(false)}
        />
      )}

      <UploadModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setPendingFiles([]);
          setConfigureKeyOnly(false);
        }}
        onUpload={handleUploadFromModal}
        onSaveApiKey={handleSaveApiKey}
        hasStoredKey={state.hasStoredKey}
        pendingFiles={pendingFiles}
        configureKeyOnly={configureKeyOnly}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        hasApiKey={state.hasStoredKey}
        onSaveApiKey={handleSaveApiKey}
        onClearData={handleClearData}
      />
    </div>
  );
}

export default App;
