import { cc, For, Show } from "sinwan/component";
import { useFetch } from "sinwan/hook";
import NavBar from "./NavBar";

interface Country {
  name: string;
  code: string;
  capital: string;
}
interface CountryData {
  countries: Country[];
}

const Country = cc(() => {
  const fetch = useFetch<CountryData>("http://localhost:3002/countries").json();

  return (
    <div style="padding: 20px;">
      <h1>Country</h1>
      <p>This is a simple SPA with full hydration.</p>

      <NavBar />

      <Show when={fetch.data}>
        {(d) => (
          <ul>
            <For each={d.countries}>
              {(country: Country) => (
                <li>
                  {country.name} ({country.code}) — {country.capital}
                </li>
              )}
            </For>
          </ul>
        )}
      </Show>
      <Show when={fetch.isFetching}>we lode data</Show>
      <Show when={fetch.error}>we have an error</Show>
    </div>
  );
});
export default Country;
