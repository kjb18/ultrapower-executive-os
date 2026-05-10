import { NextRequest, NextResponse } from "next/server";

const SHEET_ID = process.env.GOOGLE_SHEET_ID!;
const SCOPES = ["https://www.googleapis.com/auth/spreadsheets"];

// TOKEN SAFETY: No Claude API calls here -- pure Google Sheets integration
async function getAccessToken(): Promise<string> {
  const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON!);
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: creds.client_email,
    scope: SCOPES.join(" "),
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  };

  // Create JWT
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" })).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const body = btoa(JSON.stringify(payload)).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const unsigned = `${header}.${body}`;

  // Sign with private key using Web Crypto
  const keyData = creds.private_key
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\n/g, "");
  const binaryKey = Uint8Array.from(atob(keyData), c => c.charCodeAt(0));
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8", binaryKey,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false, ["sign"]
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5", cryptoKey,
    new TextEncoder().encode(unsigned)
  );
  const sigB64 = btoa(String.fromCharCode(...new Uint8Array(signature))).replace(/=/g,"").replace(/\+/g,"-").replace(/\//g,"_");
  const jwt = `${unsigned}.${sigB64}`;

  // Exchange JWT for access token
  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  });
  const tokenData = await tokenRes.json();
  if (!tokenData.access_token) throw new Error(`Token error: ${JSON.stringify(tokenData)}`);
  return tokenData.access_token;
}

async function sheetsRequest(token: string, method: string, path: string, body?: object) {
  const res = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}${path}`, {
    method,
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return res.json();
}

async function ensureSheets(token: string) {
  const info = await sheetsRequest(token, "GET", "");
  const existing = (info.sheets || []).map((s: {properties:{title:string}}) => s.properties.title);
  const needed = ["Projects","Transactions","Documents"];
  const missing = needed.filter(n => !existing.includes(n));
  if (missing.length > 0) {
    await sheetsRequest(token, "POST", ":batchUpdate", {
      requests: missing.map(title => ({ addSheet: { properties: { title } } }))
    });
    // Add headers to new sheets
    const headers: Record<string, string[][]> = {
      Projects: [["Project ID","Project Name","Client","Stage","VAT Type","RFQ Date","PO Date","Invoice Date","Invoice Amount","Payment Terms","Payment Due Date","Payment Status","Total COGS","Total Shipping","Total Project Expenses","Gross Profit","Gross Margin %","Created At"]],
      Transactions: [["Date","Month","Project ID","Project Name","Client","Type","Category","Description","Amount","VAT Applicable","VAT Amount","Net Amount"]],
      Documents: [["Date","Project ID","Project Name","Client","Document Type","Document Number","Amount","Status"]],
    };
    for (const sheet of missing) {
      if (headers[sheet]) {
        await sheetsRequest(token, "PUT", `/values/${sheet}!A1`, {
          range: `${sheet}!A1`, valueInputOption: "RAW",
          values: headers[sheet]
        });
      }
    }
  }
}

export async function POST(req: NextRequest) {
  try {
    const { action, sheet, rows, projectId } = await req.json();
    const token = await getAccessToken();
    await ensureSheets(token);

    if (action === "append") {
      // Append rows to a sheet
      await sheetsRequest(token, "POST", `/values/${sheet}!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
        values: rows,
      });
      return NextResponse.json({ ok: true });
    }

    if (action === "updateProject") {
      // Find and update project row by Project ID
      const data = await sheetsRequest(token, "GET", `/values/Projects!A:A`);
      const rowIndex = (data.values || []).findIndex((r: string[]) => r[0] === projectId);
      if (rowIndex >= 0) {
        await sheetsRequest(token, "PUT", `/values/Projects!A${rowIndex+1}?valueInputOption=USER_ENTERED`, {
          values: [rows[0]]
        });
      } else {
        await sheetsRequest(token, "POST", `/values/Projects!A1:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, {
          values: rows
        });
      }
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

export async function GET() {
  try {
    const token = await getAccessToken();
    await ensureSheets(token);
    const [projects, transactions, documents] = await Promise.all([
      sheetsRequest(token, "GET", "/values/Projects!A:R"),
      sheetsRequest(token, "GET", "/values/Transactions!A:L"),
      sheetsRequest(token, "GET", "/values/Documents!A:H"),
    ]);
    return NextResponse.json({ projects, transactions, documents });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
