import { NextResponse, type NextRequest } from "next/server";

import { getInfo, UserFacingError, validateRequest } from "@/lib/ytdlp";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { url, platform } = validateRequest(body.url, body.platform);
    const info = await getInfo(url, platform.id, request.signal);
    return NextResponse.json(info);
  } catch (err) {
    const status = err instanceof UserFacingError ? err.status : 500;
    const message = err instanceof UserFacingError ? err.message : "Something went wrong fetching this post.";
    if (!(err instanceof UserFacingError)) console.error(err);
    return NextResponse.json({ error: message }, { status });
  }
}
