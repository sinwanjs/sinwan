import { cc } from "sinwan/component";
import { Link } from "../Router.tsx";
import NavBar from "./NavBar.tsx";

const About = cc(() => {
  return (
    <div style="padding: 20px;">
      <h1>About</h1>
      <p>This is a simple SPA with full hydration.</p>

      <NavBar />

      <p>Server timestamp: {new Date().toISOString()}</p>
    </div>
  );
});

export default About;
