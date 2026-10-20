import { registerControlFlowFactory } from "../../registry.ts";
import {
  Visible as VisibleFactory,
  expandVisibleElement,
} from "./factory.ts";

export { expandVisibleElement, type VisibleProps } from "./factory.ts";

/** Same function as the shared factory; importing it keeps this registration. */
export const Visible: typeof VisibleFactory = VisibleFactory;

registerControlFlowFactory(Visible, expandVisibleElement);
