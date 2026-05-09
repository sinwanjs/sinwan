/**
 * SinwanJS View Module — Component Factories
 *
 * createComponent and createPage factories for defining
 * typed components and pages with full TypeScript inference.
 */

import type {
  SinwanComponent,
  SinwanPage,
  SinwanNode,
  SinwanSlots,
} from "../types.ts";

/**
 * Create a typed Sinwan component.
 *
 * Mirrors React.FC<P> exactly - single props object with children injected.
 * Children can be a single SinwanNode or a SinwanSlots object for named slots.
 *
 * @example
 * interface CardProps {
 *   title: string;
 * }
 * const Card = createComponent<CardProps>(({ title, children }) => (
 *   <div class="card">
 *     <h2>{title}</h2>
 *     <div class="content">{children}</div>
 *   </div>
 * ));
 */
export function createComponent<P extends object = {}>(
  fn: (
    props: P & { children?: SinwanNode | SinwanSlots },
  ) => ReturnType<SinwanComponent<P>>,
): SinwanComponent<P> {
  const component: SinwanComponent<P> = (props) => fn(props);
  component._SinwanComponent = true;
  component._displayName = fn.name || "AnonymousComponent";
  return component;
}

/**
 * Create a typed Sinwan page.
 *
 * Pages receive a plain data object and return a renderable element tree.
 * Pages are registered with the app and rendered via `c.render("name", data)`.
 *
 * @example
 * interface HomeData {
 *   title: string;
 *   posts: { id: number; title: string }[];
 * }
 * const HomePage = createPage<HomeData>(({ title, posts }) => (
 *   <Layout title={title}>
 *     <h1>{title}</h1>
 *     <ul>{posts.map(p => <li key={p.id}>{p.title}</li>)}</ul>
 *   </Layout>
 * ));
 *
 * app.setRenderer("home", HomePage);
 * app.get("/", (c) => c.render("home", { title: "Home", posts: [] }));
 */
export function createPage<D extends object = {}>(
  fn: (data: D) => ReturnType<SinwanPage<D>>,
): SinwanPage<D> {
  const page: SinwanPage<D> = (data) => fn(data);
  page._SinwanPage = true;
  page._displayName = fn.name || "AnonymousPage";
  return page;
}

/**
 * Create a layout component.
 *
 * Layouts are just components that accept children. They typically render
 * the HTML document structure, head metadata, and shared UI elements.
 *
 * @example
 * interface LayoutProps {
 *   title?: string;
 *   lang?: string;
 * }
 * const Layout = createLayout<LayoutProps>(({ title = "App", lang = "en", children }) => (
 *   <html lang={lang}>
 *     <head><title>{title}</title></head>
 *     <body>{children}</body>
 *   </html>
 * ));
 */
export function createLayout<P extends object = {}>(
  fn: (
    props: P & { children: SinwanNode },
  ) => ReturnType<SinwanComponent<P & { children: SinwanNode }>>,
): SinwanComponent<P & { children: SinwanNode }> {
  return createComponent(fn as any);
}
