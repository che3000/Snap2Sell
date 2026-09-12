import { owner, db, bucket } from "@/apps/api/storage";
import { AppError, json } from "@/packages/shared/http";
export const dynamic = "force-dynamic";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = owner(request);
    const { id } = await params;
    const meta = await db()
      .prepare("SELECT mime FROM uploads WHERE owner=? AND id=?")
      .bind(user, id)
      .first<{ mime: string }>();
    if (!meta) return json({ error: "找不到圖片" }, 404);
    const obj = await bucket().get(`${user}/${id}`);
    if (!obj) return json({ error: "找不到圖片" }, 404);
    return new Response(obj.body, {
      headers: {
        "Content-Type": meta.mime,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch (error) {
    return json(
      {
        error: error instanceof AppError ? error.message : "圖片服務暫時不可用",
      },
      error instanceof AppError ? error.status : 503,
    );
  }
}
