import { currentMonthRows } from "./resourceCost";

export interface TagCost {
  tagKey: string;
  tagValue: string;
  cost: number;
}

export interface TaggedResourceCost {
  resourceId: string;
  resourceName: string;
  resourceGroup: string;
  subscriptionId: string;
  subscriptionName: string;
  service: string;
  tagKey: string;
  tagValue: string;
  cost: number;
}

export interface TagsByMonthReport {
  yearMonth: string;
  currency: string;
  byTag: TagCost[];
  taggedResources: TaggedResourceCost[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Same accounting as byTag/taggedResources in focus.ts's aggregateFocusRows — this just
// runs it against a single past month's raw rows on demand instead of the current month's
// pre-aggregated snapshot, since "Custos por tags" only ever needed the current month until
// now and there's no persisted history for this dimension.
export async function fetchTagsByMonth(yearMonth: string): Promise<TagsByMonthReport> {
  const [year, month] = yearMonth.split("-").map(Number);
  const anchor = new Date(Date.UTC(year, month - 1, 15));
  const { rows, currency } = await currentMonthRows(anchor);

  const byTag = new Map<string, TagCost>();
  const taggedResources = new Map<string, TaggedResourceCost>();

  for (const row of rows) {
    for (const [tagKey, tagValue] of Object.entries(row.tags)) {
      const tagMapKey = `${tagKey}::${tagValue}`;
      const tag = byTag.get(tagMapKey) ?? { tagKey, tagValue, cost: 0 };
      tag.cost += row.effectiveCost;
      byTag.set(tagMapKey, tag);

      const resTagKey = `${row.resourceId.toLowerCase()}::${tagKey}::${tagValue}`;
      const resTag = taggedResources.get(resTagKey) ?? {
        resourceId: row.resourceId,
        resourceName: row.resourceName,
        resourceGroup: row.resourceGroup,
        subscriptionId: row.subscriptionId,
        subscriptionName: row.subscriptionName,
        service: row.serviceName,
        tagKey,
        tagValue,
        cost: 0,
      };
      resTag.cost += row.effectiveCost;
      taggedResources.set(resTagKey, resTag);
    }
  }

  return {
    yearMonth,
    currency,
    byTag: [...byTag.values()].map((t) => ({ ...t, cost: round2(t.cost) })).sort((a, b) => b.cost - a.cost),
    taggedResources: [...taggedResources.values()].map((v) => ({ ...v, cost: round2(v.cost) })).sort((a, b) => b.cost - a.cost),
  };
}
