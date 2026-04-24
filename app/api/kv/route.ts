import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "No key" }, { status: 400, headers: CORS });
  try {
    const val = await redis.get(key);
    return NextResponse.json({ value: val }, { headers: CORS });
  } catch {
    return NextResponse.json({ error: "Redis error" }, { status: 500, headers: CORS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { key, value } = await req.json();
    if (!key) return NextResponse.json({ error: "No key" }, { status: 400, headers: CORS });
    await redis.set(key, value);
    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch {
    return NextResponse.json({ error: "Redis error" }, { status: 500, headers: CORS });
  }
}

export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "No key" }, { status: 400, headers: CORS });
  try {
    await redis.del(key);
    return NextResponse.json({ ok: true }, { headers: CORS });
  } catch {
    return NextResponse.json({ error: "Redis error" }, { status: 500, headers: CORS });
  }
}
