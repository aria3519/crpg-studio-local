import { NextResponse } from 'next/server';
import { readFile, stat } from 'node:fs/promises';

// Built-in images get replaced in place, so browsers revalidate every time (cheap 304s) instead of caching for a day.
export async function serveAsset(request: Request, file: string, contentType: string, missing = 'Not found') {
  try {
    const info = await stat(file);
    const etag = `"${info.size.toString(36)}-${Math.floor(info.mtimeMs).toString(36)}"`;
    const headers = { 'Content-Type': contentType, 'Cache-Control': 'no-cache', ETag: etag };
    if (request.headers.get('if-none-match') === etag) return new NextResponse(null, { status: 304, headers });
    return new NextResponse(new Uint8Array(await readFile(file)), { headers });
  } catch {
    return new NextResponse(missing, { status: 404 });
  }
}
