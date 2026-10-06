import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Bino Rehab v2",
  description: "카메라와 짧은 안내로 측정하는 양안 기능 스크리닝",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
