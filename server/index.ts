import { type BunRequest } from "bun";

const countries = [
  {
    name: "Morocco",
    code: "MA",
    capital: "Rabat",
    population: 37000000,
    region: "Africa",
    currency: "MAD",
  },
  {
    name: "France",
    code: "FR",
    capital: "Paris",
    population: 68000000,
    region: "Europe",
    currency: "EUR",
  },
  {
    name: "United States",
    code: "US",
    capital: "Washington, D.C.",
    population: 335000000,
    region: "North America",
    currency: "USD",
  },
  {
    name: "Japan",
    code: "JP",
    capital: "Tokyo",
    population: 124000000,
    region: "Asia",
    currency: "JPY",
  },
  {
    name: "Brazil",
    code: "BR",
    capital: "Brasília",
    population: 216000000,
    region: "South America",
    currency: "BRL",
  },
];

function withCors(res: Response): Response {
  res.headers.set("Access-Control-Allow-Origin", "*");
  res.headers.set("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.headers.set("Access-Control-Allow-Headers", "Content-Type");
  return res;
}

Bun.serve({
  port: 3002,
  fetch(req: Request) {
    const url = new URL(req.url);
    if (req.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }
    if (url.pathname === "/countries") {
      return withCors(Response.json({ countries }));
    }
    return withCors(Response.json({ message: "not found" }, { status: 404 }));
  },
});

console.log(`live in http://localhost:${3002}`);
