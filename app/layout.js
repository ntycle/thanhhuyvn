import { Be_Vietnam_Pro } from "next/font/google";
import "./globals.css";

const beVietnamPro = Be_Vietnam_Pro({
  weight: ['300', '400', '500', '600', '700'],
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
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
    <html lang="vi" suppressHydrationWarning className={beVietnamPro.className}>
      <body>{children}</body>
    </html>
  );
}
