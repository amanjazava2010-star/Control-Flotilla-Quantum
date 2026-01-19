import "./globals.css";

export const metadata = {
  title: "Control Flotilla - Quantum",
  description: "Control de flotilla",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="antialiased">{children}</body>
    </html>
  );
}
