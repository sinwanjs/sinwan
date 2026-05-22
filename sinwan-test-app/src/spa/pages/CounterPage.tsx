import { cc } from "sinwan/component";
import { Link } from "../Router.tsx";
import { Counter } from "../Counter.tsx";

const CounterPage = cc(() => {
  return (
    <div style="padding: 20px;">
      <h1>Counter Page</h1>
      <p>This page has interactive counters - fully hydrated.</p>

      <nav style="margin: 20px 0; display: flex; gap: 20px;">
        <Link href="/">
          <span style="color: blue; text-decoration: underline; cursor: pointer;">
            Home
          </span>
        </Link>
        <Link href="/about">
          <span style="color: blue; text-decoration: underline; cursor: pointer;">
            About
          </span>
        </Link>
        <Link href="/counter">
          <span style="color: blue; text-decoration: underline; cursor: pointer;">
            Counter chercher la localisation
          </span>
        </Link>
      </nav>

      <Counter initial={5} />
      <Counter initial={100} />
    </div>
  );
});

export default CounterPage;
