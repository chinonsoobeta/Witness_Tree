import "../site-fonts.css";
import "../globals.css";

export default function GatewayLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
