import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type Props = {
  page: number;
  totalPages: number;
  rowsPerPage: number;
  onPageChange: (page: number) => void;
  onRowsPerPageChange: (size: number) => void;
};

export function TablePaginationControls({
  page,
  totalPages,
  rowsPerPage,
  onPageChange,
  onRowsPerPageChange,
}: Props) {
  return (
    <div className="mt-3 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Label htmlFor="rows-per-page" className="text-xs text-muted-foreground">
          Rows per view
        </Label>
        <Input
          id="rows-per-page"
          className="h-8 w-20"
          type="number"
          min={5}
          max={100}
          value={rowsPerPage}
          onChange={(e) => onRowsPerPageChange(Math.max(5, Number(e.target.value) || 10))}
        />
      </div>
      <div className="flex items-center gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Prev
        </Button>
        <span className="text-xs text-muted-foreground">
          Page {page} of {totalPages}
        </span>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Next
        </Button>
      </div>
    </div>
  );
}
