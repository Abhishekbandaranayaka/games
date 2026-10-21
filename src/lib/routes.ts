/** App-relative routes (Next.js adds the configured basePath). */
export const HUB_PATH = "/";
export const HIGANNA_PATH = "/higanna";

export function higannaRoomPath(code: string): string {
  return `${HIGANNA_PATH}/room/${code}`;
}

export function isHigannaPath(appPath: string): boolean {
  return appPath === HIGANNA_PATH || appPath.startsWith(`${HIGANNA_PATH}/`);
}
