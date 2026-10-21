import type { Metadata, Viewport } from "next";
import { Abhaya_Libre, Cinzel, Noto_Serif_Sinhala, Poppins } from "next/font/google";
import { AppBoot } from "@/components/SplashScreen";
import { HUB_NAME } from "@/lib/brand";
import "./globals.css";

const sinhala = Noto_Serif_Sinhala({
  variable: "--font-sinhala",
  subsets: ["sinhala"],
  weight: ["400", "600", "700"],
});

const fmAbhaya = Abhaya_Libre({
  variable: "--font-fm-abhaya",
  subsets: ["sinhala", "latin"],
  weight: ["400", "600", "700", "800"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const cinzel = Cinzel({
  variable: "--font-serif",
  subsets: ["latin"],
  weight: ["500", "700"],
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#12070a",
};

export const metadata: Metadata = {
  title: {
    default: HUB_NAME,
    template: `%s · ${HUB_NAME}`,
  },
  description: "Sellam game hub — one account and one coin wallet for every game",
  appleWebApp: {
    capable: true,
    title: HUB_NAME,
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${poppins.variable} ${sinhala.variable} ${fmAbhaya.variable} ${cinzel.variable} h-full antialiased`} suppressHydrationWarning>
      <body className="min-h-full bg-[#12070a]" suppressHydrationWarning>
        <AppBoot>{children}</AppBoot>
      </body>
    </html>
  );
}
