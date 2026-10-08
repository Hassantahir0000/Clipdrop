import { createReadStream } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";

import { takeFile } from "@/lib/ytdlp";

const CONTENT_TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".mkv": "video/x-matroska",
  ".webm": "video/webm",
  ".mov": "video/quicktime",
};

/** Streams a finished download to the browser once, then deletes it. */
export async function GET(_request: Request, ctx: RouteContext<"/api/file/[id]">) {
  const { id } = await ctx.params;
  const file = takeFile(id);
  if (!file) return new Response("This download has expired. Please start it again.", { status: 404 });

  const nodeStream = createReadStream(file.file);
  const cleanup = () => void rm(file.dir, { recursive: true, force: true });
  nodeStream.on("close", cleanup);

  const asciiName = file.filename.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "");
  return new Response(Readable.toWeb(nodeStream) as ReadableStream, {
    headers: {
      "Content-Type": CONTENT_TYPES[path.extname(file.filename).toLowerCase()] ?? "application/octet-stream",
      "Content-Length": String(file.size),
      "Content-Disposition": `attachment; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(file.filename)}`,
      "Cache-Control": "no-store",
    },
  });
}
