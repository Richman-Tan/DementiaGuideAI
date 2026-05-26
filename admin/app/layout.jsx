export const metadata = { title: 'DementiaGuide AI — Admin' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        padding: 0,
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: '#f3f4f6',
        minHeight: '100vh',
      }}>
        {children}
      </body>
    </html>
  );
}
