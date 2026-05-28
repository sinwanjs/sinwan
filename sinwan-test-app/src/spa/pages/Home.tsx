import { cc, For, Show } from "sinwan/component";
import { signal, effect } from "sinwan/reactivity";
import NavBar from "./NavBar";
import { useEffect, useState } from "sinwan/react-client";
import { useFetch } from "sinwan/hook";

interface Database {
  name: string;
  sizeOnDisk: number;
}

interface DatabasesData {
  databases: Database[];
}

const Home = cc(() => {
  const fetch = useFetch<DatabasesData>("/api/dbs").json();

  const databases = signal<Database[]>([]);

  effect(() => {
    if (fetch.data.value?.databases) {
      databases.value = fetch.data.value.databases;
    }
  });

  const [test, setTest] = useState(0);
  const [user, setUser] = useState({ name: "", age: 20 });

  useEffect(() => {
    console.log("test change");
  }, [test]);

  return (
    <div style="padding: 20px;">
      <h1>SPA with Full Hydration</h1>
      <p>Server-rendered, fully hydrated single page app</p>

      <NavBar />

      <h2>Databases from Server</h2>
      <Show when={fetch.isFetching}>
        <p>Loading databases...</p>
      </Show>
      <Show when={fetch.error}>
        <p style="color: #e74c3c;">Error loading databases</p>
      </Show>
      <Show when={fetch.data}>
        <ul>
          <For each={databases}>
            {(db) => (
              <li>
                {db.name} - {(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB
              </li>
            )}
          </For>
        </ul>
      </Show>
      <button onClick={() => setTest((p) => p + 1)}>Click me</button>
      <button onClick={() => setUser({ name: "mohammed", age: 30 })}>
        Set User
      </button>
      <button onClick={() => setUser({ name: "", age: 40 })}>resit User</button>
      <p>{test}</p>
      <pre>{() => JSON.stringify(user())}</pre>
    </div>
  );
});

export default Home;
