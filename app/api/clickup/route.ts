import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const token = process.env.CLICKUP_API_TOKEN;

  if (!token) {
    return NextResponse.json({ error: "CLICKUP_API_TOKEN not set", tasks: [] });
  }

  try {
    // Step 1 — get workspaces
    const teamsRes = await fetch("https://api.clickup.com/api/v2/team", {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(8000),
    });
    const teamsData = await teamsRes.json();
    const teamId = teamsData?.teams?.[0]?.id;
    if (!teamId) return NextResponse.json({ tasks: [] });

    // Step 2 — get all spaces
    const spacesRes = await fetch(`https://api.clickup.com/api/v2/team/${teamId}/space?archived=false`, {
      headers: { Authorization: token },
      signal: AbortSignal.timeout(8000),
    });
    const spacesData = await spacesRes.json();
    const spaces = spacesData?.spaces || [];

    // Step 3 — get tasks with due dates across all spaces
    const allTasks: Task[] = [];

    for (const space of spaces.slice(0, 5)) {
      const tasksRes = await fetch(
        `https://api.clickup.com/api/v2/team/${teamId}/task?space_ids[]=${space.id}&include_closed=false&due_date_gt=0&page=0`,
        {
          headers: { Authorization: token },
          signal: AbortSignal.timeout(8000),
        }
      );
      const tasksData = await tasksRes.json();
      const tasks = tasksData?.tasks || [];

      for (const t of tasks) {
        if (!t.due_date) continue;
        allTasks.push({
          id: t.id,
          name: t.name,
          status: t.status?.status || "open",
          statusColor: t.status?.color || "#b0bec8",
          dueDate: parseInt(t.due_date),
          dueDateStr: new Date(parseInt(t.due_date)).toISOString().split("T")[0],
          priority: t.priority?.priority || "normal",
          listName: t.list?.name || space.name,
          url: t.url,
          spaceName: space.name,
        });
      }
    }

    // Sort by due date
    allTasks.sort((a, b) => a.dueDate - b.dueDate);

    return NextResponse.json({ tasks: allTasks });
  } catch (err) {
    return NextResponse.json({ error: "ClickUp fetch failed", tasks: [] });
  }
}

interface Task {
  id: string;
  name: string;
  status: string;
  statusColor: string;
  dueDate: number;
  dueDateStr: string;
  priority: string;
  listName: string;
  url: string;
  spaceName: string;
}
