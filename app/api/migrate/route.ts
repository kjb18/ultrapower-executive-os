import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

interface RFQDocument { id: string; [key: string]: unknown; }

interface RFQRecord {
  id: number;
  rfqNumber: string;
  client: string;
  subject: string;
  dateSubmitted?: string;
  deadline?: string;
  status: string;
  notes?: string;
  projectId?: string;
  documents?: RFQDocument[];
  lineItems?: unknown[];
  contactPersonId?: number;
  contactPersonName?: string;
}

interface CRMData {
  pendingRFQs?: RFQRecord[];
  [key: string]: unknown;
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");

  if (type === "status") {
    try {
      const [crmRaw, projectsRaw] = await Promise.all([
        redis.get("exec-os:crm"),
        redis.get<unknown[]>("projects:all"),
      ]);
      const crm: CRMData = typeof crmRaw === "string" ? JSON.parse(crmRaw) : ((crmRaw as CRMData) || {});
      const orphaned = (crm.pendingRFQs || []).filter(r => !r.projectId);
      return NextResponse.json({
        orphanedRFQs: orphaned.length,
        totalProjects: (projectsRaw || []).length,
        totalRFQs: (crm.pendingRFQs || []).length,
      }, { headers: CORS });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500, headers: CORS });
    }
  }

  if (type === "rfqs") {
    try {
      const [crmRaw, projectsRaw] = await Promise.all([
        redis.get("exec-os:crm"),
        redis.get<object[]>("projects:all"),
      ]);
      const crm: CRMData = typeof crmRaw === "string" ? JSON.parse(crmRaw) : ((crmRaw as CRMData) || {});
      const existingProjects: object[] = projectsRaw || [];

      const orphaned = (crm.pendingRFQs || []).filter(r => !r.projectId);

      if (orphaned.length === 0) {
        return NextResponse.json({
          migrated: 0,
          projectsCreated: [],
          message: "No orphaned RFQs found",
        }, { headers: CORS });
      }

      const now = new Date();
      const newProjects = orphaned.map(rfq => {
        const monthStr = now.toLocaleDateString("en-PH", { month: "short", year: "numeric" });
        return {
          id: genId(),
          name: `${rfq.client} ${rfq.subject} ${monthStr}`,
          client: rfq.client,
          stage: "RFQ Submitted",
          vatType: "VAT Inclusive",
          rfqNumber: rfq.rfqNumber,
          rfqSubject: rfq.subject,
          rfqDeadline: rfq.deadline || "",
          rfqLineItems: rfq.lineItems || [],
          rfqContactPersonId: rfq.contactPersonId,
          rfqContactPersonName: rfq.contactPersonName,
          notes: rfq.notes || "",
          createdAt: rfq.dateSubmitted || now.toISOString(),
          updatedAt: now.toISOString(),
          linkedDocuments: (rfq.documents || []).map(d => d.id),
          unlinkedFromCRM: true,
        };
      });

      const updatedProjects = [...newProjects, ...existingProjects];
      const orphanedIds = new Set(orphaned.map(r => r.id));
      const updatedRFQs = (crm.pendingRFQs || []).filter(r => !orphanedIds.has(r.id));
      const updatedCRM: CRMData = { ...crm, pendingRFQs: updatedRFQs };

      await Promise.all([
        redis.set("projects:all", JSON.stringify(updatedProjects)),
        redis.set("exec-os:crm", JSON.stringify(updatedCRM)),
      ]);

      return NextResponse.json({
        migrated: newProjects.length,
        projectsCreated: newProjects.map(p => p.name),
      }, { headers: CORS });
    } catch (e) {
      return NextResponse.json({ error: String(e) }, { status: 500, headers: CORS });
    }
  }

  return NextResponse.json(
    { error: "Invalid type. Use ?type=rfqs or ?type=status" },
    { status: 400, headers: CORS }
  );
}
