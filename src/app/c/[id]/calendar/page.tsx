import { Soon } from "@/components/soon";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <Soon back={`/c/${id}`} title="Calendar" />;
}
