import { apiFetch, isMockMode, mockDelay } from "./client";

export interface SymptomLog {
  name: string;
  date: string;
  loggedAt?: string;
}

export async function logSymptom(name: string, date: string): Promise<void> {
  if (isMockMode) {
    return mockDelay(undefined as unknown as void, 300);
  }
  await apiFetch<{ status: string }>("/symptoms", {
    method: "POST",
    body: JSON.stringify({ name, date }),
  });
}

export async function listSymptoms(): Promise<SymptomLog[]> {
  if (isMockMode) {
    return mockDelay([], 300);
  }
  return apiFetch<SymptomLog[]>("/symptoms");
}

export async function deleteSymptom(name: string): Promise<void> {
  if (isMockMode) {
    return mockDelay(undefined as unknown as void, 300);
  }
  await apiFetch<{ status: string }>(`/symptoms/${encodeURIComponent(name)}`, {
    method: "DELETE",
  });
}

