import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "No key" }, { status: 400 });
  try {
    const val = await redis.get(key);
    return NextResponse.json({ value: val });
  } catch {
    return NextResponse.json({ error: "Redis error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { key, value } = await req.json();
    if (!key) return NextResponse.json({ error: "No key" }, { status: 400 });
    await redis.set(key, value);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Redis error" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key) return NextResponse.json({ error: "No key" }, { status: 400 });
  try {
    await redis.del(key);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Redis error" }, { status: 500 });
  }
}
