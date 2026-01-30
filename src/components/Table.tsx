import {
  type ColumnDef,
  type ColumnSizingState,
  flexRender,
  getCoreRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { useState, useEffect } from "react";

export interface ColumnMeta {
  align?: "left" | "right";
  borderLeft?: boolean;
  sticky?: boolean;
}

interface TableProps<TData> {
  data: TData[];
  columns: ColumnDef<TData, unknown>[];
  storageKey?: string;
}

export function Table<TData>({ data, columns, storageKey }: TableProps<TData>) {
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
    <table className="w-full border-collapse" style={{ minWidth: "max-content" }}>
      <thead className="sticky top-0 z-20">
        {table.getHeaderGroups().map((headerGroup) => (
          <tr
            key={headerGroup.id}
            className="border-b border-[var(--color-border)]"
          >
            {headerGroup.headers.map((header) => {
              const meta = header.column.columnDef.meta as ColumnMeta | undefined;
              const alignClass = meta?.align === "right" ? "text-right" : "text-left";
              const borderClass = meta?.borderLeft ? "border-l border-[var(--color-border)]" : "";
              const stickyClass = meta?.sticky
                ? "sticky left-0 z-30 border-r border-[var(--color-border)] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]"
                : "";

              return (
                <th
                  key={header.id}
                  colSpan={header.colSpan}
                  className={`${alignClass} ${borderClass} ${stickyClass} py-2 px-2 font-bold relative bg-[var(--color-bg)]`}
                  style={{
                    width: header.getSize(),
                  }}
                >
                  {header.isPlaceholder
                  ? null
                  : flexRender(
                      header.column.columnDef.header,
                      header.getContext()
                    )}
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
        {table.getRowModel().rows.map((row) => (
          <tr key={row.id} className="group">
            {row.getVisibleCells().map((cell) => {
              const meta = cell.column.columnDef.meta as ColumnMeta | undefined;
              const borderClass = meta?.borderLeft ? "border-l border-[var(--color-border)]" : "";
              const stickyClass = meta?.sticky
                ? "sticky left-0 z-10 border-r border-[var(--color-border)] shadow-[2px_0_4px_-2px_rgba(0,0,0,0.1)]"
                : "";
              const truncateClass = meta?.sticky ? "truncate max-w-[160px]" : "";
              const hoverClass = meta?.sticky
                ? "bg-[var(--color-bg)] group-hover:bg-[var(--color-row-hover)]"
                : "group-hover:bg-[var(--color-row-hover)]";

              return (
                <td
                  key={cell.id}
                  className={`py-1 px-2 ${borderClass} ${stickyClass} ${truncateClass} ${hoverClass}`}
                  style={{
                    width: cell.column.getSize(),
                  }}
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export { type ColumnDef } from "@tanstack/react-table";
export { createColumnHelper } from "@tanstack/react-table";
