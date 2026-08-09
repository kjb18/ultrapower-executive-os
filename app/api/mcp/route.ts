import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

// Internal calls route through the real API endpoints (not raw Redis writes) so that
// Sheets sync and financial rollups in /api/projects stay the single source of truth.
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://ultrapower-executive-os-vgrr.vercel.app";

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

// Tool definitions
const TOOLS = [
  {
    name: "get_projects",
    description: "Get all projects from Ultra Power Executive OS. Returns project list with names, clients, stages, and financial data.",
    inputSchema: {
      type: "object",
      properties: {
        includeArchived: { type: "boolean", description: "Include archived projects. Default false." },
        filterClient: { type: "string", description: "Filter by client name (partial match)." },
        filterStage: { type: "string", description: "Filter by stage name." },
      },
    },
  },
  {
    name: "get_project_detail",
    description: "Get full details of a specific project including quotations, line items, and financials.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID to retrieve." },
        projectName: { type: "string", description: "Or search by project name (partial match)." },
      },
    },
  },
  {
    name: "create_project",
    description: "Create a new project in Ultra Power Executive OS. Every project starts with an RFQ. Returns the created project ID.",
    inputSchema: {
      type: "object",
      properties: {
        name: { type: "string", description: "Project name e.g. 'PGPC Wireline Surveillance Jul 2026'" },
        client: { type: "string", description: "Client company name e.g. 'PGPC'" },
        stage: { type: "string", description: "Project stage. One of: RFQ Received, Sourcing, RFQ Submitted, Negotiation, PO Received, In Fulfillment, Delivered, Invoiced, Payment Pending, Closed, Lost, No Offer. Default: RFQ Received" },
        vatType: { type: "string", description: "VAT type. One of: VAT Inclusive, Zero Rated, Exempt. Default: VAT Inclusive" },
        rfqNumber: { type: "string", description: "RFQ reference number from client" },
        rfqSubject: { type: "string", description: "Subject/description of the RFQ" },
        rfqDeadline: { type: "string", description: "RFQ deadline in YYYY-MM-DD format" },
        contactPerson: { type: "string", description: "Contact person name at the client" },
        notes: { type: "string", description: "Additional notes about the project" },
        lineItems: {
          type: "array",
          description: "Line items from the RFQ",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              unitPrice: { type: "number" },
            },
          },
        },
      },
      required: ["name", "client"],
    },
  },
  {
    name: "update_project",
    description: "Update an existing project's fields. Only send the fields you want to change.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "The project ID to update." },
        projectName: { type: "string", description: "Or find by project name (partial match)." },
        stage: { type: "string" },
        notes: { type: "string" },
        invoiceAmount: { type: "number" },
        paymentTerms: { type: "string" },
        paymentStatus: { type: "string" },
        totalCogs: { type: "number" },
        totalShipping: { type: "number" },
        totalProjectExpenses: { type: "number" },
      },
      required: [],
    },
  },
  {
    name: "save_quotation",
    description: "Save a quotation to a project. Creates a new version automatically. Returns the quotation doc number.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID to save quotation to." },
        projectName: { type: "string", description: "Or find by project name (partial match)." },
        lineItems: {
          type: "array",
          description: "Quotation line items with marked-up prices",
          items: {
            type: "object",
            properties: {
              description: { type: "string" },
              quantity: { type: "number" },
              unit: { type: "string" },
              unitPrice: { type: "number" },
              total: { type: "number" },
            },
            required: ["description", "quantity", "unit", "unitPrice"],
          },
        },
        subtotal: { type: "number" },
        vatAmount: { type: "number" },
        grandTotal: { type: "number" },
        delivery: { type: "string", description: "Delivery terms" },
        validity: { type: "string", description: "Validity period" },
        warranty: { type: "string", description: "Warranty terms" },
        paymentTerms: { type: "string", description: "Payment terms" },
        salutation: { type: "string", description: "Dear Sir, / Dear Ma'am, / Dear Sir/Ma'am," },
        notes: { type: "string" },
      },
      required: ["lineItems"],
    },
  },
  {
    name: "save_sourcing_session",
    description: "Save a sourcing session to the command center, optionally linked to a project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string", description: "Project ID to link this session to." },
        projectName: { type: "string", description: "Or find by project name (partial match)." },
        sessionName: { type: "string", description: "Name for the session e.g. 'LED Flood Light sourcing'" },
        items: {
          type: "array",
          description: "Items that were sourced",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "string" },
              specs: { type: "string" },
            },
          },
        },
        results: { type: "string", description: "Full sourcing results text" },
      },
      required: ["sessionName", "items"],
    },
  },
  {
    name: "get_product_catalog",
    description: "Get the product catalog from Ultra Power. Returns saved products with codes, descriptions, prices.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search by product description or code." },
      },
    },
  },
  {
    name: "get_suppliers",
    description: "Get the supplier database from Ultra Power.",
    inputSchema: {
      type: "object",
      properties: {
        search: { type: "string", description: "Search by supplier name." },
      },
    },
  },
  {
    name: "save_expense",
    description: "Save an expense entry, optionally linked to a project.",
    inputSchema: {
      type: "object",
      properties: {
        projectId: { type: "string" },
        projectName: { type: "string" },
        date: { type: "string", description: "YYYY-MM-DD format" },
        type: { type: "string", description: "COGS, Shipping Cost, Shipping Revenue, Project Expense, or OpEx" },
        category: { type: "string" },
        description: { type: "string" },
        amount: { type: "number" },
        vatApplicable: { type: "boolean" },
      },
      required: ["date", "type", "description", "amount"],
    },
  },
];

// Helper: find project by ID or name
async function findProject(projectId?: string, projectName?: string): Promise<any | null> {
  const projects = await redis.get<any[]>("projects:all") || [];
  if (projectId) return projects.find(p => p.id === projectId) || null;
  if (projectName) {
    const lower = projectName.toLowerCase();
    return projects.find(p => p.name?.toLowerCase().includes(lower) || p.client?.toLowerCase().includes(lower)) || null;
  }
  return null;
}

// Helper: generate ID
function genId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

// Tool handlers
async function handleTool(name: string, args: Record<string, any>): Promise<string> {
  switch (name) {
    case "get_projects": {
      const all = await redis.get<any[]>("projects:all") || [];
      let filtered = all;
      if (!args.includeArchived) filtered = filtered.filter(p => !p.archived);
      if (args.filterClient) filtered = filtered.filter(p => p.client?.toLowerCase().includes(args.filterClient.toLowerCase()));
      if (args.filterStage) filtered = filtered.filter(p => p.stage === args.filterStage);
      return JSON.stringify(filtered.map(p => ({
        id: p.id, name: p.name, client: p.client, stage: p.stage,
        vatType: p.vatType, rfqDeadline: p.rfqDeadline,
        invoiceAmount: p.invoiceAmount, grossProfit: p.grossProfit,
        paymentStatus: p.paymentStatus, notes: p.notes?.slice(0, 100),
        quotationCount: p.quotations?.length || 0,
      })));
    }

    case "get_project_detail": {
      const proj = await findProject(args.projectId, args.projectName);
      if (!proj) return JSON.stringify({ error: "Project not found" });
      return JSON.stringify(proj);
    }

    case "create_project": {
      const proj = {
        id: genId(),
        name: args.name,
        client: args.client,
        stage: args.stage || "RFQ Received",
        vatType: args.vatType || "VAT Inclusive",
        rfqDate: new Date().toISOString().split("T")[0],
        rfqNumber: args.rfqNumber || "",
        rfqSubject: args.rfqSubject || "",
        rfqDeadline: args.rfqDeadline || "",
        rfqContactPersonName: args.contactPerson || "",
        rfqLineItems: (args.lineItems || []).map((item: any, i: number) => ({
          id: "mcp-" + i,
          description: item.description || "",
          quantity: item.quantity || 0,
          unit: item.unit || "pcs",
          unitPrice: item.unitPrice || 0,
          total: (item.quantity || 0) * (item.unitPrice || 0),
        })),
        notes: args.notes || "",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      const res = await fetch(`${APP_URL}/api/projects`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveProject", project: proj }),
      });
      if (!res.ok) return JSON.stringify({ error: "Failed to save project" });
      return JSON.stringify({ success: true, projectId: proj.id, name: proj.name });
    }

    case "update_project": {
      const proj = await findProject(args.projectId, args.projectName);
      if (!proj) return JSON.stringify({ error: "Project not found" });

      const updateFields = ["stage","notes","invoiceAmount","paymentTerms","paymentStatus","totalCogs","totalShipping","totalProjectExpenses"];
      for (const f of updateFields) {
        if (args[f] !== undefined) proj[f] = args[f];
      }
      // Recompute gross profit -- Gross Profit = Revenue - COGS - Shipping Cost - Project Expenses
      const gp = (proj.invoiceAmount||0) - (proj.totalCogs||0) - (proj.totalShipping||0) - (proj.totalProjectExpenses||0);
      proj.grossProfit = gp;
      proj.grossMarginPct = proj.invoiceAmount > 0 ? Math.round((gp/proj.invoiceAmount)*100) : 0;

      const res = await fetch(`${APP_URL}/api/projects`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveProject", project: proj }),
      });
      if (!res.ok) return JSON.stringify({ error: "Failed to update project" });
      return JSON.stringify({ success: true, projectId: proj.id, name: proj.name, grossProfit: proj.grossProfit });
    }

    case "save_quotation": {
      const proj = await findProject(args.projectId, args.projectName);
      if (!proj) return JSON.stringify({ error: "Project not found. Create a project first." });

      const docRes = await fetch(`${APP_URL}/api/docnum?type=QUOT`);
      const docData = await docRes.json();
      const docNumber: string = docData.docNumber || `QUOT-${Date.now()}`;

      const quotation = {
        id: genId(),
        version: 1,
        docNumber,
        dateCreated: new Date().toISOString(),
        status: "Draft",
        lineItems: (args.lineItems || []).map((item: any, i: number) => ({
          id: "mcp-q-" + i,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          total: item.total || item.quantity * item.unitPrice,
        })),
        totalAmount: args.subtotal || 0,
        vatType: proj.vatType || "VAT Inclusive",
        vatAmount: args.vatAmount || 0,
        grandTotal: args.grandTotal || args.subtotal || 0,
        notes: args.notes || "",
        html: "",
        salutation: args.salutation || "Dear Sir/Ma'am,",
        validity: args.validity || "",
        delivery: args.delivery || "",
        warranty: args.warranty || "",
        paymentTerms: args.paymentTerms || "",
      };

      const res = await fetch(`${APP_URL}/api/projects`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveQuotation", projectId: proj.id, quotation }),
      });
      if (!res.ok) return JSON.stringify({ error: "Failed to save quotation" });
      const data = await res.json();
      const saved = data.project?.quotations?.find((q: any) => q.id === quotation.id);
      return JSON.stringify({ success: true, docNumber, version: saved?.version || quotation.version, projectName: proj.name });
    }

    case "save_sourcing_session": {
      let projectId = args.projectId;
      if (!projectId && args.projectName) {
        const proj = await findProject(undefined, args.projectName);
        if (proj) projectId = proj.id;
      }

      const session = {
        id: genId(),
        name: args.sessionName || "Imported Session",
        items: (args.items || []).map((item: any) => ({
          item: item.name,
          quantity: item.quantity || "",
          specs: item.specs || "",
          suppliers: [],
        })),
        searched_at: new Date().toISOString(),
        query: args.items || [],
        status: "Sourcing",
        projectId: projectId || undefined,
        results: args.results || "",
      };

      const existing = await redis.get<any[]>("exec-os:sourcing:history") || [];
      const updated = [session, ...(Array.isArray(existing) ? existing : [])];
      await redis.set("exec-os:sourcing:history", JSON.stringify(updated));

      return JSON.stringify({ success: true, sessionId: session.id, linkedProject: projectId || "none" });
    }

    case "get_product_catalog": {
      const products = await redis.get<any[]>("catalog:products") || [];
      let filtered = products;
      if (args.search) {
        const s = args.search.toLowerCase();
        filtered = products.filter(p => p.description?.toLowerCase().includes(s) || p.code?.toLowerCase().includes(s));
      }
      return JSON.stringify(filtered);
    }

    case "get_suppliers": {
      const suppliers = await redis.get<any[]>("catalog:suppliers") || [];
      let filtered = suppliers;
      if (args.search) {
        const s = args.search.toLowerCase();
        filtered = suppliers.filter(sup => sup.name?.toLowerCase().includes(s));
      }
      return JSON.stringify(filtered);
    }

    case "save_expense": {
      let projectId = args.projectId;
      let projectName: string | undefined;
      if (projectId || args.projectName) {
        const proj = await findProject(projectId, args.projectName);
        if (proj) { projectId = proj.id; projectName = proj.name; }
      }

      const amt = args.amount || 0;
      const vatAmt = args.vatApplicable ? amt * 0.12 : 0;
      const expense = {
        id: genId(),
        projectId: projectId || undefined,
        projectName: projectName || undefined,
        date: args.date || new Date().toISOString().split("T")[0],
        type: args.type || "OpEx",
        category: args.category || "",
        description: args.description || "",
        amount: amt,
        vatApplicable: args.vatApplicable || false,
        vatAmount: vatAmt,
        netAmount: amt + vatAmt,
        createdAt: new Date().toISOString(),
      };

      const res = await fetch(`${APP_URL}/api/projects`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "saveExpense", expense }),
      });
      if (!res.ok) return JSON.stringify({ error: "Failed to save expense" });
      return JSON.stringify({ success: true, expenseId: expense.id });
    }

    default:
      return JSON.stringify({ error: "Unknown tool: " + name });
  }
}

// MCP Protocol handler -- Streamable HTTP transport
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({
      jsonrpc: "2.0", id: null,
      error: { code: -32700, message: "Parse error" },
    }, { status: 400, headers: CORS });
  }

  const { method, id, params } = body;
  // JSON-RPC notifications have no "id" and must not receive a JSON-RPC response body.
  const isNotification = id === undefined;

  try {
    if (method === "initialize") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion: "2024-11-05",
          capabilities: { tools: {} },
          serverInfo: {
            name: "ultrapower-executive-os",
            version: "1.0.0",
          },
        },
      }, { headers: CORS });
    }

    if (method === "tools/list") {
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: { tools: TOOLS },
      }, { headers: CORS });
    }

    if (method === "tools/call") {
      const toolName = params?.name;
      const toolArgs = params?.arguments || {};
      const result = await handleTool(toolName, toolArgs);
      return NextResponse.json({
        jsonrpc: "2.0",
        id,
        result: {
          content: [{ type: "text", text: result }],
        },
      }, { headers: CORS });
    }

    if (method === "ping") {
      return NextResponse.json({ jsonrpc: "2.0", id, result: {} }, { headers: CORS });
    }

    if (isNotification) {
      return new NextResponse(null, { status: 202, headers: CORS });
    }

    return NextResponse.json({
      jsonrpc: "2.0",
      id,
      error: { code: -32601, message: "Method not found: " + method },
    }, { headers: CORS });
  } catch (e) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: id ?? null,
      error: { code: -32603, message: String(e) },
    }, { status: 500, headers: CORS });
  }
}

// Handle GET for compatibility -- basic server info, not a live SSE stream.
export async function GET() {
  return NextResponse.json({
    name: "ultrapower-executive-os",
    version: "1.0.0",
    description: "Ultra Power Executive OS MCP Server - manage projects, quotations, sourcing, expenses",
    tools: TOOLS.map(t => t.name),
  }, { headers: CORS });
}
