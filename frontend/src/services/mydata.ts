import type { ChatSource } from "@/types";
import { apiUpload, isMockMode, mockDelay } from "./client";
import { deleteChatSource, getChatSources, getSourceContent } from "./chat";

export const listMyData = getChatSources;
export const getMyDataContent = getSourceContent;
export const deleteMyDataSource = deleteChatSource;

export async function uploadMyData(file: File): Promise<ChatSource> {
  if (isMockMode) {
    return mockDelay(
      {
        id: `local-${Date.now()}`,
        title: file.name,
        kind: "report",
        uploadedAt: new Date().toISOString().slice(0, 10),
        excerpt:
          "This is a mock report — connect VITE_API_BASE_URL to a running backend to OCR and generate a real one.",
      },
      1200,
    );
  }
  const formData = new FormData();
  formData.append("file", file);
  return apiUpload<ChatSource>("/mydata/upload", formData);
}
