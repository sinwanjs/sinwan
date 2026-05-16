import { cc, onMounted, onUnmounted } from "sinwan/component";
import { computed } from "sinwan/reactivity";
import { signal } from "sinwan/reactivity";

export const Clock = cc(() => {
  const now = signal(new Date());
  const formatted = computed(() =>
    now.value.toLocaleTimeString(undefined, { hour12: false }),
  );
  const ticks = signal(0);

  onMounted(() => {
    const id = setInterval(() => {
      now.value = new Date();
      ticks.value += 1;
    }, 1000);
    onUnmounted(() => clearInterval(id));
  });

  return (
    <div class="row">
      <div class="metric">{formatted}</div>
      <span class="badge">tick #{ticks}</span>
    </div>
  );
});
