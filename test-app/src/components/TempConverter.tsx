import { signal, computed, createComponent } from "sinwan";

export const TempConverter = createComponent(() => {
  const celsius = signal(20);
  const fahrenheit = computed(() => (celsius.value * 9) / 5 + 32);
  const kelvin = computed(() => celsius.value + 273.15);

  return (
    <>
      <div class="row">
        <label style={{ minWidth: "80px" }}>Celsius</label>
        <input
          type="number"
          value={celsius}
          onInput={(e) => {
            const v = Number((e.currentTarget as HTMLInputElement).value);
            if (!Number.isNaN(v)) celsius.value = v;
          }}
        />
      </div>
      <div class="row">
        <span class="badge">°F</span>
        <strong>{fahrenheit}</strong>
        <span class="badge">K</span>
        <strong>{kelvin}</strong>
      </div>
    </>
  );
});
