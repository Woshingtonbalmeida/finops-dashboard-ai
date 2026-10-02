import { BlobServiceClient } from "@azure/storage-blob";
import { DefaultAzureCredential } from "@azure/identity";

let client: BlobServiceClient | undefined;

export function getBlobServiceClient(): BlobServiceClient {
  if (!client) {
    const accountName = process.env.DATA_STORAGE_ACCOUNT_NAME;
    if (!accountName) {
      throw new Error("DATA_STORAGE_ACCOUNT_NAME app setting is not configured");
    }
    client = new BlobServiceClient(
      `https://${accountName}.blob.core.windows.net`,
      new DefaultAzureCredential()
    );
  }
  return client;
}

export async function readJsonBlob<T>(container: string, blobName: string): Promise<T | undefined> {
  const containerClient = getBlobServiceClient().getContainerClient(container);
  const blobClient = containerClient.getBlobClient(blobName);
  if (!(await blobClient.exists())) {
    return undefined;
  }
  const download = await blobClient.download();
  const text = await streamToString(download.readableStreamBody);
  return JSON.parse(text) as T;
}

// Cheaper than readJsonBlob when only the write timestamp is needed — reads blob
// properties instead of downloading the body (some curated blobs are several MB).
export async function getBlobLastModified(container: string, blobName: string): Promise<Date | undefined> {
  const containerClient = getBlobServiceClient().getContainerClient(container);
  const blobClient = containerClient.getBlobClient(blobName);
  if (!(await blobClient.exists())) {
    return undefined;
  }
  const props = await blobClient.getProperties();
  return props.lastModified;
}

export async function writeJsonBlob(container: string, blobName: string, data: unknown): Promise<void> {
  const containerClient = getBlobServiceClient().getContainerClient(container);
  await containerClient.createIfNotExists();
  const blockBlobClient = containerClient.getBlockBlobClient(blobName);
  const body = JSON.stringify(data, null, 2);
  await blockBlobClient.upload(body, Buffer.byteLength(body), {
    blobHTTPHeaders: { blobContentType: "application/json" },
  });
}

// Cost Management exports write each run to a new
// exports/{exportName}/{dateRange}/{runTimestamp}/{runGuid}/*.csv folder instead of
// overwriting the previous one, so multiple runs for the same billing period pile up
// over time. Summing every CSV in the container double/triple-counts cost as new runs
// land, so for each (exportName, dateRange) group we keep exactly one run — the most
// recent. Two runs can share the same runTimestamp (minute resolution) when the export
// is triggered twice at once, so runTimestamp alone isn't enough: ties are broken by the
// latest blob write time, then by runGuid, so a single run always wins.
export interface CsvBlobRef {
  name: string;
  lastModified?: Date;
}

export function pickLatestRunBlobs(blobs: CsvBlobRef[]): string[] {
  interface Run {
    runTimestamp: string;
    runGuid: string;
    lastModified: number;
  }
  const latestRunPerGroup = new Map<string, Run>();
  const parsed = blobs.map((blob) => {
    const parts = blob.name.split("/");
    if (parts.length < 6 || parts[0] !== "exports") return { blob, group: undefined, runKey: undefined };
    const [, exportName, dateRange, runTimestamp, runGuid] = parts;
    return { blob, group: `${exportName}/${dateRange}`, runKey: { runTimestamp, runGuid } };
  });

  // Per (group, runTimestamp, runGuid), the newest write time among its part files.
  const runLastModified = new Map<string, number>();
  for (const { blob, group, runKey } of parsed) {
    if (!group || !runKey) continue;
    const key = `${group}/${runKey.runTimestamp}/${runKey.runGuid}`;
    const time = blob.lastModified?.getTime() ?? 0;
    runLastModified.set(key, Math.max(runLastModified.get(key) ?? 0, time));
  }

  for (const { group, runKey } of parsed) {
    if (!group || !runKey) continue;
    const candidate: Run = {
      ...runKey,
      lastModified: runLastModified.get(`${group}/${runKey.runTimestamp}/${runKey.runGuid}`) ?? 0,
    };
    const current = latestRunPerGroup.get(group);
    if (
      !current ||
      candidate.runTimestamp > current.runTimestamp ||
      (candidate.runTimestamp === current.runTimestamp &&
        (candidate.lastModified > current.lastModified ||
          (candidate.lastModified === current.lastModified && candidate.runGuid > current.runGuid)))
    ) {
      latestRunPerGroup.set(group, candidate);
    }
  }

  return parsed
    .filter(({ group, runKey }) => {
      if (!group || !runKey) return true; // unrecognized layout, don't drop it
      const winner = latestRunPerGroup.get(group);
      return winner?.runTimestamp === runKey.runTimestamp && winner.runGuid === runKey.runGuid;
    })
    .map(({ blob }) => blob.name);
}

export async function listCsvBlobs(container: string): Promise<string[]> {
  const containerClient = getBlobServiceClient().getContainerClient(container);
  const allBlobs: CsvBlobRef[] = [];
  for await (const blob of containerClient.listBlobsFlat()) {
    if (blob.name.toLowerCase().endsWith(".csv")) {
      allBlobs.push({ name: blob.name, lastModified: blob.properties.lastModified });
    }
  }
  return pickLatestRunBlobs(allBlobs);
}

export async function readTextBlob(container: string, blobName: string): Promise<string> {
  const containerClient = getBlobServiceClient().getContainerClient(container);
  const blobClient = containerClient.getBlobClient(blobName);
  const download = await blobClient.download();
  return streamToString(download.readableStreamBody);
}

async function streamToString(readableStream?: NodeJS.ReadableStream): Promise<string> {
  if (!readableStream) return "";
  const chunks: Buffer[] = [];
  for await (const chunk of readableStream) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf-8");
}
