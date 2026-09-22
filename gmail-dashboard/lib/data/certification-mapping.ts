// certifications row -> Certification mapper (0021_life_layer.sql). One
// resource, one mapper — same convention as every other row/type pair in
// lib/data.
import "server-only";
import type { Certification, CertificationStatus } from "@/lib/data/types";

export interface CertificationRow {
  id: string;
  plan_id: string | null;
  name: string;
  provider: string | null;
  status: CertificationStatus;
  exam_date: string | null;
  expiry_date: string | null;
  cost: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export function mapCertificationRowToCertification(row: CertificationRow): Certification {
  return {
    id: row.id,
    planId: row.plan_id,
    name: row.name,
    provider: row.provider,
    status: row.status,
    examDate: row.exam_date,
    expiryDate: row.expiry_date,
    cost: row.cost,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
