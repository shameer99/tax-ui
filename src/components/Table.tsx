import {
  type ColumnDef,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState, useEffect, useRef, useCallback } from "react";

export interface ColumnMeta {
  align?: "left" | "right";
  borderLeft?: boolean;
  sticky?: boolean;
}

interface TableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  storageKey?: string;
  getRowClassName?: (row: TData, index: number) => string;
}

export function Table<TData>({ data, columns, storageKey, getRowClassName }: TableProps<TData>) {
  const [isScrolled, setIsScrolled] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateScrollState = useCallback(() => {
    if (containerRef.current) {
      setIsScrolled(containerRef.current.scrollLeft > 0);
    }
  }, []);

  useEffect(() => {
    const container = containerRef.current;
    if (container) {
      container.addEventListener("scroll", updateScrollState);
      // Check initial scroll state
      updateScrollState();
      return () => container.removeEventListener("scroll", updateScrollState);
    }
  }, [updateScrollState, data]); // Re-run when data changes

  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    if (storageKey && typeof window !== "undefined") {
      const saved = localStorage.getItem(`${storageKey}-column-sizes`);
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch {
          // ignore
        }
      }
    }
    return {};
  });

  useEffect(() => {
    if (storageKey && Object.keys(columnSizing).length > 0) {
      localStorage.setItem(
        `${storageKey}-column-sizes`,
        JSON.stringify(columnSizing)
      );
    }
  }, [columnSizing, storageKey]);

  const table = useReactTable({
    data,
    columns,
    state: {
      columnSizing,
    },
    onColumnSizingChange: setColumnSizing,
    getCoreRowModel: getCoreRowModel(),
    enableColumnResizing: true,
    columnResizeMode: "onChange",
  });

  return (
    <div ref={containerRef} className="overflow-auto w-full h-full [-webkit-overflow-scrolling:touch]">
      <table className="w-full border-collapse" style={{ minWidth: "max-content" }}>
        <thead className="sticky top-0 z-20">
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const meta = header.column.columnDef.meta as ColumnMeta | undefined;
                const alignClass = meta?.align === "right" ? "text-right" : "text-left";
                const stickyClass = meta?.sticky ? "sticky left-0 z-30" : "";

                const shadows = ["inset 0 -1px 0 var(--color-border)"];
                if (meta?.sticky && isScrolled) {
                  shadows.push("inset -1px 0 0 var(--color-border)");
                }
                if (meta?.borderLeft) {
                  shadows.push("inset 1px 0 0 var(--color-border)");
                }
                const headerShadow = shadows.join(", ");

                return (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className={`${alignClass} ${stickyClass} py-2 px-4 text-xs text-[var(--color-text-muted)] font-normal relative bg-[var(--color-bg)]`}
                    style={{
                      width: header.getSize(),
                      boxShadow: headerShadow,
                    }}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                    {header.column.getCanResize() && (
                      <div
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        className={`resizer ${header.column.getIsResizing() ? "isResizing" : ""}`}
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map((row, index) => {
            const customClassName = getRowClassName?.(row.original, index) ?? "";
            return (
            <tr
              key={row.id}
              className={`group hover:bg-[var(--color-row-hover)] ${customClassName}`}
            >
              {row.getVisibleCells().map((cell) => {
                const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
                const stickyClass = meta?.sticky
                  ? "sticky left-0 z-10 bg-[var(--color-bg)] group-hover:bg-[var(--color-row-hover)]"
                  : "";
                const truncateClass = meta?.sticky ? "truncate max-w-[160px]" : "";

                const cellShadows: string[] = [];
                if (meta?.sticky && isScrolled) {
                  cellShadows.push("inset -1px 0 0 var(--color-border)");
                }
                if (meta?.borderLeft) {
                  cellShadows.push("inset 1px 0 0 var(--color-border)");
                }

                return (
                  <td
                    key={cell.id}
                    className={`py-2 px-4 text-sm ${stickyClass} ${truncateClass}`}
                    style={{
                      width: cell.column.getSize(),
                      ...(cellShadows.length > 0 ? { boxShadow: cellShadows.join(", ") } : {}),
                    }}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                );
              })}
            </tr>
          );
          })}
        </tbody>
      </table>
    </div>
  );
}

export { type ColumnDef } from "@tanstack/react-table";
export { createColumnHelper } from "@tanstack/react-table";
