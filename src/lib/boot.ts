import { tick } from "@/lib/control";

export function bootControlPlane() {
  const state = globalThis as { __myspaceBoot?: boolean };
  if (state.__myspaceBoot) return;
  state.__myspaceBoot = true;

  const run = () => {
    void tick().catch((error) => console.error("[scheduler]", error));
  };
  const timer = setInterval(run, 4000);
  timer.unref?.();
  run();
}
