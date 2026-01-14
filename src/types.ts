export type UserRole = "ADMIN" | "PRESTADOR";

export type Status = "PENDENTE" | "REVISAO" | "AJUSTES" | "APROVADO" | "ATRASADO";
export type Priority = "BAIXA" | "MEDIA" | "ALTA";

export type UserStatus = "PENDING" | "ACTIVE" | "REJECTED";

export interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  active: boolean;
  pixKey?: string;
  createdAt: number;
  approvedAt?: number;
}

export type NotificationType =
  | "COMMENT"
  | "SUBMITTED"
  | "APPROVED"
  | "ADJUST_REQUESTED"
  | "SYSTEM";

export interface AppNotification {
  id: string;
  toUid: string;
  type: NotificationType;
  title: string;
  projectId?: string;
  deliveryId?: string;
  createdAt: number;
  read: boolean;
}

export interface Comment {
  id: string;
  authorUid: string;
  authorName: string;
  date: string;
  text: string;
  createdAt: number;
}

export interface Attachment {
  id: string;
  name: string;
  size: string;
  date: string;
  uploaderUid: string;
  uploaderName: string;
  // Storage desativado no MVP
  url?: string;
  notes?: string;
  createdAt: number;
}

export interface ChecklistItem {
  id: string;
  label: string;
  completed: boolean;
}

export interface Delivery {
  id: string;

  projectId: string;
  client: string;
  project: string;

  title: string;
  deadline: string;
  status: Status;
  priority: Priority;

  provider: string;
  providerUid?: string;

  description: string;

  checklist: ChecklistItem[];
  attachments: Attachment[];
  comments: Comment[];

  createdAt: number;
  managerUid?: string;
}

export interface Project {
  id: string;
  client: string;
  name: string;

  manager: string;
  managerUid?: string;

  memberUids?: string[];

  status: "EM_ANDAMENTO" | "CONCLUIDO" | "CANCELADO";
  completionRate: number;

  createdAt: number;
}

export type SafetyDocType = "NR10" | "NR33" | "NR35" | "ASO" | "OUTRO";

export interface SafetyDoc {
  id: string;

  ownerUid: string;
  ownerName: string;

  type: SafetyDocType;
  title: string;

  issueDate?: string;  // yyyy-mm-dd
  expiryDate?: string; // yyyy-mm-dd

  url?: string;        // link externo opcional
  notes?: string;

  createdAt: number;
  updatedAt?: number;
}

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
