/** App-relative routes (Next.js adds the configured basePath). */
export const HUB_PATH = "/";
export const HIGANNA_PATH = "/higanna";
export const KALU_RAJINA_PATH = "/kalu-rajina";

function isUnder(appPath: string, root: string): boolean {
  return appPath === root || appPath.startsWith(`${root}/`);
}

export function higannaRoomPath(code: string): string {
  return `${HIGANNA_PATH}/room/${code}`;
}

export function isHigannaPath(appPath: string): boolean {
  return isUnder(appPath, HIGANNA_PATH);
}

export function krRoomPath(code: string): string {
  return `${KALU_RAJINA_PATH}/room/${code}`;
}

export function isKaluRajinaPath(appPath: string): boolean {
  return isUnder(appPath, KALU_RAJINA_PATH);
}
