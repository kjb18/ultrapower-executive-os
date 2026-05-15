import { NextRequest, NextResponse } from "next/server";

const BASE = "https://api.clickup.com/api/v2";
const MIT_LIST_NAME = "Executive MITs";

async function cu(path: string, token: string, method = "GET", body?: object) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: token, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(8000),
  });
  return res.json();
}

// Find or create the Executive MITs list
async function getMITListId(token: string): Promise<string | null> {
  try {
    const teams = await cu("/team", token);
    const teamId = teams?.teams?.[0]?.id;
    if (!teamId) return null;

    const spaces = await cu(`/team/${teamId}/space?archived=false`, token);
    const firstSpace = spaces?.spaces?.[0];
    if (!firstSpace) return null;

    // Check folders and folderless lists
    const [folders, lists] = await Promise.all([
      cu(`/space/${firstSpace.id}/folder?archived=false`, token),
      cu(`/space/${firstSpace.id}/list?archived=false`, token),
    ]);

    // Search folderless lists first
    const folderlessLists = lists?.lists || [];
    const found = folderlessLists.find((l: {name:string}) => l.name === MIT_LIST_NAME);
    if (found) return found.id;

    // Search inside folders
    for (const folder of (folders?.folders || [])) {
      const folderLists = await cu(`/folder/${folder.id}/list?archived=false`, token);
      const fl = (folderLists?.lists || []).find((l: {name:string}) => l.name === MIT_LIST_NAME);
      if (fl) return fl.id;
    }

    // Create new list in first space (folderless)
    const created = await cu(`/space/${firstSpace.id}/list`, token, "POST", {
      name: MIT_LIST_NAME,
      content: "Daily Most Important Tasks synced from Ultra Power Executive OS",
    });
    return created?.id || null;
  } catch (e) {
    console.error("getMITListId error:", e);
    return null;
  }
}

export async function POST(req: NextRequest) {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) return NextResponse.json({ error: "CLICKUP_API_TOKEN not set" }, { status: 500 });

  try {
    const { action, taskId, name, dueDate } = await req.json();

    if (action === "create") {
      const listId = await getMITListId(token);
      if (!listId) return NextResponse.json({ error: "Could not find or create MIT list" }, { status: 500 });
      const body: Record<string, unknown> = { name, notify_all: false };
      if (dueDate) body.due_date = new Date(dueDate).getTime();
      const task = await cu(`/list/${listId}/task`, token, "POST", body);
      return NextResponse.json({ taskId: task?.id, url: task?.url });
    }

    if (action === "complete") {
      await cu(`/task/${taskId}`, token, "PUT", { status: "complete" });
      return NextResponse.json({ ok: true });
    }

    if (action === "reopen") {
      await cu(`/task/${taskId}`, token, "PUT", { status: "Open" });
      return NextResponse.json({ ok: true });
    }

    if (action === "fetch") {
      // Fetch open tasks from the MIT list for the picker
      const listId = await getMITListId(token);
      if (!listId) return NextResponse.json({ tasks: [] });
      const data = await cu(`/list/${listId}/task?include_closed=false`, token);
      const tasks = (data?.tasks || []).map((t: {id:string;name:string;due_date?:string}) => ({
        id: t.id,
        name: t.name,
        dueDate: t.due_date ? new Date(parseInt(t.due_date)).toISOString().split("T")[0] : null,
      }));
      return NextResponse.json({ tasks });
    }

    if (action === "fetchAll") {
      // Fetch all open tasks across all spaces for the picker
      const teams = await cu("/team", token);
      const teamId = teams?.teams?.[0]?.id;
      if (!teamId) return NextResponse.json({ tasks: [] });
      const data = await cu(`/team/${teamId}/task?include_closed=false&page=0`, token);
      const tasks = (data?.tasks || []).slice(0, 50).map((t: {id:string;name:string;due_date?:string;list?:{name:string}}) => ({
        id: t.id,
        name: t.name,
        dueDate: t.due_date ? new Date(parseInt(t.due_date)).toISOString().split("T")[0] : null,
        listName: t.list?.name || "",
      }));
      return NextResponse.json({ tasks });
    }

    if (action === "checkStatus") {
      // Check completion status of multiple tasks
      const { taskIds } = await req.json().catch(() => ({ taskIds: [] as string[] }));
      // Re-parse since we already consumed the body
      return NextResponse.json({ error: "Use taskIds in the original body" }, { status: 400 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

// Poll completion status of linked MITs
export async function GET(req: NextRequest) {
  const token = process.env.CLICKUP_API_TOKEN;
  if (!token) return NextResponse.json({ error: "CLICKUP_API_TOKEN not set" }, { status: 500 });

  const ids = req.nextUrl.searchParams.get("ids");
  if (!ids) return NextResponse.json({ statuses: {} });

  try {
    const idList = ids.split(",").filter(Boolean);
    const statuses: Record<string, boolean> = {};
    await Promise.all(idList.map(async (id) => {
      try {
        const task = await cu(`/task/${id}`, token);
        statuses[id] = task?.status?.type === "closed" || task?.status?.status?.toLowerCase() === "complete";
      } catch { statuses[id] = false; }
    }));
    return NextResponse.json({ statuses });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
