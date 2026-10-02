// Every function the host should register has to be imported here: this file is the
// package's `main`, and the Node v4 model registers only what it pulls in.
//
// tsc does NOT catch a stale entry: a side-effect import naming a module that no longer
// exists compiles clean and fails at runtime with "Worker was unable to load entry
// point" — and the host then loads ZERO functions, not just the missing one. Keep this
// list in step with src/functions/ by hand, and if the deployed app reports 0 functions,
// suspect this file first.
import "./functions/ingestExports";
import "./functions/refreshBudgets";
import "./functions/refreshOptimization";
import "./functions/refreshForecast";
import "./functions/refreshMonthlyHistory";
import "./functions/refreshOrphanedResources";
import "./functions/refreshTagCompliance";
import "./functions/refreshStoppedVMs";
import "./functions/refreshStoppedAks";
import "./functions/refreshSecurity";
import "./functions/refreshSqlSecurity";
import "./functions/refreshResourceSizing";
import "./functions/refreshDeletionCandidates";
import "./functions/refreshDeletionSavings";
import "./functions/refreshAiInsights";
import "./functions/refreshCreatedResources";
import "./functions/refreshInventory";
import "./functions/triggerExportRuns";
import "./functions/api";
