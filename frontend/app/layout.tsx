import type { Metadata } from "next";
import { Instrument_Sans, Instrument_Serif, Playfair_Display } from "next/font/google";
import "./globals.css";
import { SiteHeader } from "./components/SiteHeader";

// Fabric's type system: Instrument Sans (body) + Instrument Serif (display)
const instrumentSans = Instrument_Sans({
  variable: "--font-instrument-sans",
  subsets: ["latin"],
});
const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  subsets: ["latin"],
  weight: "400",
});
// Bold high-contrast serif for the hero headline (roman + italic)
const playfair = Playfair_Display({
  variable: "--font-playfair",
  subsets: ["latin"],
  weight: ["700", "800"],
  style: ["normal", "italic"],
});

export const metadata: Metadata = {
  title: "fabric · JobMatch",
  description: "Upload your resume. Get matched to roles and tailor your CV in one click.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      className={`${instrumentSans.variable} ${instrumentSerif.variable} ${playfair.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <SiteHeader />
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
