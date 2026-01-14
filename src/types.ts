export type UserRole = "ADMIN" | "PRESTADOR";
export type UserStatus = "PENDING" | "ACTIVE" | "REJECTED";

export type Status =
  | "PENDENTE"
  | "EM_ANDAMENTO"
  | "REVISAO"
  | "AJUSTES"
  | "APROVADO"
  | "ATRASADO"
  | "CONCLUIDO";

export type Priority = "BAIXA" | "MEDIA" | "ALTA";

export type ViewState =
  | "LOGIN"
  | "SIGNUP"
  | "PENDING"
  | "DASHBOARD"
  | "ENTREGAS"
  | "PROJETOS"
  | "DETALHE_ENTREGA"
  | "DETALHE_PROJETO"
  | "USUARIOS"
  | "PRESTADORES"
  | "PERFIL";

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  active: boolean;
  pixKey?: string;
  photoURL?: string;
  createdAt: number;
  approvedAt?: number;
}

export interface Project {
  id: string;
  client: string;
  name: string;

  description?: string;
  externalLink?: string;

  manager: string;
  managerUid: string;
  memberUids: string[];
  status: Status;
  completionRate: number;

  createdAt: number;
  updatedAt?: number;
}

export interface Delivery {
  id: string;
  projectId: string;

  client: string;
  project: string;

  title: string;
  description: string;

  deadline: string;

  status: Status;
  priority: Priority;

  provider: string;
  providerUid: string;

  externalLink?: string;

  createdAt: number;
  updatedAt?: number;
}

export interface SafetyDoc {
  id: string;
  uid: string; // uid do prestador
  title: string;
  issuedAt: string;
  expiresAt?: string;
  externalLink?: string; // link de drive (sem storage no plano free)
  notes?: string;
  createdAt: number;
}

export function isValidUrl(v: string): boolean {
  try {
    const u = new URL(v);
    return !!u.protocol && !!u.host;
  } catch {
    return false;
  }
}
