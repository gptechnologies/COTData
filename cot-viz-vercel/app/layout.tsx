export const metadata = {
  title: "COT – Non-Commercials",
  description: "Futures positioning visualizer"
};

import "./globals.css";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
