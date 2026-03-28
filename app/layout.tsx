import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'
import { Navbar } from '@/components/Navbar'
import { Toaster } from 'react-hot-toast'

// Geist variable fonts (shipped with create-next-app scaffold)
const geist = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist',
  weight: '100 900',
  display: 'swap',
})

const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Niural — Careers',
  description: 'Join the Niural team. Explore open roles and apply today.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      {/* Dark mode: applied before hydration to prevent FOUC */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('niural-theme');if(t==='dark'||(!t&&window.matchMedia('(prefers-color-scheme:dark)').matches)){document.documentElement.classList.add('dark')}}catch(e){}})()`,
          }}
        />
      </head>
      <body
        className={`${geist.variable} ${geistMono.variable} font-sans bg-background text-foreground antialiased`}
      >
        <Navbar />
        <main className="min-h-[calc(100vh-3.5rem)]">{children}</main>
        <Toaster
          position="top-right"
          toastOptions={{
            className: 'dark:!bg-[#1e1e32] dark:!text-slate-100 dark:!border-[#2e2e45]',
            style: { fontSize: '13px', fontFamily: 'var(--font-geist), sans-serif' },
            success: { iconTheme: { primary: '#4f46e5', secondary: '#fff' } },
          }}
        />
      </body>
    </html>
  )
}
