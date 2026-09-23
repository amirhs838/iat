import { IatApp } from "@/components/iat/IatApp";
import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <main className="flex-1">
        <IatApp />
      </main>
      <footer className="mt-auto border-t py-3 px-4 text-center text-xs text-muted-foreground">
        <span>
          پلتفرم پژوهشی آزمون تداعی ضمنی — امتیازدهی بر پایه Greenwald, Nosek &amp; Banaji (2003)
        </span>
        <span className="mx-2">·</span>
        <Link href="/admin" className="hover:text-foreground underline-offset-2 hover:underline">
          ورود پژوهشگر
        </Link>
      </footer>
    </div>
  );
}
