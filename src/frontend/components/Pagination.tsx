import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PaginationInfo } from "../models/types";
import { formatNumber } from "./components";

export function Pagination({
  data,
  onPage,
  label,
  busy = false,
}: {
  data: PaginationInfo;
  onPage: (page: number) => void;
  label: string;
  busy?: boolean;
}) {
  if (!data.total) return null;
  const first = (data.page - 1) * data.pageSize + 1;
  const last = Math.min(data.page * data.pageSize, data.total);
  return (
    <nav className="record-pagination" aria-label={label}>
      <span role="status">{formatNumber(first)}–{formatNumber(last)} de {formatNumber(data.total)}</span>
      {data.total > data.pageSize && (
        <div>
          <button type="button" className="button secondary" disabled={busy || first === 1} onClick={() => onPage(data.page - 1)}>
            <ChevronLeft size={16} aria-hidden="true" /> Anterior
          </button>
          <button type="button" className="button secondary" disabled={busy || last >= data.total} onClick={() => onPage(data.page + 1)}>
            Próxima <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}
