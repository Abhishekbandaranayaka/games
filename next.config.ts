import { networkInterfaces } from "os";
import type { NextConfig } from "next";

function lanHosts(): string[] {
  const hosts: string[] = [];
  const nets = networkInterfaces();
  for (const entries of Object.values(nets)) {
    if (!entries) continue;
    for (const net of entries) {
      if (net.family === "IPv4" && !net.internal) {
        hosts.push(net.address);
      }
    }
  }
  return hosts;
}

const nextConfig: NextConfig = {
  // Set NEXT_PUBLIC_BASE_PATH=/higanna at build time when the app is served
  // from https://host/higanna instead of the domain root.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || "",
  // Allow HMR / assets when opening the app via LAN IP share links.
  allowedDevOrigins: lanHosts(),
};

export default nextConfig;
