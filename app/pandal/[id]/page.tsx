import PandalDetailClient from "@/components/detail/PandalDetailClient";

export default async function PandalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PandalDetailClient id={id} />;
}
