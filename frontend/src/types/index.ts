export type SystemStatus = "stable" | "moderate" | "serious";

export interface PollutantReading {
  label: string;
  value: number;
  unit: string;
}

export interface EnvironmentSnapshot {
  locationName: string;
  tempC: number;
  condition: string;
  humidityPct: number;
  aqi: number;
  aqiCategory: string;
  pollutants: PollutantReading[];
  updatedAt: string;
}

export interface GraphNode {
  id: string;
  label: string;
  date: string;
  description?: string;
  category?: string;
}

export interface GraphEdge {
  source: string;
  target: string;
  durationDays: number;
  relation?: string;
  rationale?: string;
}

export interface KnowledgeGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface HomeSnapshot {
  status: SystemStatus;
  statusNote: string;
  environment: EnvironmentSnapshot;
  tip: string;
  generalTip: string;
  graph: KnowledgeGraph;
}

export type ChatSourceKind =
  | "consultation"
  | "consult_prescription"
  | "prescription"
  | "report"
  | "web";

export interface ChatSource {
  id: string;
  title: string;
  kind: ChatSourceKind;
  uploadedAt: string;
  excerpt: string;
  url?: string;
}

export interface ChatSourceDetail extends ChatSource {
  content: string;
}

export interface ChatSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  sourceIds: string[];
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface ModelStatus {
  provider: "ollama" | "groq" | "gemini";
  model: string;
  reachable: boolean;
}

export type FacilityType = "hospital" | "clinic" | "diagnostic_center";

export interface Facility {
  id: string;
  name: string;
  type: FacilityType;
  specialty: string;
  address: string;
  distanceKm: number;
  lat: number;
  lng: number;
  openNow: boolean;
  phone?: string;
}

export interface ProfileRecord {
  fullName: string;
  age: number;
  weightKg: number;
  heightCm: number;
  bmi: number;
  bloodGroup: string;
  conditions: string[];
  medications: { name: string; dosage: string }[];
  emergencyContact: { name: string; relation: string; phone: string };
}
