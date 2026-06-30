import { Link } from "../Router";

const NavBar = () => {
  return (
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
      <Link href="/country">
        <span style="color: blue; text-decoration: underline; cursor: pointer;">
          Country
        </span>
      </Link>
      <Link href="/switch">
        <span style="color: blue; text-decoration: underline; cursor: pointer;">
          Switch
        </span>
      </Link>
      <Link href="/mutable">
        <span style="color: blue; text-decoration: underline; cursor: pointer;">
          Mutable
        </span>
      </Link>
      <Link href="/react">
        <span style="color: blue; text-decoration: underline; cursor: pointer;">
          React
        </span>
      </Link>
    </nav>
  );
};

export default NavBar;
