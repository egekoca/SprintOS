import { FoxLoader } from "@/components/FoxLoader";

export default function Loading() {
  return (
    <section className="shell" style={{ paddingBlock: "4rem" }}>
      <FoxLoader label="Following the trail" />
    </section>
  );
}
