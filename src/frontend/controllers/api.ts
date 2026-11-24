export function filterQuery(filters: {
  sectorId?: string;
  from?: string;
  to?: string;
  page?: string;
  review?: string;
  type?: string;
  status?: string;
}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value) params.set(key, value);
  return params.toString() ? `?${params}` : "";
}
