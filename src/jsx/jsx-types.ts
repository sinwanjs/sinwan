/**
 * SinwanJS JSX Type Definitions
 *
 * Uses native DOM element types for props — no React compat (no className,
 * no camelCase event handlers). Enhanced element props (formAction as function,
 * defaultValue, precedence, etc.) are layered on top via intersection types.
 */

import type { Properties as CSSProperties } from "csstype";
import type { SinwanNode, SinwanSlots } from "../types.ts";

// ─── Children Type ──────────────────────────────────────────

export type JSXChildren = SinwanNode | SinwanSlots;

// ─── Native Props Helper ────────────────────────────────────

/**
 * Extract native DOM attributes from element type T, override children/style/class,
 * and add JSX-specific props (ref, key).
 */
/**
 * Extract native DOM attributes from element type T, override children/style/class,
 * and add JSX-specific props (ref, key).
 * @template T - The DOM element type to extract props from
 * @property children - Child elements to render inside this element
 * @property style - Inline styles as a CSSStyleDeclaration object or CSS string
 * @property class - CSS class name(s) for the element
 * @property ref - Callback ref or ref object for accessing the DOM element
 * @property key - Unique identifier for list reconciliation
 * @property data-* - Custom data attributes
 */
type NativeProps<T extends Element> = Partial<
  Omit<T, "children" | "attributes" | "style" | "classList" | "dataset">
> & {
  /** Child elements to render inside this element */
  children?: JSXChildren;
  /** Inline styles as a CSSProperties object or CSS string */
  style?: CSSProperties | string;
  /** CSS class name(s) for the element */
  class?: string;
  /** Callback ref or ref object for accessing the DOM element */
  ref?: ((el: T | null) => void) | { current: T | null } | null;
  /** Unique identifier for list reconciliation */
  key?: string | number;
  /** Custom data attributes */
  [key: `data-${string}`]: string | number | boolean | undefined;
};

// ─── Enhanced Element Props ─────────────────────────────────
//
// These extend NativeProps for tags intercepted by enhanced-elements.ts.
// Each enhanced tag gets the extra props its transformer accepts.

/**
 * Enhanced form element props.
 * @property action - Form action URL or async function handler for form submission
 */
type FormProps = NativeProps<HTMLFormElement> & {
  /** Form action URL or async function handler for form submission */
  action?: string | ((formData: FormData) => void | Promise<void>);
};

/**
 * Enhanced input element props.
 * @property defaultValue - Initial value for uncontrolled inputs
 * @property defaultChecked - Initial checked state for uncontrolled checkboxes/radios
 * @property formAction - Override form action for this submitter
 */
type InputProps = NativeProps<HTMLInputElement> & {
  /** Initial value for uncontrolled inputs */
  defaultValue?: string;
  /** Initial checked state for uncontrolled checkboxes/radios */
  defaultChecked?: boolean;
  /** Override form action for this submitter */
  formAction?: string | ((formData: FormData) => void | Promise<void>);
};

/**
 * Enhanced button element props.
 * @property formAction - Override form action for this submitter
 */
type ButtonProps = NativeProps<HTMLButtonElement> & {
  /** Override form action for this submitter */
  formAction?: string | ((formData: FormData) => void | Promise<void>);
};

/**
 * Enhanced select element props.
 * @property defaultValue - Initial selected value(s) for uncontrolled selects
 */
type SelectProps = NativeProps<HTMLSelectElement> & {
  /** Initial selected value(s) for uncontrolled selects */
  defaultValue?: string | string[];
};

/**
 * Enhanced textarea element props.
 * @property defaultValue - Initial value for uncontrolled textareas
 */
type TextareaProps = NativeProps<HTMLTextAreaElement> & {
  /** Initial value for uncontrolled textareas */
  defaultValue?: string;
};

/**
 * Enhanced option element props.
 * @property selected - Disabled; use parent select's value/defaultValue instead
 */
type OptionProps = NativeProps<HTMLOptionElement> & {
  /** Disabled; use parent select's value/defaultValue instead */
  selected?: never;
};

/**
 * Enhanced progress element props.
 * @property value - Current progress value (null for indeterminate)
 */
type ProgressProps = NativeProps<HTMLProgressElement> & {
  /** Current progress value (null for indeterminate) */
  value?: number | null;
};

/**
 * Enhanced link element props for stylesheet loading.
 * @property precedence - Stylesheet loading priority for head ordering
 * @property disabled - Whether the stylesheet is disabled
 */
type LinkProps = NativeProps<HTMLLinkElement> & {
  /** Stylesheet loading priority for head ordering */
  precedence?: string;
  /** Whether the stylesheet is disabled */
  disabled?: boolean;
};

/**
 * Enhanced style element props for inline stylesheets.
 * @property precedence - Stylesheet loading priority for head ordering
 * @property href - Unique identifier for deduplication
 */
type StyleProps = NativeProps<HTMLStyleElement> & {
  /** Stylesheet loading priority for head ordering */
  precedence?: string;
  /** Unique identifier for deduplication */
  href?: string;
};

/**
 * Enhanced title element props.
 * @property children - Document title text (must be a string)
 */
type TitleProps = NativeProps<HTMLTitleElement> & {
  /** Document title text (must be a string) */
  children?: string;
};

// ─── HTML Intrinsic Elements ────────────────────────────────

export interface SinwanIntrinsicElements {
  // Document structure
  /** HTML document root element */
  html: NativeProps<HTMLHtmlElement>;
  /** Document metadata container */
  head: NativeProps<HTMLHeadElement>;
  /** Document body content container */
  body: NativeProps<HTMLBodyElement>;
  /** Base URL for relative URLs in the document */
  base: NativeProps<HTMLBaseElement>;
  /** External resource link (stylesheets, icons, etc.) */
  link: LinkProps;
  /** Document metadata (charset, viewport, description, etc.) */
  meta: NativeProps<HTMLMetaElement>;
  /** Inline CSS stylesheet */
  style: StyleProps;
  /** Document title shown in browser tab */
  title: TitleProps;

  // Sectioning
  /** Contact information for the author/owner */
  address: NativeProps<HTMLElement>;
  /** Self-contained composition (blog post, news article, etc.) */
  article: NativeProps<HTMLElement>;
  /** Content tangentially related to surrounding content */
  aside: NativeProps<HTMLElement>;
  /** Footer for a section or page */
  footer: NativeProps<HTMLElement>;
  /** Header for a section or page */
  header: NativeProps<HTMLElement>;
  /** Level 1 heading (most important) */
  h1: NativeProps<HTMLHeadingElement>;
  /** Level 2 heading */
  h2: NativeProps<HTMLHeadingElement>;
  /** Level 3 heading */
  h3: NativeProps<HTMLHeadingElement>;
  /** Level 4 heading */
  h4: NativeProps<HTMLHeadingElement>;
  /** Level 5 heading */
  h5: NativeProps<HTMLHeadingElement>;
  /** Level 6 heading (least important) */
  h6: NativeProps<HTMLHeadingElement>;
  /** Main content of the document */
  main: NativeProps<HTMLElement>;
  /** Navigation links section */
  nav: NativeProps<HTMLElement>;
  /** Generic standalone section of a document */
  section: NativeProps<HTMLElement>;
  /** Search functionality container */
  search: NativeProps<HTMLElement>;
  /** Heading group with subheadings */
  hgroup: NativeProps<HTMLElement>;

  // Text content
  /** Extended quotation from another source */
  blockquote: NativeProps<HTMLQuoteElement>;
  /** Description/value in a description list */
  dd: NativeProps<HTMLElement>;
  /** Generic container for flow content */
  div: NativeProps<HTMLDivElement>;
  /** Description list */
  dl: NativeProps<HTMLDListElement>;
  /** Term/name in a description list */
  dt: NativeProps<HTMLElement>;
  /** Caption for a figure element */
  figcaption: NativeProps<HTMLElement>;
  /** Self-contained content with optional caption */
  figure: NativeProps<HTMLElement>;
  /** Horizontal rule (thematic break) */
  hr: NativeProps<HTMLHRElement>;
  /** List item */
  li: NativeProps<HTMLLIElement>;
  /** Ordered list */
  ol: NativeProps<HTMLOListElement>;
  /** Paragraph */
  p: NativeProps<HTMLParagraphElement>;
  /** Preformatted text (preserves whitespace) */
  pre: NativeProps<HTMLPreElement>;
  /** Unordered list */
  ul: NativeProps<HTMLUListElement>;

  // Inline text
  /** Hyperlink to another page or resource */
  a: NativeProps<HTMLAnchorElement>;
  /** Abbreviation or acronym */
  abbr: NativeProps<HTMLElement>;
  /** Bring attention to (bold) */
  b: NativeProps<HTMLElement>;
  /** Bidirectional isolate */
  bdi: NativeProps<HTMLElement>;
  /** Bidirectional override */
  bdo: NativeProps<HTMLElement>;
  /** Line break */
  br: NativeProps<HTMLBRElement>;
  /** Citation or reference to a work */
  cite: NativeProps<HTMLElement>;
  /** Inline code fragment */
  code: NativeProps<HTMLElement>;
  /** Machine-readable equivalent of content */
  data: NativeProps<HTMLDataElement>;
  /** Definition of a term */
  dfn: NativeProps<HTMLElement>;
  /** Emphasized text */
  em: NativeProps<HTMLElement>;
  /** Idiomatic text (italic) */
  i: NativeProps<HTMLElement>;
  /** Keyboard input */
  kbd: NativeProps<HTMLElement>;
  /** Highlighted/marked text */
  mark: NativeProps<HTMLElement>;
  /** Inline quotation */
  q: NativeProps<HTMLQuoteElement>;
  /** Ruby fallback parenthesis */
  rp: NativeProps<HTMLElement>;
  /** Ruby text component */
  rt: NativeProps<HTMLElement>;
  /** Ruby annotation (for East Asian typography) */
  ruby: NativeProps<HTMLElement>;
  /** Strikethrough text (no longer accurate) */
  s: NativeProps<HTMLElement>;
  /** Sample output from a program */
  samp: NativeProps<HTMLElement>;
  /** Side comment (small print) */
  small: NativeProps<HTMLElement>;
  /** Generic inline container */
  span: NativeProps<HTMLSpanElement>;
  /** Strong importance (bold) */
  strong: NativeProps<HTMLElement>;
  /** Subscript text */
  sub: NativeProps<HTMLElement>;
  /** Superscript text */
  sup: NativeProps<HTMLElement>;
  /** Machine-readable date/time */
  time: NativeProps<HTMLTimeElement>;
  /** Unarticulated annotation (underline) */
  u: NativeProps<HTMLElement>;
  /** Variable in a mathematical expression or code */
  var: NativeProps<HTMLElement>;
  /** Word break opportunity */
  wbr: NativeProps<HTMLElement>;

  // Edits
  /** Deleted text (strikethrough) */
  del: NativeProps<HTMLModElement>;
  /** Inserted text (underline) */
  ins: NativeProps<HTMLModElement>;

  // Forms (enhanced)
  /** Form for user input submission */
  form: FormProps;
  /** Input control (text, checkbox, radio, etc.) */
  input: InputProps;
  /** Clickable button */
  button: ButtonProps;
  /** Dropdown selection control */
  select: SelectProps;
  /** Multi-line text input */
  textarea: TextareaProps;
  /** Option in a select or datalist */
  option: OptionProps;
  /** Group of options in a select */
  optgroup: NativeProps<HTMLOptGroupElement>;
  /** Label for a form control */
  label: NativeProps<HTMLLabelElement>;
  /** Group of related form controls */
  fieldset: NativeProps<HTMLFieldSetElement>;
  /** Caption for a fieldset */
  legend: NativeProps<HTMLLegendElement>;
  /** Predefined options for input controls */
  datalist: NativeProps<HTMLDataListElement>;
  /** Result of a calculation */
  output: NativeProps<HTMLOutputElement>;
  /** Progress indicator */
  progress: ProgressProps;
  /** Scalar measurement within a known range */
  meter: NativeProps<HTMLMeterElement>;

  // Interactive
  /** Disclosure widget (expandable/collapsible) */
  details: NativeProps<HTMLDetailsElement>;
  /** Modal or non-modal dialog box */
  dialog: NativeProps<HTMLDialogElement>;
  /** Menu of commands */
  menu: NativeProps<HTMLMenuElement>;
  /** Summary/caption for a details element */
  summary: NativeProps<HTMLElement>;

  // Scripting
  /** 2D drawing surface for graphics */
  canvas: NativeProps<HTMLCanvasElement>;
  /** Nested browsing context (embedded page) */
  iframe: NativeProps<HTMLIFrameElement>;
  /** Fallback for browsers without frame support (deprecated) */
  noframes: NativeProps<HTMLElement>;
  /** Fallback content when JavaScript is disabled */
  noscript: NativeProps<HTMLElement>;
  /** Executable script or data block */
  script: NativeProps<HTMLScriptElement>;
  /** HTML template for cloning */
  template: NativeProps<HTMLTemplateElement>;

  // Tables
  /** Table caption */
  caption: NativeProps<HTMLTableCaptionElement>;
  /** Table column properties */
  col: NativeProps<HTMLTableColElement>;
  /** Group of table columns */
  colgroup: NativeProps<HTMLTableColElement>;
  /** Data table */
  table: NativeProps<HTMLTableElement>;
  /** Table body section */
  tbody: NativeProps<HTMLTableSectionElement>;
  /** Table data cell */
  td: NativeProps<HTMLTableCellElement>;
  /** Table footer section */
  tfoot: NativeProps<HTMLTableSectionElement>;
  /** Table header cell */
  th: NativeProps<HTMLTableCellElement>;
  /** Table header section */
  thead: NativeProps<HTMLTableSectionElement>;
  /** Table row */
  tr: NativeProps<HTMLTableRowElement>;

  // Media
  /** Clickable area within an image map */
  area: NativeProps<HTMLAreaElement>;
  /** Audio content with playback controls */
  audio: NativeProps<HTMLAudioElement>;
  /** Image element */
  img: NativeProps<HTMLImageElement>;
  /** Image map with clickable areas */
  map: NativeProps<HTMLMapElement>;
  /** Text track for media elements (subtitles, captions) */
  track: NativeProps<HTMLTrackElement>;
  /** Video content with playback controls */
  video: NativeProps<HTMLVideoElement>;
  /** Container for responsive image sources */
  picture: NativeProps<HTMLElement>;
  /** Media source for picture, audio, or video */
  source: NativeProps<HTMLSourceElement>;

  // Embedded
  /** External content plugin (deprecated) */
  embed: NativeProps<HTMLEmbedElement>;
  /** External resource container (deprecated) */
  object: NativeProps<HTMLObjectElement>;
  /** Parameter for object element (deprecated) */
  param: NativeProps<HTMLParamElement>;

  // Misc
  /** Placeholder for distributed content in shadow DOM */
  slot: NativeProps<HTMLSlotElement>;
}

// ─── SVG Intrinsic Elements ─────────────────────────────────

/**
 * SVG intrinsic elements for JSX.
 * Maps SVG element names to their native DOM types with JSX-specific props.
 */
export interface SinwanSVGElements {
  /** Root SVG container element */
  svg: NativeProps<SVGSVGElement>;
  /** Animate element values over time */
  animate: NativeProps<SVGAnimateElement>;
  /** Animate element along a motion path */
  animateMotion: NativeProps<SVGAnimateMotionElement>;
  /** Animate transformation attributes */
  animateTransform: NativeProps<SVGAnimateTransformElement>;
  /** Circle shape */
  circle: NativeProps<SVGCircleElement>;
  /** Clipping path for masking content */
  clipPath: NativeProps<SVGClipPathElement>;
  /** Container for reusable elements */
  defs: NativeProps<SVGDefsElement>;
  /** Accessible description for SVG content */
  desc: NativeProps<SVGDescElement>;
  /** Ellipse shape */
  ellipse: NativeProps<SVGEllipseElement>;
  /** Filter primitive for blending images */
  feBlend: NativeProps<SVGFEBlendElement>;
  /** Filter primitive for color matrix transformations */
  feColorMatrix: NativeProps<SVGFEColorMatrixElement>;
  /** Filter primitive for component-wise remapping */
  feComponentTransfer: NativeProps<SVGFEComponentTransferElement>;
  /** Filter primitive for combining images */
  feComposite: NativeProps<SVGFECompositeElement>;
  /** Filter primitive for matrix convolution */
  feConvolveMatrix: NativeProps<SVGFEConvolveMatrixElement>;
  /** Filter primitive for diffuse lighting effect */
  feDiffuseLighting: NativeProps<SVGFEDiffuseLightingElement>;
  /** Filter primitive for displacement mapping */
  feDisplacementMap: NativeProps<SVGFEDisplacementMapElement>;
  /** Filter light source from distant direction */
  feDistantLight: NativeProps<SVGFEDistantLightElement>;
  /** Filter primitive for drop shadow effect */
  feDropShadow: NativeProps<SVGFEDropShadowElement>;
  /** Filter primitive for flood fill */
  feFlood: NativeProps<SVGFEFloodElement>;
  /** Transfer function for alpha channel */
  feFuncA: NativeProps<SVGFEFuncAElement>;
  /** Transfer function for blue channel */
  feFuncB: NativeProps<SVGFEFuncBElement>;
  /** Transfer function for green channel */
  feFuncG: NativeProps<SVGFEFuncGElement>;
  /** Transfer function for red channel */
  feFuncR: NativeProps<SVGFEFuncRElement>;
  /** Filter primitive for Gaussian blur */
  feGaussianBlur: NativeProps<SVGFEGaussianBlurElement>;
  /** Filter primitive for fetching external image */
  feImage: NativeProps<SVGFEImageElement>;
  /** Filter primitive for compositing layers */
  feMerge: NativeProps<SVGFEMergeElement>;
  /** Layer within feMerge composition */
  feMergeNode: NativeProps<SVGFEMergeNodeElement>;
  /** Filter primitive for morphological operations */
  feMorphology: NativeProps<SVGFEMorphologyElement>;
  /** Filter primitive for offset positioning */
  feOffset: NativeProps<SVGFEOffsetElement>;
  /** Filter light source from a point */
  fePointLight: NativeProps<SVGFEPointLightElement>;
  /** Filter primitive for specular lighting effect */
  feSpecularLighting: NativeProps<SVGFESpecularLightingElement>;
  /** Filter light source as a spotlight */
  feSpotLight: NativeProps<SVGFESpotLightElement>;
  /** Filter primitive for tiling patterns */
  feTile: NativeProps<SVGFETileElement>;
  /** Filter primitive for turbulence/noise generation */
  feTurbulence: NativeProps<SVGFETurbulenceElement>;
  /** Container for filter primitives */
  filter: NativeProps<SVGFilterElement>;
  /** Container for non-SVG content (HTML) */
  foreignObject: NativeProps<SVGForeignObjectElement>;
  /** Group container for other SVG elements */
  g: NativeProps<SVGGElement>;
  /** Embedded raster image */
  image: NativeProps<SVGImageElement>;
  /** Line shape between two points */
  line: NativeProps<SVGLineElement>;
  /** Linear gradient fill definition */
  linearGradient: NativeProps<SVGLinearGradientElement>;
  /** Marker symbol for line endpoints or vertices */
  marker: NativeProps<SVGMarkerElement>;
  /** Alpha mask for compositing */
  mask: NativeProps<SVGMaskElement>;
  /** Metadata container for SVG content */
  metadata: NativeProps<SVGMetadataElement>;
  /** Motion path reference for animateMotion */
  mpath: NativeProps<SVGMPathElement>;
  /** Arbitrary path shape */
  path: NativeProps<SVGPathElement>;
  /** Repeating pattern fill definition */
  pattern: NativeProps<SVGPatternElement>;
  /** Closed polygon shape */
  polygon: NativeProps<SVGPolygonElement>;
  /** Open polyline shape */
  polyline: NativeProps<SVGPolylineElement>;
  /** Radial gradient fill definition */
  radialGradient: NativeProps<SVGRadialGradientElement>;
  /** Rectangle shape */
  rect: NativeProps<SVGRectElement>;
  /** Script element within SVG namespace */
  svgScript: NativeProps<SVGScriptElement>;
  /** Set attribute value at specific time */
  set: NativeProps<SVGSetElement>;
  /** Gradient color stop */
  stop: NativeProps<SVGStopElement>;
  /** Style element within SVG namespace */
  svgStyle: NativeProps<SVGStyleElement>;
  /** Conditional processing container */
  switch: NativeProps<SVGSwitchElement>;
  /** Reusable graphic symbol definition */
  symbol: NativeProps<SVGSymbolElement>;
  /** Text content element */
  text: NativeProps<SVGTextElement>;
  /** Text along a path */
  textPath: NativeProps<SVGTextPathElement>;
  /** Text span for styling substrings */
  tspan: NativeProps<SVGTSpanElement>;
  /** Accessible title for SVG content */
  svgTitle: NativeProps<SVGTitleElement>;
  /** Reference to a reusable element */
  use: NativeProps<SVGUseElement>;
  /** Named view of the SVG document */
  view: NativeProps<SVGViewElement>;
}

// ─── JSX Namespace ──────────────────────────────────────────

declare global {
  namespace JSX {
    type Element = SinwanNode;
    interface IntrinsicAttributes {
      key?: string | number;
      ref?: unknown;
    }
    interface ElementChildrenAttribute {
      children: {};
    }
    interface IntrinsicElements
      extends SinwanIntrinsicElements, SinwanSVGElements {}
  }
}
