import { cc, For } from "sinwan/component";
import { signal, effect } from "sinwan/reactivity";
import { Link } from "../Router.tsx";

interface Database {
  name: string;
  sizeOnDisk: number;
}

interface HomeProps {
  databases?: Database[];
  routeData?: any;
}

export async function homeLoader() {
  const res = await fetch("/api/dbs");
  const data = await res.json();
  return { databases: data.databases || [] };
}

const Home = cc<HomeProps>(({ databases: propDatabases, routeData }) => {
  const databases = signal<Database[]>(
    propDatabases ||
      (typeof window !== "undefined" &&
        (window as any).__INITIAL_DATA__?.databases) ||
      [],
  );

  if (routeData) {
    effect(() => {
      const dbs = routeData.value?.databases;
      if (dbs) {
        databases.value = dbs;
      }
    });
  }

  return (
    <div style="padding: 20px;">
      <h1>
        SPA this with Full Hydration sinwan is the best lib in the world testok
        tlsdfhljshfkest ,dfst ok you ar good  frp donc ok from your dist donner la localisation 
      </h1>
      <p>Server-rendered, fully hydrated single page app</p>

      <nav style="margin: 20px 0; display: flex; gap: 20px;">
        <Link href="/">
          <span style="color: blue; text-decoration: underline; cursor: pointer;">
            Home youre 
          </span>
        </Link>
        <Link href="/about">
          <span style="color: blue; text-decoration: underline; cursor: pointer;">
            About
          </span>
        </Link>
        <Link href="/counter">
          <span style="color: blue; text-decoration: underline; cursor: pointer;">
            Counter
          </span>
        </Link>
      </nav>

      <h2>Databases from Server</h2>
      <ul>
        <For each={() => databases.value}>
          {(db) => (
            <li>
              {db.name} - {(db.sizeOnDisk / 1024 / 1024).toFixed(2)} MB
            </li>
          )}
        </For>
      </ul>
    </div>
  );
});

export default Home;
