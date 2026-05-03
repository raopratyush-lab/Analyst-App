import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Analyst Q&A Prediction Agent",
  description: "Predicts what sell-side analysts will ask — before they ask it.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-gray-50">
        <nav className="bg-white border-b border-gray-200 px-4 py-3">
          <div className="max-w-3xl mx-auto flex items-center gap-6">
            <Link href="/" className="text-sm font-semibold text-gray-900 hover:text-blue-600">
              Analyst Agent
            </Link>
            <Link href="/upload" className="text-sm text-gray-500 hover:text-gray-900">
              Upload
            </Link>
            <Link href="/api-test" className="text-sm text-gray-500 hover:text-gray-900">
              API Test
            </Link>
          </div>
        </nav>
        <main className="flex-1">{children}</main>
      </body>
    </html>
  );
}
