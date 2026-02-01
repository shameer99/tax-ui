import { useState, useRef, useEffect, useCallback } from "react";
import { Menu } from "@base-ui/react/menu";
import type { TaxReturn, PendingUpload } from "../lib/schema";
import type { NavItem } from "../lib/types";
import { ReceiptView } from "./ReceiptView";
import { SummaryStats } from "./SummaryStats";
import { SummaryTable } from "./SummaryTable";
import { SummaryReceiptView } from "./SummaryReceiptView";
import { LoadingView } from "./LoadingView";
import { BrailleSpinner } from "./BrailleSpinner";

interface CommonProps {
  isChatOpen: boolean;
  isChatLoading?: boolean;
  onToggleChat: () => void;
  navItems: NavItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  onOpenStart: () => void;
  isDemo: boolean;
}

interface ReceiptProps extends CommonProps {
  view: "receipt";
  data: TaxReturn;
  title: string;
}

interface SummaryProps extends CommonProps {
  view: "summary";
  returns: Record<number, TaxReturn>;
}

interface LoadingProps extends CommonProps {
  view: "loading";
  pendingUpload: PendingUpload;
}

type Props = ReceiptProps | SummaryProps | LoadingProps;

type SummaryViewMode = "table" | "receipt";

const ITEM_WIDTH = 70;
const OVERFLOW_BUTTON_WIDTH = 40;

// Shared menu styles
const menuPopupClassName = "menu-popup bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-lg shadow-black/5 dark:shadow-black/20 py-1.5";
const menuItemClassName = "menu-item mx-1.5 px-2.5 py-1.5 text-sm cursor-pointer rounded-lg outline-none text-[var(--color-text-muted)] flex items-center gap-2.5 select-none";
const menuTriggerClassName = "p-1.5 rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-muted)]";

export function MainPanel(props: Props) {
  const [summaryViewMode, setSummaryViewMode] = useState<SummaryViewMode>("table");
  const [visibleCount, setVisibleCount] = useState(props.navItems.length);
  const navRef = useRef<HTMLElement>(null);

  const calculateVisibleItems = useCallback(() => {
    if (!navRef.current) return;
    const availableWidth = navRef.current.offsetWidth;
    const maxItems = Math.floor((availableWidth - OVERFLOW_BUTTON_WIDTH) / ITEM_WIDTH);
    setVisibleCount(Math.max(1, Math.min(props.navItems.length, maxItems)));
  }, [props.navItems.length]);

  useEffect(() => {
    calculateVisibleItems();
    const observer = new ResizeObserver(calculateVisibleItems);
    if (navRef.current) {
      observer.observe(navRef.current);
    }
    return () => observer.disconnect();
  }, [calculateVisibleItems]);

  const visibleItems = props.navItems.slice(0, visibleCount);
  const overflowItems = props.navItems.slice(visibleCount);
  const hasOverflow = overflowItems.length > 0;

  return (
    <div className="flex-1 flex flex-col h-screen overflow-hidden bg-[var(--color-bg)]">
      {/* Header */}
      <header className="h-12 px-3 sm:pl-6 sm:pr-3 flex items-center justify-between flex-shrink-0 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-6 min-w-0 flex-1">
          {/* Hamburger Menu */}
          <Menu.Root>
            <Menu.Trigger className={`${menuTriggerClassName} -ml-1.5`}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M2 4h12M2 8h12M2 12h12" />
              </svg>
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner className="z-50" sideOffset={8}>
                <Menu.Popup className={`${menuPopupClassName} min-w-[180px]`}>
                  <Menu.Item
                    onClick={props.onOpenStart}
                    className={menuItemClassName}
                  >
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="currentColor" className="opacity-60">
                      <path d="M2.5 1.5a1 1 0 0 1 1.5-.86l7 4a1 1 0 0 1 0 1.72l-7 4A1 1 0 0 1 2.5 9.5v-8z" />
                    </svg>
                    Start
                  </Menu.Item>
                  <Menu.Item
                    onClick={() => window.open("https://github.com/brianlovin/tax-ui", "_blank")}
                    className={menuItemClassName}
                  >
                    <svg width="15" height="15" viewBox="0 0 15 15" fill="currentColor" className="opacity-60">
                      <path fillRule="evenodd" clipRule="evenodd" d="M7.5 0C3.35 0 0 3.35 0 7.5c0 3.32 2.15 6.14 5.13 7.13.38.07.51-.16.51-.36 0-.18-.01-.65-.01-.65-2.09.45-2.53-1.01-2.53-1.01-.34-.87-.84-1.1-.84-1.1-.68-.46.05-.46.05-.46.76.05 1.16.78 1.16.78.67 1.15 1.77.82 2.2.62.07-.48.26-.82.47-1.01-1.67-.19-3.43-.84-3.43-3.72 0-.82.3-1.5.78-2.02-.08-.19-.34-.96.07-2 0 0 .64-.2 2.08.77a7.24 7.24 0 013.78 0c1.44-.98 2.08-.77 2.08-.77.42 1.04.15 1.81.07 2 .49.52.78 1.2.78 2.02 0 2.89-1.76 3.53-3.44 3.71.27.24.51.69.51 1.39 0 1.01-.01 1.82-.01 2.07 0 .2.14.44.52.36A7.51 7.51 0 0015 7.5C15 3.35 11.65 0 7.5 0z" />
                    </svg>
                    Contribute
                  </Menu.Item>
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
          <nav ref={navRef} className="flex items-center gap-0.5 flex-1 min-w-0">
            {visibleItems.map((item) => (
              <button
                key={item.id}
                onClick={() => props.onSelect(item.id)}
                className={`px-2.5 py-1 text-sm font-medium rounded-lg flex-shrink-0 ${
                  props.selectedId === item.id
                    ? "text-[var(--color-text)] bg-[var(--color-bg-muted)]"
                    : "text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-muted)]"
                }`}
              >
                {item.label}
              </button>
            ))}
            {/* Add button */}
            <button
              onClick={props.onOpenStart}
              className="w-7 h-7 flex items-center justify-center rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-muted)] flex-shrink-0"
              title="Add tax returns"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.25">
                <path d="M6 1v10M1 6h10" />
              </svg>
            </button>
            {hasOverflow && (
              <Menu.Root>
                <Menu.Trigger className={`${menuTriggerClassName} px-2.5 py-1 text-sm font-medium`}>
                  ···
                </Menu.Trigger>
                <Menu.Portal>
                  <Menu.Positioner className="z-50" sideOffset={8}>
                    <Menu.Popup className={`${menuPopupClassName} min-w-[100px]`}>
                      {overflowItems.map((item) => (
                        <Menu.Item
                          key={item.id}
                          onClick={() => props.onSelect(item.id)}
                          className={`${menuItemClassName} ${
                            props.selectedId === item.id
                              ? "text-[var(--color-text)] font-medium"
                              : ""
                          }`}
                        >
                          {item.label}
                        </Menu.Item>
                      ))}
                    </Menu.Popup>
                  </Menu.Positioner>
                </Menu.Portal>
              </Menu.Root>
            )}
          </nav>
        </div>
        {!props.isChatOpen && (
          <button
            onClick={props.onToggleChat}
            className="px-2.5 py-1 text-sm font-medium rounded-lg text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-muted)] flex-shrink-0 flex items-center gap-2"
          >
            Chat
            {props.isChatLoading && <BrailleSpinner className="text-xs" />}
          </button>
        )}
      </header>

      {/* Content */}
      {props.view === "loading" ? (
        <LoadingView
          filename={props.pendingUpload.filename}
          year={props.pendingUpload.year}
          status={props.pendingUpload.status}
        />
      ) : props.view === "summary" ? (
        summaryViewMode === "table" ? (
          <div className="flex-1 flex flex-col min-h-0">
            <SummaryStats returns={props.returns} />
            <div className="flex-1 min-h-0">
              <SummaryTable returns={props.returns} />
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <SummaryReceiptView returns={props.returns} />
          </div>
        )
      ) : props.view === "receipt" ? (
        <div className="flex-1 overflow-y-auto">
          <ReceiptView data={props.data} />
        </div>
      ) : null}
    </div>
  );
}
