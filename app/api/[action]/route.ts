import { handle } from "@/apps/api/handler";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ action: string }> };
export async function GET(request: Request, { params }: Context) {
  return handle(request, (await params).action);
}
export async function POST(request: Request, { params }: Context) {
  return handle(request, (await params).action);
}
