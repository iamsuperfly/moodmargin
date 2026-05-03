import { Link } from "wouter";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-background">
      <div className="text-center">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h1 className="text-3xl font-bold mb-2" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
          404
        </h1>
        <p className="text-muted-foreground mb-6">Page not found</p>
        <Link href="/">
          <Button className="bg-primary hover:bg-primary/90">Go Home</Button>
        </Link>
      </div>
    </div>
  );
}
