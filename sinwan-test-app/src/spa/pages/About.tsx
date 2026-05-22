import { cc } from "sinwan/component";
import { Link } from "../Router.tsx";

const About = cc(() => {
  return (
    <div style="padding: 20px;">
      <h1>About</h1>
      <p>This is a simple SPA with full hydration.</p>

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
            Counter
          </span>
        </Link>
      </nav>

      <p>Server timestamp: {new Date().toISOString()}</p>
    </div>
  );
});

export default About;
