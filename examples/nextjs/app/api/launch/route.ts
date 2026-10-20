import { createLaunchPost, defaultDeps } from "../../../lib/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createLaunchPost(defaultDeps);
