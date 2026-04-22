import { useMemo, useState } from "react";

export function useTablePagination<T>(rows: T[], initialRowsPerPage = 10) {
  const [page, setPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(initialRowsPerPage);

  const totalPages = Math.max(1, Math.ceil(rows.length / rowsPerPage));

  const pagedRows = useMemo(() => {
    const start = (page - 1) * rowsPerPage;
    return rows.slice(start, start + rowsPerPage);
  }, [page, rows, rowsPerPage]);

  const safeSetPage = (next: number) => {
    setPage(Math.max(1, Math.min(totalPages, next)));
  };

  return {
    page,
    rowsPerPage,
    totalPages,
    pagedRows,
    setPage: safeSetPage,
    setRowsPerPage: (value: number) => {
      setRowsPerPage(value);
      setPage(1);
    },
  };
}
