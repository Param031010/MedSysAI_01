import type { Facility } from "@/types";
import { apiFetch, isMockMode, mockDelay } from "./client";
import { mockFacilities } from "./mocks";

export async function getFacilities(params?: {
  specialty?: string;
  lat?: number;
  lng?: number;
  radiusKm?: number;
}): Promise<Facility[]> {
  if (isMockMode) {
    const list = params?.specialty
      ? mockFacilities.filter((f) => f.specialty === params.specialty)
      : mockFacilities;
    return mockDelay(list);
  }
  const searchParams = new URLSearchParams();
  if (params?.specialty) searchParams.set("specialty", params.specialty);
  if (params?.lat !== undefined) searchParams.set("lat", params.lat.toString());
  if (params?.lng !== undefined) searchParams.set("lng", params.lng.toString());
  if (params?.radiusKm !== undefined) searchParams.set("radius_km", params.radiusKm.toString());

  const query = searchParams.toString();
  return apiFetch<Facility[]>(`/facilities${query ? `?${query}` : ""}`);
}

