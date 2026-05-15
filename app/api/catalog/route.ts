import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";
import { ProductItem, Supplier } from "@/lib/constants";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

type CatalogItem = ProductItem | Supplier;

export async function OPTIONS() {
  return NextResponse.json({}, { headers: CORS });
}

export async function GET(req: NextRequest) {
  const type = req.nextUrl.searchParams.get("type");
  if (type !== "products" && type !== "suppliers") {
    return NextResponse.json({ error: "type must be products or suppliers" }, { status: 400, headers: CORS });
  }
  try {
    const data = await redis.get<CatalogItem[]>(`catalog:${type}`);
    return NextResponse.json({ data: data || [] }, { headers: CORS });
  } catch {
    return NextResponse.json({ error: "Redis error" }, { status: 500, headers: CORS });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { type, action, item } = await req.json();

    if (type !== "products" && type !== "suppliers") {
      return NextResponse.json({ error: "type must be products or suppliers" }, { status: 400, headers: CORS });
    }
    if (action !== "save" && action !== "delete") {
      return NextResponse.json({ error: "action must be save or delete" }, { status: 400, headers: CORS });
    }
    if (!item || !item.id) {
      return NextResponse.json({ error: "item with id is required" }, { status: 400, headers: CORS });
    }

    const key = `catalog:${type}`;
    const existing = await redis.get<CatalogItem[]>(key) || [];

    let updated: CatalogItem[];
    if (action === "save") {
      const idx = existing.findIndex((x) => x.id === item.id);
      updated = idx >= 0
        ? existing.map((x) => x.id === item.id ? item : x)
        : [item, ...existing];
    } else {
      updated = existing.filter((x) => x.id !== item.id);
    }

    await redis.set(key, JSON.stringify(updated));
    return NextResponse.json({ ok: true, data: updated }, { headers: CORS });
  } catch {
    return NextResponse.json({ error: "Redis error" }, { status: 500, headers: CORS });
  }
}
