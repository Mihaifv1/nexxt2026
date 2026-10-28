import { AsyncLocalStorage } from "node:async_hooks";
const contexts = new AsyncLocalStorage<{
  waitUntil(task: Promise<unknown>): void;
}>();
export const withRequestTasks = <T>(
  context: { waitUntil(task: Promise<unknown>): void },
  run: () => T,
) => contexts.run(context, run);
export async function dispatchTask(task: () => Promise<unknown>) {
  const context = contexts.getStore();
  if (context)
    context.waitUntil(
      task().catch((error) =>
        console.error(
          "B2C investigation job",
          error instanceof Error ? error.message : "failed",
        ),
      ),
    );
  else await task();
}
