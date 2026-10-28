import { env } from "cloudflare:workers";
import { handleApi, type ApiEnv } from "../../../../lib/api";
export const dynamic = "force-dynamic";
export const GET = (request: Request) =>
  handleApi(request, env as unknown as ApiEnv);
export const POST = GET;
