import { accountsEnabled, currentUser } from "@/lib/session";
import { exportData } from "@/lib/account";

export const dynamic = "force-dynamic";

// "Download my data": everything stored about the signed-in account, as a JSON file.
export async function GET() {
  if (!accountsEnabled()) return Response.json({ error: { message: "Accounts are not enabled." } }, { status: 404 });
  const user = await currentUser();
  if (!user) return Response.json({ error: { message: "Sign in first." } }, { status: 401 });
  const data = await exportData(user);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="mlbb-draft-coach-data.json"`,
      "Cache-Control": "no-store"
    }
  });
}
