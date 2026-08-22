import { apiFetch, isMockMode, mockDelay } from "./client";

export async function logSymptom(name: string, date: string): Promise<void> {
  if (isMockMode) {
    return mockDelay(undefined as unknown as void, 300);
  }
  await apiFetch<{ status: string }>("/symptoms", {
    method: "POST",
    body: JSON.stringify({ name, date }),
  });
}
