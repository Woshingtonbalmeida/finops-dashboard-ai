import { subscriptionIds } from "../config/client";
import { app, InvocationContext, Timer } from "@azure/functions";
import { writeJsonBlob } from "../lib/storage";
import { fetchSqlSecurity } from "../lib/sqlSecurity";



export async function refreshSqlSecurityNow(onWarn?: (message: string) => void): Promise<ReturnType<typeof fetchSqlSecurity>> {
  try {
    const report = await fetchSqlSecurity(subscriptionIds());
    await writeJsonBlob("curated", "sql-security.json", report);
    return report;
  } catch (err) {
    onWarn?.(`Falha ao buscar postura de segurança SQL: ${(err as Error).message}`);
    throw err;
  }
}

app.timer("refreshSqlSecurity", {
  schedule: "0 5 7 * * *", // daily 07:05 UTC
  handler: async (_timer: Timer, context: InvocationContext) => {
    try {
      const report = await refreshSqlSecurityNow((message) => context.warn(message));
      context.log(`SQL security atualizado: ${report.servers.length} server(s), ${report.databases.length} database(s)`);
    } catch {
      // Already warned inside refreshSqlSecurityNow — keeping yesterday's data over
      // overwriting it with nothing, same reasoning as refreshSecurity.ts.
    }
  },
});
