export function fail(status, message) {
  throw Object.assign(new Error(message), { status });
}

export function parse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function text(value, name, max = 200, optional = false) {
  if (optional && (value === undefined || value === null || value === ""))
    return "";
  if (typeof value !== "string" || !value.trim() || value.trim().length > max)
    fail(400, `${name}: informe um texto de até ${max} caracteres.`);
  return value.trim();
}

export function integer(value, min, max, name) {
  if (!Number.isInteger(value) || value < min || value > max)
    fail(400, `${name}: use um número inteiro entre ${min} e ${max}.`);
  return value;
}

export function validEmail(value) {
  const email = text(value, "E-mail", 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    fail(400, "Informe um e-mail válido.");
  return email;
}

export function dateOnly(value, name, optional = true) {
  if (!value && optional) return "";
  if (
    typeof value !== "string" ||
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T12:00:00Z`)) ||
    new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) !== value
  )
    fail(400, `${name}: informe uma data válida.`);
  return value;
}
