import { Virtual } from "sinwan";
import { Show } from "sinwan";
import { signal, cc, For, onUpdated } from "sinwan";
import { Getter } from "sinwan/react-client";
import { useState } from "sinwan/react-client";
import { useEffect } from "sinwan/react-client";

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
        containerHeight={50}
        each={items}
        itemHeight={16}
        key={(item) => item}
        overscan={3}
        minRendered={3}
      >
        {(item) => <div>{item}</div>}
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
