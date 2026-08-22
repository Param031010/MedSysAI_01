import { Stethoscope, ClipboardPlus, Pill, FileText, Globe } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { ChatSourceKind } from "@/types";

export const KIND_ICON: Record<ChatSourceKind, LucideIcon> = {
  consultation: Stethoscope,
  consult_prescription: ClipboardPlus,
  prescription: Pill,
  report: FileText,
  web: Globe,
};

export const KIND_LABEL: Record<ChatSourceKind, string> = {
  consultation: "Consultation",
  consult_prescription: "Consult + Prescription",
  prescription: "Prescription",
  report: "Report",
  web: "Search result",
};
