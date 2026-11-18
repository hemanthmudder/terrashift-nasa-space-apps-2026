import type { Metadata } from "next";
import "./globals.css";
import { Providers } from "@/components/layout/Providers";

export const metadata: Metadata = {
  title: "TerraShift | Smarter Crop Rotations. Healthier Soil. Climate-Ready Farms.",
  description:
    "NASA Space Apps Challenge 2026 — agricultural decision support. Global NASA POWER climate insights; crop rotation recommendations currently calibrated for Karnataka, India.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-earth-50 text-slate-900 antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
