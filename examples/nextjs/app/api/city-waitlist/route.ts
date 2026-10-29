import { createCityWaitlistPost, defaultDeps } from "../../../lib/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const POST = createCityWaitlistPost(defaultDeps);
