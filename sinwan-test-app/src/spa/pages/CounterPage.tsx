import { cc } from "sinwan/component";
import { Link } from "../Router.tsx";
import { Counter } from "../Counter.tsx";
import NavBar from "./NavBar.tsx";
import {} from "sinwan/react-client";

const CounterPage = cc(() => {
  return (
    <>
      <head>
        <title>Counter Page</title>
      </head>
      <div style="padding: 20px;">
        <h1>Counter Page</h1>
        <p>This page has interactive counters - fully hydrated.</p>

        <NavBar />

        <Counter initial={5} />
        <Counter initial={100} />
      </div>
    </>
  );
});

export default CounterPage;
