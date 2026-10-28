import type { ExecutionContext, ScheduledController } from "@cloudflare/workers-types";
import { app } from "./api";
import type { Env } from "./env";
import { handleScheduled } from "./scheduled";

// Only the default export lives here: workerd treats every named export of the entry module as an entrypoint.
export default {
  fetch(request: Request, env: Env, ctx: ExecutionContext) {
    return app.fetch(request, env, ctx);
  },
  async scheduled(controller: ScheduledController, env: Env, _ctx: ExecutionContext) {
    await handleScheduled(controller.cron, controller.scheduledTime, env);
  },
};
