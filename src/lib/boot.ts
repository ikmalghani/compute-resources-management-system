import { tick } from "@/lib/control";

export function bootControlPlane() {
  const state = globalThis as { __cremsBoot?: boolean };
  if (state.__cremsBoot) return;
  state.__cremsBoot = true;

  const run = () => {
    void tick().catch((error) => console.error("[scheduler]", error));
  };
  const timer = setInterval(run, 4000);
  timer.unref?.();
  run();
}
