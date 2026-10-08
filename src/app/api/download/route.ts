import type { NextRequest } from "next/server";

import type { Platform } from "@/lib/platforms";
import { download, parseQuality, UserFacingError, validateRequest, type ProgressEvent } from "@/lib/ytdlp";

export const maxDuration = 900;

/**
 * Server-Sent Events stream: downloads the post with yt-dlp, emitting progress events,
 * and finishes with a `done` event carrying a one-time file id for /api/file/[id].
 */
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const item = Number(params.get("item")) || undefined;
  const quality = parseQuality(params.get("quality"));

  let url: string;
  let platform: Platform;
  try {
    ({ url, platform } = validateRequest(params.get("url"), params.get("platform")));
  } catch (err) {
    const message = err instanceof UserFacingError ? err.message : "Invalid request.";
    return sse((emit) => emit({ type: "error", message }));
  }

  return sse((emit) => download(url, platform.id, item, quality, emit, request.signal));
}

function sse(work: (emit: (e: ProgressEvent) => void) => void | Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const emit = (e: ProgressEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
        } catch {
          closed = true; // client went away
        }
      };
      try {
        await work(emit);
      } catch (err) {
        console.error(err);
        emit({ type: "error", message: "Something went wrong while downloading." });
      } finally {
        if (!closed) {
          closed = true;
          controller.close();
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
