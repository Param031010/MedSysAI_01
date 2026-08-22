import type { HomeSnapshot } from "@/types";
import { apiFetch, isMockMode, mockDelay } from "./client";
import { mockHomeSnapshot } from "./mocks";

export async function getHomeSnapshot(): Promise<HomeSnapshot> {
  if (isMockMode) return mockDelay(mockHomeSnapshot);
  return apiFetch<HomeSnapshot>("/home/snapshot");
}
