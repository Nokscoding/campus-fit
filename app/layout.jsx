import "./globals.css";

export const metadata = {
  title: "Campus Fit",
  description: "4 semaines. 4 thèmes. 1 champion.",
  applicationName: "Campus Fit",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Campus Fit" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport = {
  themeColor: "#0b0c0f",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return <html lang="fr"><body>{children}</body></html>;
}
