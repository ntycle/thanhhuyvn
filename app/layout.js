import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "App Săn Deal & Hoàn Tiền Shopee",
  description: "App săn deal ngon và mua sắm hoàn tiền shopee dành cho mọi người",
  openGraph: {
    title: "App Săn Deal & Hoàn Tiền Shopee",
    description: "App săn deal ngon và mua sắm hoàn tiền shopee dành cho mọi người",
    type: "website",
  }
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
