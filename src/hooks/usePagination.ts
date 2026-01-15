import { useMemo, useState } from "react";
import { PAGE_SIZE } from "../constants";

export function usePagination<T>(items: T[], pageSize = PAGE_SIZE) {
  const [page, setPage] = useState(1);

  const sliced = useMemo(() => {
    return items.slice(0, page * pageSize);
  }, [items, page, pageSize]);

  const canLoadMore = sliced.length < items.length;

  const loadMore = () => setPage((p) => p + 1);
  const reset = () => setPage(1);

  return { page, sliced, canLoadMore, loadMore, reset };
}
