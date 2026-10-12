import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/sidebar/Sidebar';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Ardyn SDR Agent',
  description: 'AI-powered sales development representative — research, draft, and manage outreach at scale.',
  keywords: ['SDR', 'sales', 'AI', 'outreach', 'cold email', 'lead generation'],
  authors: [{ name: 'Ardyn Intelligence' }],
  openGraph: {
    title: 'Ardyn SDR Agent',
    description: 'AI-powered sales development representative',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} font-sans bg-surface-950 text-surface-100`}>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}