import { describe, it, expect } from "bun:test";
import { DEFAULT_TEMPLATE_SLOT_PROTOCOL } from "../src/renderer/template-protocol.ts";

/**
 * Guards against drift between the compiler's slot-marker format and the
 * runtime's `DEFAULT_TEMPLATE_SLOT_PROTOCOL`. The compiler cannot import the
 * runtime (separate packages), so the format is duplicated in
 * `sinwan-compiler/src/transform.ts`. This test asserts the two stay in sync.
 *
 * The compiler source lives in a sibling package (`sinwan-compiler/`) which is
 * only available in the local monorepo. On CI (standalone repo checkout) the
 * import fails, so the suite skips gracefully.
 */
const COMPILER_PATH = "../../sinwan-compiler/src/transform.ts";

let COMPILER_TEMPLATE_SLOT_PROTOCOL: {
  slotPrefix: string;
  encodeSlot(index: number): string;
  decodeSlot(data: string): number | null;
} | null = null;

try {
  // Use require to avoid a top-level import that breaks CI typecheck.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  COMPILER_TEMPLATE_SLOT_PROTOCOL =
    require(COMPILER_PATH).COMPILER_TEMPLATE_SLOT_PROTOCOL ?? null;
} catch {
  COMPILER_TEMPLATE_SLOT_PROTOCOL = null;
}

const itIfCompiler = COMPILER_TEMPLATE_SLOT_PROTOCOL ? it : it.skip;

describe("compiler ↔ runtime template slot protocol drift", () => {
  itIfCompiler("uses the same slot prefix", () => {
    expect(COMPILER_TEMPLATE_SLOT_PROTOCOL!.slotPrefix).toBe(
      DEFAULT_TEMPLATE_SLOT_PROTOCOL.slotPrefix,
    );
  });

  itIfCompiler("encodes slot indices identically", () => {
    for (let i = 0; i < 10; i++) {
      expect(COMPILER_TEMPLATE_SLOT_PROTOCOL!.encodeSlot(i)).toBe(
        DEFAULT_TEMPLATE_SLOT_PROTOCOL.encodeSlot(i),
      );
    }
  });

  itIfCompiler("decodes slot markers identically (string form)", () => {
    for (let i = 0; i < 10; i++) {
      const encoded = COMPILER_TEMPLATE_SLOT_PROTOCOL!.encodeSlot(i);
      expect(COMPILER_TEMPLATE_SLOT_PROTOCOL!.decodeSlot(encoded)).toBe(i);
      // The runtime decodeSlot takes a Comment; verify the data string form
      // matches by feeding the same data through both decoders.
      expect(
        DEFAULT_TEMPLATE_SLOT_PROTOCOL.decodeSlot({
          data: encoded,
        } as unknown as Comment),
      ).toBe(i);
    }
  });

  itIfCompiler("both reject non-slot data", () => {
    expect(
      COMPILER_TEMPLATE_SLOT_PROTOCOL!.decodeSlot("not-a-slot"),
    ).toBeNull();
    expect(
      DEFAULT_TEMPLATE_SLOT_PROTOCOL.decodeSlot({
        data: "not-a-slot",
      } as unknown as Comment),
    ).toBeNull();
  });
});
