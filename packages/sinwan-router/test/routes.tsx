import { createRouter } from "../src";
import Home from "./pages/Home";

export const routes = createRouter([
  {
    path: "/",
    component: <Home />,
  },
]);
