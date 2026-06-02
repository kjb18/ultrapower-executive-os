import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import type { Quotation } from "@/lib/constants";

const redis = new Redis({ url: process.env.KV_REST_API_URL!, token: process.env.KV_REST_API_TOKEN! });
const CORS = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,PUT,DELETE,OPTIONS", "Access-Control-Allow-Headers": "Content-Type" };

export async function OPTIONS() { return NextResponse.json({}, { headers: CORS }); }

export interface Project {
  id: string;
  name: string;
  client: string;
  stage: "RFQ Received"|"Sourcing"|"RFQ Submitted"|"Negotiation"|"PO Received"|"In Fulfillment"|"Delivered"|"Invoiced"|"Payment Pending"|"Closed"|"Lost"|"No Offer";
  vatType: "VAT Inclusive"|"Zero Rated"|"Exempt";
  rfqDate: string;
  rfqDeadline?: string;
  finalDeliveryDate?: string;
  rfqNumber?: string;
  rfqSubject?: string;
  rfqContactPersonId?: number;
  rfqContactPersonName?: string;
  rfqLineItems?: unknown[];
  rfqDocument?: string;
  rfqDocumentName?: string;
  quotations?: Quotation[];
  poDate?: string;
  invoiceDate?: string;
  invoiceAmount?: number;
  paymentTerms?: string;
  paymentDueDate?: string;
  paymentStatus?: "Unpaid"|"Paid"|"Overdue";
  totalCogs?: number;
  totalShipping?: number;
  totalProjectExpenses?: number;
  grossProfit?: number;
  grossMarginPct?: number;
  linkedDocuments?: string[];
  linkedSourcing?: string[];
  notes?: string;
  archived?: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Expense {
  id: string;
  projectId?: string;
  projectName?: string;
  date: string;
  type: "COGS"|"Shipping Revenue"|"Shipping Cost"|"Project Expense"|"OpEx";
  category: string;
  description: string;
  amount: number;
  vatApplicable: boolean;
  vatAmount: number;
  netAmount: number;
  createdAt: string;
}

async function syncToSheets(action: string, data: object) {
  try {
    await fetch(`${process.env.NEXT_PUBLIC_APP_URL || "https://ultrapower-executive-os-vgrr.vercel.app"}/api/sheets`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(8000),
    });
  } catch (e) { console.error("Sheets sync error:", e); }
}

export async function GET() {
  try {
    const [projects, expenses] = await Promise.all([
      redis.get<Project[]>("projects:all"),
      redis.get<Expense[]>("expenses:all"),
    ]);
    return NextResponse.json({ projects: projects||[], expenses: expenses||[] }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500, headers: CORS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action } = body;

    if (action === "saveProject") {
      const project: Project = body.project;
      const existing = await redis.get<Project[]>("projects:all") || [];
      const idx = existing.findIndex(p => p.id === project.id);
      let updated;
      if (idx >= 0) { updated = existing.map(p => p.id === project.id ? project : p); }
      else { updated = [project, ...existing]; }
      await redis.set("projects:all", JSON.stringify(updated));

      // Sync to Sheets
      const row = [project.id, project.name, project.client, project.stage, project.vatType,
        project.rfqDate, project.poDate||"", project.invoiceDate||"", project.invoiceAmount||"",
        project.paymentTerms||"", project.paymentDueDate||"", project.paymentStatus||"",
        project.totalCogs||0, project.totalShipping||0, project.totalProjectExpenses||0,
        project.grossProfit||0, project.grossMarginPct||0, project.createdAt,
        project.rfqDeadline||"", project.finalDeliveryDate||"", project.rfqNumber||"", project.rfqSubject||""];
      syncToSheets("updateProject", { action:"updateProject", sheet:"Projects", rows:[row], projectId:project.id }).catch(e => console.error("Sheets sync failed:", e));
      return NextResponse.json({ ok: true, projects: updated }, { headers: CORS });
    }

    if (action === "saveExpense") {
      const expense: Expense = body.expense;
      const existing = await redis.get<Expense[]>("expenses:all") || [];
      const idx = existing.findIndex(e => e.id === expense.id);
      let updated;
      if (idx >= 0) { updated = existing.map(e => e.id === expense.id ? expense : e); }
      else { updated = [expense, ...existing]; }
      await redis.set("expenses:all", JSON.stringify(updated));

      // Recalculate project financials if linked
      if (expense.projectId) {
        const projects = await redis.get<Project[]>("projects:all") || [];
        const proj = projects.find(p => p.id === expense.projectId);
        if (proj) {
          const allExpenses = updated.filter(e => e.projectId === expense.projectId);
          const cogs = allExpenses.filter(e=>e.type==="COGS").reduce((s,e)=>s+e.amount,0);
          const shipping = allExpenses.filter(e=>e.type==="Shipping Cost").reduce((s,e)=>s+e.amount,0);
          const projExp = allExpenses.filter(e=>e.type==="Project Expense").reduce((s,e)=>s+e.amount,0);
          const revenue = proj.invoiceAmount||0;
          const gp = revenue - cogs - shipping - projExp;
          const gm = revenue>0 ? Math.round((gp/revenue)*100) : 0;
          const updatedProj = {...proj, totalCogs:cogs, totalShipping:shipping, totalProjectExpenses:projExp, grossProfit:gp, grossMarginPct:gm};
          const updatedProjects = projects.map(p => p.id === expense.projectId ? updatedProj : p);
          await redis.set("projects:all", JSON.stringify(updatedProjects));
          const row = [updatedProj.id, updatedProj.name, updatedProj.client, updatedProj.stage, updatedProj.vatType,
            updatedProj.rfqDate, updatedProj.poDate||"", updatedProj.invoiceDate||"", updatedProj.invoiceAmount||"",
            updatedProj.paymentTerms||"", updatedProj.paymentDueDate||"", updatedProj.paymentStatus||"",
            cogs, shipping, projExp, gp, gm, updatedProj.createdAt,
            updatedProj.rfqDeadline||"", updatedProj.finalDeliveryDate||"", updatedProj.rfqNumber||"", updatedProj.rfqSubject||""];
          syncToSheets("updateProject", { action:"updateProject", sheet:"Projects", rows:[row], projectId:updatedProj.id }).catch(e => console.error("Sheets sync failed:", e));
        }
      }

      // Sync expense to Sheets transactions
      const month = expense.date.slice(0,7);
      const txRow = [expense.date, month, expense.projectId||"", expense.projectName||"General OpEx",
        "", expense.type, expense.category, expense.description,
        expense.amount, expense.vatApplicable?"Yes":"No", expense.vatAmount, expense.netAmount];
      syncToSheets("append", { action:"append", sheet:"Transactions", rows:[txRow] }).catch(e => console.error("Sheets sync failed:", e));
      return NextResponse.json({ ok: true, expenses: updated }, { headers: CORS });
    }

    if (action === "deleteExpense") {
      const existing = await redis.get<Expense[]>("expenses:all") || [];
      const updated = existing.filter(e => e.id !== body.id);
      await redis.set("expenses:all", JSON.stringify(updated));
      return NextResponse.json({ ok: true }, { headers: CORS });
    }

    if (action === "deleteProject") {
      const existing = await redis.get<Project[]>("projects:all") || [];
      const updated = existing.filter(p => p.id !== body.id);
      await redis.set("projects:all", JSON.stringify(updated));
      return NextResponse.json({ ok: true }, { headers: CORS });
    }

    if (action === "saveQuotation") {
      const { projectId, quotation }: { projectId: string; quotation: Quotation } = body;
      const existing = await redis.get<Project[]>("projects:all") || [];
      const projIdx = existing.findIndex(p => p.id === projectId);
      if (projIdx < 0) {
        return NextResponse.json({ error: "Project not found" }, { status: 404, headers: CORS });
      }
      const proj = existing[projIdx];
      const quotations: Quotation[] = proj.quotations || [];
      const qIdx = quotations.findIndex(q => q.id === quotation.id);
      let finalQuotation = { ...quotation };
      let updatedQuotations: Quotation[];
      if (qIdx >= 0) {
        updatedQuotations = quotations.map(q => q.id === quotation.id ? finalQuotation : q);
      } else {
        finalQuotation = { ...quotation, version: quotations.length + 1 };
        updatedQuotations = [...quotations, finalQuotation];
      }
      const updatedProj: Project = { ...proj, quotations: updatedQuotations, updatedAt: new Date().toISOString() };
      const updated = existing.map(p => p.id === projectId ? updatedProj : p);
      await redis.set("projects:all", JSON.stringify(updated));
      // Sync to Sheets Documents tab
      const docRow = [finalQuotation.dateCreated, proj.id, proj.name, proj.client,
        "Quotation", finalQuotation.docNumber, finalQuotation.grandTotal, finalQuotation.status];
      syncToSheets("append", { action: "append", sheet: "Documents", rows: [docRow] }).catch(e => console.error("Sheets sync failed:", e));
      return NextResponse.json({ ok: true, project: updatedProj }, { headers: CORS });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400, headers: CORS });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500, headers: CORS });
  }
}
