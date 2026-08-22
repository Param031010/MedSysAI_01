import type { Facility } from "@/types";
import { apiFetch, isMockMode, mockDelay } from "./client";
import { mockFacilities } from "./mocks";

export async function getFacilities(specialty?: string): Promise<Facility[]> {
  if (isMockMode) {
    const list = specialty
      ? mockFacilities.filter((f) => f.specialty === specialty)
      : mockFacilities;
    return mockDelay(list);
  }
  const query = specialty ? `?specialty=${encodeURIComponent(specialty)}` : "";
  return apiFetch<Facility[]>(`/facilities${query}`);
}
