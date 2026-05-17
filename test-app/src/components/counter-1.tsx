import { Show } from "sinwan/component";
import { Virtual } from "sinwan/component";
import { onUpdated } from "sinwan/component";
import { For } from "sinwan/component";
import { cc } from "sinwan/component";
import { Getter } from "sinwan/react-client";
import { useState } from "sinwan/react-client";
import { useEffect } from "sinwan/react-client";
import { signal } from "sinwan/reactivity";

export type Country = {
  name: string;
  code: string;
  capital: string;
  population: number;
  region: string;
  currency: string;
};

export type CountriesResponse = {
  countries: Country[];
};

const Test = cc<{ count: Getter }>(({ count }) => {
  return (
    <div>
      <h1>test app {count}</h1>
      <p>
        Lorem ipsum dolor sit amet, consectetur adipisicing elit. Temporibus,
        incidunt.
      </p>
    </div>
  );
});

export const Counter = cc(async () => {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<number[]>([]);
  const test = signal(1);

  useEffect(() => {
    console.log("count from useEffect", count());
  }, [count]);

  onUpdated(() => {
    console.log("onUpdated", count());
  });

  const response = await fetch("http://localhost:3002/countries", {
    method: "GET",
  });

  const countries: CountriesResponse = await response.json();

  console.log(countries);

  const handleClick = () => {
    console.log("count", count());
    console.log("items", items());
    setItems([...items(), items().length]);
    setCount(count() + 1);
    test.value++;
  };

  const handleReset = () => {
    setCount(0);
    setItems([]);
  };

  return (
    <div class="counter">
      <Test count={count} />
      <p>You clicked the button {count} times.</p>
      <button onClick={handleClick}>Increment</button>
      <button onClick={handleReset}>Reset</button>
      <Show when={countries}>
        <CountryList countries={countries.countries} />
      </Show>
      <Virtual
        containerHeight={56}
        itemHeight={15}
        each={items}
        key={(item) => item}
        overscan={1}
        minRendered={1}
      >
        {(item) => (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "6px 12px",
              borderBottom: "1px solid var(--border)",
              background: "var(--card)",
              fontFamily: "Inter, system-ui, sans-serif",
              fontSize: "14px",
              color: "var(--fg)",
            }}
          >
            Item #{item}
          </div>
        )}
      </Virtual>
    </div>
  );
});

const CountryList = cc<{
  countries: Country[];
}>(({ countries }) => {
  return (
    <For each={countries} key={(country) => country.name}>
      {(country) => <div>{country.name}</div>}
    </For>
  );
});
