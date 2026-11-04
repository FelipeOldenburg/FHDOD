export const roles = [
  "superadmin",
  "sector_admin",
  "management",
  "ombudsman",
  "viewer",
] as const;
export const questionTypes = [
  "rating",
  "nps",
  "yes_no",
  "choice",
  "text",
] as const;
export const manifestationTypes = [
  "elogio",
  "reclamacao",
  "sugestao",
  "outro",
] as const;
export const statuses = [
  "nova",
  "pendente",
  "em_atendimento",
  "resolvida",
] as const;
export const categories = [
  "Recepção",
  "Triagem",
  "Enfermagem",
  "Médico",
  "Atendimento",
  "Higiene/Limpeza",
  "Estrutura",
  "Tempo de espera",
  "NPS",
];
export const defaultSettings = {
  hospitalName: "Fundação Hospitalar Dr. Oswaldo Diesel",
  commentLimit: 1000,
  lowScoreThreshold: 6,
  autoResetSeconds: 10,
};

export type Role = (typeof roles)[number];
export type QuestionType = (typeof questionTypes)[number];
