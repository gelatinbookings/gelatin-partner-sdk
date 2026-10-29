import { createGenresGet, defaultDeps } from "../../../lib/handlers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = createGenresGet(defaultDeps);
