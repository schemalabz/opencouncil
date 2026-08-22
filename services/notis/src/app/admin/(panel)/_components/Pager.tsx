import Link from "next/link";
import { fmtInt } from "../_lib/format";

/**
 * Prev / next paging for the admin lists. `hrefFor` builds the target URL so
 * each list preserves its own filters; hidden entirely on a single page.
 */
export function Pager({
  page,
  pages,
  total,
  hrefFor,
}: {
  page: number;
  pages: number;
  total: number;
  hrefFor: (page: number) => string;
}) {
  if (pages <= 1) return null;
  const linkCls = "rounded border px-2 py-1 text-xs transition-colors hover:text-foreground";
  const disabledCls = "rounded border px-2 py-1 text-xs text-muted-foreground/40";
  return (
    <div className="flex items-center justify-between border-t pt-3 text-xs text-muted-foreground">
      <span className="tabular-nums">
        Σελίδα {fmtInt(page)} από {fmtInt(pages)} · {fmtInt(total)} συνολικά
      </span>
      <div className="flex gap-1.5">
        {page > 1 ? (
          <Link href={hrefFor(page - 1)} className={linkCls}>
            Προηγούμενα
          </Link>
        ) : (
          <span className={disabledCls}>Προηγούμενα</span>
        )}
        {page < pages ? (
          <Link href={hrefFor(page + 1)} className={linkCls}>
            Επόμενα
          </Link>
        ) : (
          <span className={disabledCls}>Επόμενα</span>
        )}
      </div>
    </div>
  );
}
