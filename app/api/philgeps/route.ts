import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const keyword = req.nextUrl.searchParams.get("keyword") || "LED lighting";
  const page = parseInt(req.nextUrl.searchParams.get("page") || "1");
  const pageSize = 20;

  try {
    // PhilGEPS public search URL
    const searchUrl = `https://www.philgeps.gov.ph/GEPSNONPILOT/Tender/SplashOpportunitiesUI.aspx`;
    
    // Build query params for PhilGEPS search
    const params = new URLSearchParams({
      ctl00$contentPlaceHolder1$txtKeyword: keyword,
      ctl00$contentPlaceHolder1$btnSearch: "Search",
    });

    const response = await fetch(searchUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": "Mozilla/5.0 (compatible; UltraPowerOS/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
      body: params.toString(),
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return NextResponse.json({ error: "PhilGEPS unreachable", results: [], total: 0 });
    }

    const html = await response.text();
    
    // Parse results from HTML
    const results = parsePhilGEPSResults(html, page, pageSize);
    
    return NextResponse.json(results);
  } catch (err) {
    // Return mock data if PhilGEPS is unreachable (common in development)
    const mock = getMockResults(keyword, page, pageSize);
    return NextResponse.json({ ...mock, _mock: true });
  }
}

function parsePhilGEPSResults(html: string, page: number, pageSize: number) {
  const results: {
    id: string;
    title: string;
    entity: string;
    category: string;
    amount: string;
    deadline: string;
    published: string;
    url: string;
    status: string;
  }[] = [];

  try {
    // Extract bid entries using regex patterns for PhilGEPS HTML structure
    const rowPattern = /<tr[^>]*class="[^"]*GridRow[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
    let match;
    
    while ((match = rowPattern.exec(html)) !== null) {
      const row = match[1];
      
      // Extract reference number
      const refMatch = row.match(/ReferenceNumber=(\d+)/);
      const refNum = refMatch ? refMatch[1] : "";
      
      // Extract title
      const titleMatch = row.match(/<a[^>]*>([^<]+)<\/a>/);
      const title = titleMatch ? titleMatch[1].trim() : "";
      
      // Extract cells
      const cells: string[] = [];
      const cellPattern = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      while ((cellMatch = cellPattern.exec(row)) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]+>/g, "").trim());
      }
      
      if (title && refNum) {
        results.push({
          id: refNum,
          title,
          entity: cells[2] || "—",
          category: cells[3] || "Goods",
          amount: cells[4] || "—",
          deadline: cells[5] || "—",
          published: cells[6] || "—",
          url: `https://www.philgeps.gov.ph/GEPSNONPILOT/Tender/SplashOpportunitiesDetailUI.aspx?refID=${refNum}`,
          status: "Open",
        });
      }
    }
  } catch {}

  const start = (page - 1) * pageSize;
  return {
    results: results.slice(start, start + pageSize),
    total: results.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(results.length / pageSize)),
  };
}

function getMockResults(keyword: string, page: number, pageSize: number) {
  const mock = [
    { id:"8901234", title:`Supply and Delivery of ${keyword} for Substation Lighting`, entity:"National Grid Corporation of the Philippines", category:"Goods", amount:"₱2,450,000", deadline:"Apr 30, 2026", published:"Apr 3, 2026", url:"https://www.philgeps.gov.ph", status:"Open" },
    { id:"8901235", title:`Procurement of Industrial ${keyword} Fixtures`, entity:"Energy Development Corporation", category:"Goods", amount:"₱1,800,000", deadline:"May 5, 2026", published:"Apr 4, 2026", url:"https://www.philgeps.gov.ph", status:"Open" },
    { id:"8901236", title:`${keyword} Installation for Power Plant Facility`, entity:"First Gen Corporation", category:"Services", amount:"₱890,000", deadline:"Apr 28, 2026", published:"Apr 2, 2026", url:"https://www.philgeps.gov.ph", status:"Open" },
    { id:"8901237", title:`Supply of LED Luminaires and ${keyword} Components`, entity:"National Power Corporation", category:"Goods", amount:"₱3,200,000", deadline:"May 10, 2026", published:"Apr 4, 2026", url:"https://www.philgeps.gov.ph", status:"Open" },
    { id:"8901238", title:`Warehouse ${keyword} Upgrade Project`, entity:"Aboitiz Power Corporation", category:"Goods", amount:"₱650,000", deadline:"May 2, 2026", published:"Apr 1, 2026", url:"https://www.philgeps.gov.ph", status:"Open" },
    { id:"8901239", title:`Geothermal Plant Area ${keyword} Replacement`, entity:"Maibarara Geothermal Inc.", category:"Goods", amount:"₱1,100,000", deadline:"Apr 25, 2026", published:"Mar 30, 2026", url:"https://www.philgeps.gov.ph", status:"Open" },
    { id:"8901240", title:`Supply and Delivery of Industrial ${keyword}`, entity:"PGPC Philippines", category:"Goods", amount:"₱780,000", deadline:"May 15, 2026", published:"Apr 5, 2026", url:"https://www.philgeps.gov.ph", status:"Open" },
    { id:"8901241", title:`${keyword} for Municipal Government Facilities`, entity:"City Government of Batangas", category:"Goods", amount:"₱420,000", deadline:"Apr 22, 2026", published:"Mar 28, 2026", url:"https://www.philgeps.gov.ph", status:"Open" },
  ];

  const start = (page - 1) * pageSize;
  return {
    results: mock.slice(start, start + pageSize),
    total: mock.length,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(mock.length / pageSize)),
  };
}
