import { Suspense } from "react";
import AddClient from "@/components/add/AddClient";

export default function AddPage() {
  return (
    <Suspense fallback={<div className="min-h-dvh bg-ivory" />}>
      <AddClient />
    </Suspense>
  );
}
