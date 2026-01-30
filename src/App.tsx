import { useState, useEffect, useCallback } from "react";
import type { TaxReturn } from "./lib/schema";
import { demoReturn } from "./data/demo";
import { Sidebar } from "./components/Sidebar";
import { MainPanel } from "./components/MainPanel";
import { UploadModal } from "./components/UploadModal";
import "./index.css";

type SelectedView = "summary" | "demo" | number;

interface AppState {
  returns: Record<number, TaxReturn>;
  hasStoredKey: boolean;
  selectedYear: SelectedView;
  isLoading: boolean;
}

async function fetchInitialState(): Promise<Pick<AppState, "returns" | "hasStoredKey">> {
  const [configRes, returnsRes] = await Promise.all([
    fetch("/api/config"),
    fetch("/api/returns"),
  ]);
  const { hasKey } = await configRes.json();
  const returns = await returnsRes.json();
  return { hasStoredKey: hasKey, returns };
}

function getDefaultSelection(returns: Record<number, TaxReturn>): SelectedView {
  const years = Object.keys(returns).map(Number).sort((a, b) => a - b);
  if (years.length === 0) return "demo";
  if (years.length === 1) return years[0];
  return "summary";
}

function buildSidebarItems(returns: Record<number, TaxReturn>): { id: string; label: string }[] {
  const years = Object.keys(returns).map(Number).sort((a, b) => a - b);

  if (years.length === 0) {
    return [{ id: "demo", label: "Demo" }];
  }

  if (years.length === 1) {
    return years.map((y) => ({ id: String(y), label: String(y) }));
  }

  return [
    { id: "summary", label: "Summary" },
    ...years.map((y) => ({ id: String(y), label: String(y) })),
  ];
}

export function App() {
  const [state, setState] = useState<AppState>({
    returns: {},
    hasStoredKey: false,
    selectedYear: "demo",
    isLoading: true,
  });
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDark, setIsDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  const items = buildSidebarItems(state.returns);

  useEffect(() => {
    fetchInitialState()
      .then(({ returns, hasStoredKey }) => {
        setState({
          returns,
          hasStoredKey,
          selectedYear: getDefaultSelection(returns),
          isLoading: false,
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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const selectedId =
        state.selectedYear === "demo"
          ? "demo"
          : state.selectedYear === "summary"
            ? "summary"
            : String(state.selectedYear);
      const selectedIndex = items.findIndex((item) => item.id === selectedId);

      if (e.key === "j" && selectedIndex < items.length - 1) {
        const nextItem = items[selectedIndex + 1];
        if (nextItem) {
          setState((s) => ({
            ...s,
            selectedYear: parseSelectedId(nextItem.id),
          }));
        }
      }
      if (e.key === "k" && selectedIndex > 0) {
        const prevItem = items[selectedIndex - 1];
        if (prevItem) {
          setState((s) => ({
            ...s,
            selectedYear: parseSelectedId(prevItem.id),
          }));
        }
      }
    },
    [state.selectedYear, items]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  function parseSelectedId(id: string): SelectedView {
    if (id === "demo") return "demo";
    if (id === "summary") return "summary";
    return Number(id);
  }

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

  async function handleUploadFromSidebar(file: File) {
    if (!state.hasStoredKey) {
      setPendingFile(file);
      setIsModalOpen(true);
      return;
    }

    setIsUploading(true);
    try {
      await processUpload(file, "");
    } catch (err) {
      console.error("Upload failed:", err);
    } finally {
      setIsUploading(false);
    }
  }

  async function handleUploadFromModal(file: File, apiKey: string) {
    await processUpload(file, apiKey);
    setPendingFile(null);
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
      <div className="min-h-screen flex items-center justify-center font-mono text-sm">
        Loading...
      </div>
    );
  }

  const selectedId =
    state.selectedYear === "demo"
      ? "demo"
      : state.selectedYear === "summary"
        ? "summary"
        : String(state.selectedYear);

  return (
    <div className="flex h-screen">
      <Sidebar
        items={items}
        selectedId={selectedId}
        onSelect={handleSelect}
        onUpload={handleUploadFromSidebar}
        onDelete={handleDelete}
        isUploading={isUploading}
      />

      {state.selectedYear === "summary" ? (
        <MainPanel view="summary" returns={state.returns} />
      ) : (
        <MainPanel
          view="receipt"
          data={
            state.selectedYear === "demo"
              ? demoReturn
              : state.returns[state.selectedYear] || demoReturn
          }
          title={state.selectedYear === "demo" ? "Demo" : String(state.selectedYear)}
        />
      )}

      <div className="fixed top-4 right-4">
        <button
          onClick={() => setIsDark(!isDark)}
          className="text-xs px-2 py-1 border border-[var(--color-border)] hover:bg-[var(--color-text)] hover:text-[var(--color-bg)] transition-colors font-mono"
        >
          {isDark ? "Light" : "Dark"}
        </button>
      </div>

      <UploadModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setPendingFile(null);
        }}
        onUpload={handleUploadFromModal}
        hasStoredKey={state.hasStoredKey}
        pendingFile={pendingFile}
      />
    </div>
  );
}

export default App;
