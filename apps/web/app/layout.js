import "./globals.css";

export const metadata = {
  title: "RoboSite Studio",
  description: "Generate and deploy client sites with OpenAI."
};

export default function RootLayout({ children }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
