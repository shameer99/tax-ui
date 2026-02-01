import { useState, useEffect, useCallback } from "react";
import type { TaxReturn, PendingUpload, FileProgress } from "./lib/schema";
import type { NavItem } from "./lib/types";
import { sampleReturns } from "./data/sampleData";
import { MainPanel } from "./components/MainPanel";
import { UploadModal } from "./components/UploadModal";
import { SettingsModal } from "./components/SettingsModal";
import { OnboardingDialog } from "./components/OnboardingDialog";
import { Chat } from "./components/Chat";
import { extractYearFromFilename } from "./lib/year-extractor";
import "./index.css";

const CHAT_OPEN_KEY = "tax-chat-open";
const DEV_DEMO_OVERRIDE_KEY = "dev-demo-override";

type SelectedView = "summary" | number | `pending:${string}`;

interface AppState {
  returns: Record<number, TaxReturn>;
  hasStoredKey: boolean;
  selectedYear: SelectedView;
  isLoading: boolean;
  hasUserData: boolean;
  isDemo: boolean;
  isDev: boolean;
}

async function fetchInitialState(): Promise<Pick<AppState, "returns" | "hasStoredKey" | "hasUserData" | "isDemo" | "isDev">> {
  const [configRes, returnsRes] = await Promise.all([
    fetch("/api/config"),
    fetch("/api/returns"),
  ]);
  const { hasKey, isDemo, isDev } = await configRes.json();
  const returns = await returnsRes.json();
  const hasUserData = Object.keys(returns).length > 0;
  return { hasStoredKey: hasKey, returns, hasUserData, isDemo: isDemo ?? false, isDev: isDev ?? false };
}

function getDefaultSelection(returns: Record<number, TaxReturn>): SelectedView {
  const years = Object.keys(returns).map(Number).sort((a, b) => a - b);
  if (years.length === 0) return "summary";
  if (years.length === 1) return years[0] ?? "summary";
  return "summary";
}

function buildNavItems(returns: Record<number, TaxReturn>): NavItem[] {
  const years = Object.keys(returns).map(Number).sort((a, b) => b - a);
  const items: NavItem[] = [];
  if (years.length > 1) items.push({ id: "summary", label: "Summary" });
  items.push(...years.map((y) => ({ id: String(y), label: String(y) })));
  return items;
}

function parseSelectedId(id: string): SelectedView {
  if (id === "summary") return "summary";
  if (id.startsWith("pending:")) return id as `pending:${string}`;
  return Number(id);
}

function cycleDemoOverride(current: boolean | null): boolean | null {
  if (current === null) return true;
  if (current === true) return false;
  return null;
}

function getDemoOverrideLabel(value: boolean | null): string {
  if (value === null) return "demo: auto";
  return value ? "demo: on" : "demo: off";
}

export function App() {
  const [state, setState] = useState<AppState>({
    returns: sampleReturns,
    hasStoredKey: false,
    selectedYear: "summary",
    isLoading: true,
    hasUserData: false,
    isDemo: false,
    isDev: false,
  });
  const [devDemoOverride, setDevDemoOverride] = useState<boolean | null>(() => {
    const stored = localStorage.getItem(DEV_DEMO_OVERRIDE_KEY);
    return stored === null ? null : stored === "true";
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
  const [isOnboardingOpen, setIsOnboardingOpen] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const [isOnboardingProcessing, setIsOnboardingProcessing] = useState(false);
  const [onboardingProgress, setOnboardingProgress] = useState<FileProgress[]>([]);
  const [isDark, setIsDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches
  );

  // Compute effective demo mode early (dev override takes precedence)
  const effectiveIsDemo = devDemoOverride !== null ? devDemoOverride : state.isDemo;

  // When demo mode is toggled on, show sample data instead of user data
  const effectiveReturns = effectiveIsDemo ? sampleReturns : state.returns;
  const navItems = buildNavItems(effectiveReturns);

  useEffect(() => {
    fetchInitialState()
      .then(({ returns, hasStoredKey, hasUserData, isDemo, isDev }) => {
        // Use user data if available, otherwise show sample data
        const effectiveReturns = hasUserData ? returns : sampleReturns;
        setState({
          returns: effectiveReturns,
          hasStoredKey,
          selectedYear: getDefaultSelection(effectiveReturns),
          isLoading: false,
          hasUserData,
          isDemo,
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

      // Dev mode: Shift+D to toggle demo mode preview
      if (state.isDev && e.key === "D" && e.shiftKey) {
        e.preventDefault();
        setDevDemoOverride((prev) => {
          const newValue = cycleDemoOverride(prev);
          if (newValue === null) {
            localStorage.removeItem(DEV_DEMO_OVERRIDE_KEY);
          } else {
            localStorage.setItem(DEV_DEMO_OVERRIDE_KEY, String(newValue));
          }
          return newValue;
        });
        return;
      }

      const currentId =
        state.selectedYear === "summary"
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
    [state.selectedYear, state.isDev, navItems]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  async function processUpload(file: File, apiKey: string): Promise<TaxReturn> {
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
      hasUserData: true,
      // Stay on summary if already there, otherwise navigate to new year
      selectedYear: s.selectedYear === "summary" ? "summary" : taxReturn.year,
    }));

    return taxReturn;
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
    // Reset to initial state with sample data
    setState((s) => ({
      returns: sampleReturns,
      hasStoredKey: false,
      selectedYear: "summary",
      isLoading: false,
      hasUserData: false,
      isDemo: s.isDemo,
      isDev: s.isDev,
    }));
    // Clear chat data
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
    if (state.selectedYear === "summary") return "summary";
    return String(state.selectedYear);
  }
  const selectedId = getSelectedId();

  function getReceiptData(): TaxReturn | null {
    if (typeof state.selectedYear === "number") {
      return effectiveReturns[state.selectedYear] || null;
    }
    return null;
  }

  function renderMainPanel() {
    const commonProps = {
      isChatOpen,
      onToggleChat: () => setIsChatOpen(!isChatOpen),
      navItems,
      selectedId,
      onSelect: handleSelect,
      onOpenStart: () => setIsOnboardingOpen(true),
      isDemo: effectiveIsDemo,
    };

    if (selectedPendingUpload) {
      return <MainPanel view="loading" pendingUpload={selectedPendingUpload} {...commonProps} />;
    }
    if (state.selectedYear === "summary") {
      return <MainPanel view="summary" returns={effectiveReturns} {...commonProps} />;
    }
    const receiptData = getReceiptData();
    if (receiptData) {
      return (
        <MainPanel
          view="receipt"
          data={receiptData}
          title={String(state.selectedYear)}
          {...commonProps}
        />
      );
    }
    return <MainPanel view="summary" returns={effectiveReturns} {...commonProps} />;
  }

  // Find pending upload if selected
  const selectedPendingUpload =
    typeof state.selectedYear === "string" && state.selectedYear.startsWith("pending:")
      ? pendingUploads.find((p) => `pending:${p.id}` === state.selectedYear)
      : null;

  // Show onboarding dialog for new users (unless dismissed) or when manually opened
  // Processing takes precedence - keep dialog open while processing
  const showOnboarding = isOnboardingProcessing || isOnboardingOpen || (!onboardingDismissed && !state.hasStoredKey && !state.hasUserData);

  function getPostUploadNavigation(
    existingYears: number[],
    uploadedYears: number[],
    batchSize: number
  ): SelectedView {
    if (uploadedYears.length === 0) return "summary"; // all failed
    if (batchSize === 1) return uploadedYears[0]!;    // single file -> that year
    return "summary";                                  // multiple files -> summary
  }

  async function handleOnboardingUpload(files: File[], apiKey: string) {
    setIsOnboardingProcessing(true);
    const existingYears = Object.keys(state.returns).map(Number);

    // Initialize progress
    const progress: FileProgress[] = files.map((f) => ({
      id: crypto.randomUUID(),
      filename: f.name,
      status: "pending" as const,
    }));
    setOnboardingProgress(progress);

    // Save API key if needed
    if (!state.hasStoredKey && apiKey) {
      await handleSaveApiKey(apiKey);
    }

    // Process files with progress updates
    const uploadedYears: number[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i]!;
      const id = progress[i]!.id;

      setOnboardingProgress((p) =>
        p.map((f) => (f.id === id ? { ...f, status: "parsing" } : f))
      );

      try {
        const taxReturn = await processUpload(file, apiKey);
        uploadedYears.push(taxReturn.year);
        setOnboardingProgress((p) =>
          p.map((f) =>
            f.id === id ? { ...f, status: "complete", year: taxReturn.year } : f
          )
        );
      } catch (err) {
        setOnboardingProgress((p) =>
          p.map((f) =>
            f.id === id
              ? { ...f, status: "error", error: err instanceof Error ? err.message : "Failed" }
              : f
          )
        );
      }
    }

    // Smart routing
    const nav = getPostUploadNavigation(existingYears, uploadedYears, files.length);
    setState((s) => ({ ...s, selectedYear: nav }));

    setIsOnboardingProcessing(false);
    setIsOnboardingOpen(false);
    setOnboardingProgress([]);
  }

  function handleOnboardingClose() {
    setIsOnboardingOpen(false);
    setOnboardingDismissed(true);
  }

  return (
    <div className="flex h-screen">
      {renderMainPanel()}

      {isChatOpen && (
        <Chat
          returns={effectiveReturns}
          hasApiKey={state.hasStoredKey}
          isDemo={effectiveIsDemo}
          onClose={() => setIsChatOpen(false)}
        />
      )}

      <OnboardingDialog
        isOpen={showOnboarding}
        isDemo={effectiveIsDemo}
        onUpload={handleOnboardingUpload}
        onClose={handleOnboardingClose}
        isProcessing={isOnboardingProcessing}
        fileProgress={onboardingProgress}
        hasStoredKey={state.hasStoredKey}
        existingYears={Object.keys(state.returns).map(Number)}
      />

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

      {/* Get started pill - show in demo mode when onboarding was dismissed */}
      {effectiveIsDemo && onboardingDismissed && !showOnboarding && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in">
          <button
            onClick={() => setIsOnboardingOpen(true)}
            className="get-started-pill px-4 py-2 text-sm font-medium rounded-full bg-black text-white dark:bg-zinc-800 shadow-lg hover:scale-105 transition-transform"
          >
            Get started
          </button>
        </div>
      )}

      {/* Dev mode indicator */}
      {state.isDev && (
        <div className="fixed bottom-4 left-4 z-50">
          <button
            onClick={() => {
              setDevDemoOverride((prev) => {
                const newValue = cycleDemoOverride(prev);
                if (newValue === null) {
                  localStorage.removeItem(DEV_DEMO_OVERRIDE_KEY);
                } else {
                  localStorage.setItem(DEV_DEMO_OVERRIDE_KEY, String(newValue));
                }
                return newValue;
              });
            }}
            className="px-2 py-1 text-xs font-mono rounded bg-[var(--color-bg-muted)] border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:border-[var(--color-text-muted)]"
          >
            {getDemoOverrideLabel(devDemoOverride)}
            <span className="ml-1.5 opacity-50">Shift+D</span>
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
