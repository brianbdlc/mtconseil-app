import { AppHeader } from "@/components/app-header";

export default function ValeursDefautLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="max-w-[1120px] mx-auto px-6 py-8">{children}</main>
    </div>
  );
}
