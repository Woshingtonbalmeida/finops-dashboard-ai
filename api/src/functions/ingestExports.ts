import { app, InvocationContext } from "@azure/functions";
import { rebuildCurated } from "../lib/rebuildCurated";
import { monitoredSubscriptions, rawContainerName } from "../config/client";

// One blob trigger per monitored subscription, registered from configuration instead of
// one hand-written file per client subscription. Adding a subscription to
// MONITORED_SUBSCRIPTIONS is all it takes for its exports to be ingested.
//
// Every trigger runs the same full rebuild: the curated summary is computed from all raw
// containers together, so it does not matter which one received the new blob.
for (const { slug } of monitoredSubscriptions()) {
  const container = rawContainerName(slug);
  app.storageBlob(`ingest_${slug}`, {
    path: `${container}/{name}`,
    connection: "AzureWebJobsStorage",
    handler: async (_blob: unknown, context: InvocationContext) => {
      context.log(`Novo blob em ${container}: ${context.triggerMetadata?.name}`);
      await rebuildCurated(context);
    },
  });
}
