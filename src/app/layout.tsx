import type { Metadata } from 'next';
import { Archivo_Black, Manrope, JetBrains_Mono } from 'next/font/google';
import './globals.css';

const display = Archivo_Black({
  variable: '--font-display',
  subsets: ['latin'],
  weight: '400',
});

const body = Manrope({
  variable: '--font-body',
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
});

const mono = JetBrains_Mono({
  variable: '--font-mono',
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

export const metadata: Metadata = {
  title: 'Blocked — From idea to a buildable brick',
  description:
    'Drop an image. Get a 3D Lego-compatible voxel build, instantly. A serious tool for serious play.',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
