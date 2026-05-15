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

const VALID_TYPES = ["RFQ", "PO", "INV", "DR", "QUOT"];

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  if (!type) return NextResponse.json({ error: "Missing type" }, { status: 400, headers: CORS });
  if (!VALID_TYPES.includes(type)) {
    return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400, headers: CORS });
  }

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const key = `docnum:${type}:${year}-${month}`;

  try {
    const seq = await redis.incr(key);
    const docNumber = `${type}-UP${year}-${month}${String(seq).padStart(3, "0")}`;
    return NextResponse.json({ docNumber, seq, year, month }, { headers: CORS });
  } catch {
    return NextResponse.json({ error: "Redis error" }, { status: 500, headers: CORS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { type, year, month } = await req.json();
    if (!type || !year || !month) {
      return NextResponse.json({ error: "Missing type, year, or month" }, { status: 400, headers: CORS });
    }
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` }, { status: 400, headers: CORS });
    }
    const key = `docnum:${type}:${year}-${month}`;
    await redis.set(key, 0);
    return NextResponse.json({ ok: true, reset: key }, { headers: CORS });
  } catch {
    return NextResponse.json({ error: "Redis error" }, { status: 500, headers: CORS });
  }
}
