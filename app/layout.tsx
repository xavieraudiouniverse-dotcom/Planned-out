import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Planned-out',
  description: 'Turn yearly goals into daily action.'
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
