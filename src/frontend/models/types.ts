export type Role =
  "superadmin" | "sector_admin" | "management" | "ombudsman" | "viewer";
export type QuestionType = "rating" | "nps" | "yes_no" | "choice" | "text";
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  sectorIds: string[];
  mustChangePassword: boolean;
  active?: boolean;
}
export interface Sector {
  id: string;
  name: string;
  slug: string;
  description: string;
  active: boolean;
}
export interface Question {
  id: string;
  text: string;
  type: QuestionType;
  category: string;
  options: string[];
  position: number;
  active: boolean;
  version: number;
}
export interface Survey {
  id: string;
  sectorId: string;
  title: string;
  description: string;
  active: boolean;
  questions: Question[];
}
export interface Permissions {
  canManageUsers: boolean;
  canManageSectors: boolean;
  canEditSurveys: boolean;
  canViewResponses: boolean;
  canViewManifestations: boolean;
  canViewContacts: boolean;
  canExportDetails: boolean;
  canViewDashboard: boolean;
  canManageSettings: boolean;
}
export interface Settings {
  hospitalName: string;
  commentLimit: number;
  lowScoreThreshold: number;
  autoResetSeconds: number;
}
export interface Bootstrap {
  user: User;
  sectors: Sector[];
  surveys: Survey[];
  users: User[];
  categories: string[];
  permissions: Permissions;
  demo?: boolean;
  settings?: Settings;
}
export interface Answer {
  questionId: string;
  questionText: string;
  type: QuestionType;
  category: string;
  value: string | number | boolean;
  answeredAt: string;
}
export interface ResponseRow {
  id: string;
  sectorId: string;
  sectorName: string;
  surveyId: string;
  surveyTitle: string;
  status: string;
  attendedOn: string | null;
  shift: string | null;
  createdAt: string;
  submittedAt: string | null;
  nps: number | null;
  comment: string;
  manifestationType: string;
  phone?: string;
  wantsContact: boolean;
  answers: Answer[];
  manifestationStatus?: string;
}
export interface DashboardData {
  nps: number | null;
  satisfaction: number | null;
  responseCount: number;
  partialCount: number;
  pendingCount: number;
  positivePercent: number | null;
  criticalCount: number;
  ratingDistribution: { score: number; count: number }[];
  monthly: { month: string; label: string; count: number }[];
  recent: ResponseRow[];
  bySector: {
    id: string;
    name: string;
    count: number;
    nps: number | null;
    satisfaction: number | null;
  }[];
  distribution: { score: number; count: number }[];
  manifestationCounts: Record<string, number>;
  comparison: {
    responsePercent: number | null;
    satisfactionDelta: number | null;
  };
}
export interface Manifestation {
  id: string;
  responseId: string;
  sectorId: string;
  sectorName: string;
  type: string;
  comment: string;
  phone?: string;
  wantsContact: boolean;
  status: "nova" | "pendente" | "em_atendimento" | "resolvida";
  internalNote: string;
  createdAt: string;
  updatedAt: string;
  history: { at: string; by: string; status: string; note: string }[];
}
export interface Filters {
  sectorId: string;
  from: string;
  to: string;
}
