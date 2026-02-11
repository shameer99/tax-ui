import { useState } from "react";

import { Button } from "./Button";
import { Dialog } from "./Dialog";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  hasApiKey: boolean;
  onClearData: () => Promise<void>;
}

export function SettingsModal({ isOpen, onClose, hasApiKey, onClearData }: Props) {
  const [isClearing, setIsClearing] = useState(false);
  const [error, setError] = useState("");

  async function handleClearData() {
    setIsClearing(true);
    setError("");
    try {
      await onClearData();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to clear data");
    } finally {
      setIsClearing(false);
    }
  }

  function handleClose() {
    setError("");
    onClose();
  }

  return (
    <Dialog open={isOpen} onClose={handleClose} title="Settings">
      <div className="space-y-6">
        {/* API Key Status */}
        <div>
          <label className="mb-2 block text-sm font-medium">Gemini API Key</label>
          <div className="flex items-center gap-2 text-sm text-(--color-text-muted)">
            <span
              className={`inline-block h-2 w-2 rounded-full ${hasApiKey ? "bg-green-500" : "bg-amber-500"}`}
            />
            {hasApiKey ? "Configured via .env" : "Add GEMINI_API_KEY to .env in project root"}
          </div>
        </div>

        {/* Clear Data Section */}
        <div className="border-t border-(--color-border) pt-4">
          <label className="mb-2 block text-sm font-medium">Data Management</label>
          <Button
            variant="danger-outline"
            size="sm"
            onClick={handleClearData}
            disabled={isClearing}
          >
            {isClearing ? "Resetting" : "Reset data"}
          </Button>
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </Dialog>
  );
}
