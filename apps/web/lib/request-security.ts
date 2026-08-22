export function requestClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin) return false;

  const direct = new URL(request.url).origin;
  const forwardedHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const forwardedProto = request.headers.get("x-forwarded-proto") || new URL(request.url).protocol.replace(":", "");
  const publicOrigin = forwardedHost ? `${forwardedProto}://${forwardedHost}` : direct;
  return origin === direct || origin === publicOrigin;
}

export function requestBodyIsTooLarge(request: Request, maxBytes = 32_768): boolean {
  const length = Number(request.headers.get("content-length"));
  return Number.isFinite(length) && length > maxBytes;
}
