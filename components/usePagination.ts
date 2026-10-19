import { useState } from 'react';

export function usePagination<T>(rows: T[], resetKey: string, initialPageSize = 10) {
  const [pageSize, setPageSize] = useState(initialPageSize);
  const key = `${resetKey}:${pageSize}`;
  const [position, setPosition] = useState({ key, page: 1 });
  const page = Math.max(1, Math.min(position.key === key ? position.page : 1, Math.ceil(rows.length / pageSize) || 1));
  return {
    total: rows.length, page, pageSize,
    visible: rows.slice((page - 1) * pageSize, page * pageSize),
    onPage: (next: number) => setPosition({ key, page: next }),
    onPageSize: setPageSize,
  };
}
