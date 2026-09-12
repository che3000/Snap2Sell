import Editor from "@/apps/web/Editor";
import { requireChatGPTUser } from "./chatgpt-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { testLoginEnabled, sessionOwner } from "@/apps/api/test-auth";
export const dynamic = "force-dynamic";
export default async function Home() {
  if (testLoginEnabled()) {
    if (!sessionOwner((await headers()).get("cookie"))) redirect("/login");
  } else await requireChatGPTUser("/");
  return <Editor />;
}
