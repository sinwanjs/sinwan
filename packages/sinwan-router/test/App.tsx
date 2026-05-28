import { RouterProvider } from "../src";
import { routes } from "./routes";

export default function App() {
  return <RouterProvider routes={routes} />;
}