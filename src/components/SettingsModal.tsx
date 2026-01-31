import { useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Button } from "./Button";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  hasApiKey: boolean;
  onSaveApiKey: (key: string) => Promise<void>;
  onClearData: () => Promise<void>;
}

export function SettingsModal({ isOpen, onClose, hasApiKey, onSaveApiKey, onClearData }: Props) {
  const [apiKey, setApiKey] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState("");
  const [showConfirmClear, setShowConfirmClear] = useState(false);

  async function handleSaveKey() {
    if (!apiKey.trim()) return;
    setIsSaving(true);
    setError("");
    try {
      await onSaveApiKey(apiKey.trim());
      setApiKey("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save API key");
    } finally {
      setIsSaving(false);
    }
  }

  async function handleClearData() {
    setIsClearing(true);
    setError("");
    try {
      await onClearData();
      setShowConfirmClear(false);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear data");
    } finally {
      setIsClearing(false);
    }
  }

  function handleClose() {
    setApiKey("");
    setError("");
    setShowConfirmClear(false);
    onClose();
  }

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="dialog-backdrop fixed inset-0 bg-[var(--color-overlay)] backdrop-blur-[2px] z-40" />
        <Dialog.Popup className="dialog-popup fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-md bg-[var(--color-bg)] border border-[var(--color-border)] rounded-2xl shadow-2xl p-6">
          <Dialog.Title className="text-base font-medium mb-6">Settings</Dialog.Title>

          <div className="space-y-6">
            {/* API Key Section */}
            <div>
              <label className="block text-sm font-medium mb-2">Anthropic API Key</label>
              {hasApiKey ? (
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
                    <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
                    API key configured
                  </div>
                  <input
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Enter new key to update..."
                    autoComplete="off"
                    data-1p-ignore
                    data-lpignore="true"
                    className="w-full px-3 py-2 text-sm bg-[var(--color-bg-muted)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-text-muted)]"
                  />
                </div>
              ) : (
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  autoComplete="off"
                  data-1p-ignore
                  data-lpignore="true"
                  className="w-full px-3 py-2 text-sm bg-[var(--color-bg-muted)] border border-[var(--color-border)] rounded-lg focus:outline-none focus:border-[var(--color-text-muted)]"
                />
              )}
              {apiKey.trim() && (
                <Button
                  onClick={handleSaveKey}
                  disabled={isSaving}
                  size="sm"
                  className="mt-2"
                >
                  {isSaving ? "Saving..." : "Save API Key"}
                </Button>
              )}
            </div>

            {/* Clear Data Section */}
            <div className="pt-4 border-t border-[var(--color-border)]">
              <label className="block text-sm font-medium mb-2">Data Management</label>
              {!showConfirmClear ? (
                <Button
                  variant="danger-outline"
                  size="sm"
                  onClick={() => setShowConfirmClear(true)}
                >
                  Clear All Data
                </Button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--color-text-muted)]">
                    This will delete your API key, tax returns, and chat history. Are you sure?
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={handleClearData}
                      disabled={isClearing}
                    >
                      {isClearing ? "Clearing..." : "Yes, Clear Everything"}
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setShowConfirmClear(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
          </div>

          <Dialog.Close className="absolute top-5 right-5 p-1 text-[var(--color-text-muted)] hover:text-[var(--color-text)] rounded-lg hover:bg-[var(--color-bg-muted)]">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M4 4l8 8M12 4l-8 8" />
            </svg>
          </Dialog.Close>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
