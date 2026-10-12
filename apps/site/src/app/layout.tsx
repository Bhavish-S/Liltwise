import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Liltwise — Your AI Co-Presenter',
  description:
    'Prepare for the moment, stay present while you speak, and find your words again with Liltwise.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
