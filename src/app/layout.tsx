import "../styles/globals.css";

export const metadata = {
  title: "YXE / YYC Detailing — Book Online",
  description: "Choose your city, pick an available time, and book instantly.",
  applicationName: "YXE/YYC Detailing",
  manifest: "/manifest.json",
};

export const viewport = {
  themeColor: "#A2D8F9",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-body">{children}</body>
    </html>
  );
}
