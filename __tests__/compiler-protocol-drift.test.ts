import { describe, it, expect } from "bun:test";
import { DEFAULT_TEMPLATE_SLOT_PROTOCOL } from "../src/renderer/template-protocol.ts";
import { COMPILER_TEMPLATE_SLOT_PROTOCOL } from "../../sinwan-compiler/src/transform.ts";

/**
 * Guards against drift between the compiler's slot-marker format and the
 * runtime's `DEFAULT_TEMPLATE_SLOT_PROTOCOL`. The compiler cannot import the
 * runtime (separate packages), so the format is duplicated in
 * `sinwan-compiler/src/transform.ts`. This test asserts the two stay in sync.
 */
describe("compiler ↔ runtime template slot protocol drift", () => {
  it("uses the same slot prefix", () => {
    expect(COMPILER_TEMPLATE_SLOT_PROTOCOL.slotPrefix).toBe(
      DEFAULT_TEMPLATE_SLOT_PROTOCOL.slotPrefix,
    );
  });

  it("encodes slot indices identically", () => {
    for (let i = 0; i < 10; i++) {
      expect(COMPILER_TEMPLATE_SLOT_PROTOCOL.encodeSlot(i)).toBe(
        DEFAULT_TEMPLATE_SLOT_PROTOCOL.encodeSlot(i),
      );
    }
  });

  it("decodes slot markers identically (string form)", () => {
    for (let i = 0; i < 10; i++) {
      const encoded = COMPILER_TEMPLATE_SLOT_PROTOCOL.encodeSlot(i);
      expect(COMPILER_TEMPLATE_SLOT_PROTOCOL.decodeSlot(encoded)).toBe(i);
      // The runtime decodeSlot takes a Comment; verify the data string form
      // matches by feeding the same data through both decoders.
      expect(
        DEFAULT_TEMPLATE_SLOT_PROTOCOL.decodeSlot({
          data: encoded,
        } as unknown as Comment),
      ).toBe(i);
    }
  });

  it("both reject non-slot data", () => {
    expect(COMPILER_TEMPLATE_SLOT_PROTOCOL.decodeSlot("not-a-slot")).toBeNull();
    expect(
      DEFAULT_TEMPLATE_SLOT_PROTOCOL.decodeSlot({
        data: "not-a-slot",
      } as unknown as Comment),
    ).toBeNull();
  });
});
