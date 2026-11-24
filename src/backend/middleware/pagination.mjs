import { integer } from "./validation.mjs";

const pageSize = 25;

export function paginate(query, total) {
  const requested = integer(
    Number(query.get("page") ?? 1),
    1,
    1_000_000,
    "Página",
  );
  const page = Math.min(requested, Math.max(1, Math.ceil(total / pageSize)));
  return { page, pageSize, total };
}

export const pageOffset = ({ page, pageSize }) => (page - 1) * pageSize;
