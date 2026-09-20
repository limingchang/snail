/**
 * Watermark settings and the CSS/SVG they produce.
 *
 * Two requirements are pinned here because they are the ones the legacy/naive implementation
 * gets wrong:
 *
 * - **the angle is a real rotation of the glyphs**, not a `repeating-linear-gradient` (which
 *   rotates the gradient line and no text at all);
 * - **nothing is a CSS background**, because a browser may drop background images when
 *   printing and the user's "Background graphics" checkbox wins over `print-color-adjust`.
 */

import { describe, expect, it } from "vitest";

import { QR_CODE_Z_INDEX } from "../../src/extensions/qrcode/geometry";
import {
  estimateTextWidth,
  isWatermarkVisible,
  resolveWatermarkSettings,
  WATERMARK_DEFAULT_ANGLE,
  WATERMARK_DEFAULT_COLOR,
  WATERMARK_DEFAULT_FONT_SIZE,
  WATERMARK_DEFAULT_OPACITY,
  WATERMARK_GREY,
  WATERMARK_IMAGE_TILE_VIEW_BOX,
  WATERMARK_TILE_COLUMNS,
  WATERMARK_TILE_CLASS,
  WATERMARK_TILE_ROWS,
  watermarkContainerDeclarations,
  watermarkFontSizePx,
  watermarkMarkDeclarations,
  watermarkSettingsEqual,
  watermarkTileImageAttributes,
  watermarkTileSvgAttributes,
  watermarkTileTextAttributes
} from "../../src/extensions/watermark/settings";
import { WATERMARK_Z_INDEX } from "../../src/extensions/watermark/typing";

/** A configured, visible text watermark. */
function textSettings(overrides: Record<string, unknown> = {}) {
  return resolveWatermarkSettings({ enabled: true, text: "机密", ...overrides });
}

describe("resolving the settings", () => {
  it("is a complete configuration from nothing at all", () => {
    const settings = resolveWatermarkSettings(undefined);
    expect(settings).toStrictEqual({
      enabled: false,
      text: "",
      imageSrc: "",
      angle: WATERMARK_DEFAULT_ANGLE,
      opacity: WATERMARK_DEFAULT_OPACITY,
      greyscale: false,
      tiled: false,
      fontSize: WATERMARK_DEFAULT_FONT_SIZE,
      color: WATERMARK_DEFAULT_COLOR
    });
  });

  it("defaults to disabled, so no editor shows a watermark nobody asked for", () => {
    expect(resolveWatermarkSettings({ text: "机密" }).enabled).toBe(false);
  });

  it("falls back from an angle that would invalidate the transform", () => {
    // `rotate(NaNdeg)` silently invalidates the whole declaration, leaving the mark un-rotated.
    expect(resolveWatermarkSettings({ angle: Number.NaN }).angle).toBe(WATERMARK_DEFAULT_ANGLE);
    expect(resolveWatermarkSettings({ angle: Number.POSITIVE_INFINITY }).angle).toBe(
      WATERMARK_DEFAULT_ANGLE
    );
    expect(resolveWatermarkSettings({ angle: -45 }).angle).toBe(-45);
  });

  it("clamps opacity into 0…1", () => {
    expect(resolveWatermarkSettings({ opacity: 2 }).opacity).toBe(1);
    expect(resolveWatermarkSettings({ opacity: -1 }).opacity).toBe(0);
    expect(resolveWatermarkSettings({ opacity: 0.5 }).opacity).toBe(0.5);
    expect(resolveWatermarkSettings({ opacity: Number.NaN }).opacity).toBe(WATERMARK_DEFAULT_OPACITY);
  });

  it("ignores an empty font size or colour", () => {
    expect(resolveWatermarkSettings({ fontSize: "" }).fontSize).toBe(WATERMARK_DEFAULT_FONT_SIZE);
    expect(resolveWatermarkSettings({ color: "" }).color).toBe(WATERMARK_DEFAULT_COLOR);
  });

  it("reads both a text mark and an image mark", () => {
    expect(resolveWatermarkSettings({ text: "DRAFT" }).text).toBe("DRAFT");
    expect(resolveWatermarkSettings({ imageSrc: "data:image/png;base64,A" }).imageSrc).toBe(
      "data:image/png;base64,A"
    );
  });

  it("compares two settings by every field", () => {
    const base = resolveWatermarkSettings({ enabled: true, text: "机密" });
    expect(watermarkSettingsEqual(base, resolveWatermarkSettings({ enabled: true, text: "机密" }))).toBe(
      true
    );
    expect(watermarkSettingsEqual(base, resolveWatermarkSettings({ enabled: true, text: "绝密" }))).toBe(
      false
    );
    expect(watermarkSettingsEqual(base, resolveWatermarkSettings({ text: "机密" }))).toBe(false);
  });
});

describe("when there is something to draw", () => {
  it("is false while disabled", () => {
    expect(isWatermarkVisible(resolveWatermarkSettings({ text: "机密" }))).toBe(false);
  });

  it("is false for an enabled but empty mark", () => {
    // Otherwise every page would get an invisible overlay.
    expect(isWatermarkVisible(resolveWatermarkSettings({ enabled: true }))).toBe(false);
    expect(isWatermarkVisible(resolveWatermarkSettings({ enabled: true, text: "" }))).toBe(false);
  });

  it("is true for either kind of mark", () => {
    expect(isWatermarkVisible(textSettings())).toBe(true);
    expect(isWatermarkVisible(resolveWatermarkSettings({ enabled: true, imageSrc: "x.png" }))).toBe(true);
  });
});

describe("the overlay", () => {
  it("never intercepts a click, and never takes part in a selection", () => {
    const declarations = watermarkContainerDeclarations(textSettings());
    expect(declarations["pointer-events"]).toBe("none");
    expect(declarations["user-select"]).toBe("none");
  });

  it("covers the page it is attached to", () => {
    const declarations = watermarkContainerDeclarations(textSettings());
    expect(declarations.position).toBe("absolute");
    expect(declarations.inset).toBe("0");
  });

  it("paints above the QR code", () => {
    const declarations = watermarkContainerDeclarations(textSettings());
    expect(declarations["z-index"]).toBe(String(WATERMARK_Z_INDEX));
    expect(WATERMARK_Z_INDEX).toBeGreaterThan(QR_CODE_Z_INDEX);
  });

  it("sets print-color-adjust as a belt-and-braces measure, on a real element", () => {
    const declarations = watermarkContainerDeclarations(textSettings());
    expect(declarations["print-color-adjust"]).toBe("exact");
    expect(declarations["-webkit-print-color-adjust"]).toBe("exact");
  });

  it("tiles with a grid of real elements, not with a CSS background", () => {
    const tiled = watermarkContainerDeclarations(textSettings({ tiled: true }));
    expect(tiled.display).toBe("grid");
    expect(tiled["grid-template-columns"]).toBe(`repeat(${WATERMARK_TILE_COLUMNS}, 1fr)`);
    expect(tiled["grid-template-rows"]).toBe(`repeat(${WATERMARK_TILE_ROWS}, 1fr)`);

    const single = watermarkContainerDeclarations(textSettings());
    expect(single.display).toBeUndefined();
    // Nothing anywhere may be a `background-image`.
    expect(JSON.stringify(single)).not.toContain("background");
    expect(JSON.stringify(tiled)).not.toContain("background");
  });
});

describe("the single mark", () => {
  it("rotates the mark itself", () => {
    const declarations = watermarkMarkDeclarations(textSettings({ angle: -30 }));
    expect(declarations.transform).toBe("translate(-50%, -50%) rotate(-30deg)");
    // The gradient shortcut rotates the gradient line and no glyphs at all.
    expect(JSON.stringify(declarations)).not.toContain("gradient");
  });

  it("rotates about the mark's own centre, after it is centred", () => {
    const declarations = watermarkMarkDeclarations(textSettings());
    // Translate first, rotate second: the other order swings the mark off the sheet.
    expect(declarations.transform?.indexOf("translate")).toBe(0);
    expect(declarations["transform-origin"]).toBe("center");
  });

  it("carries opacity, font size and colour", () => {
    const declarations = watermarkMarkDeclarations(textSettings({ opacity: 0.2, fontSize: "64px" }));
    expect(declarations.opacity).toBe("0.2");
    expect(declarations["font-size"]).toBe("64px");
    expect(declarations.color).toBe(WATERMARK_DEFAULT_COLOR);
    expect(declarations["white-space"]).toBe("nowrap");
  });

  it("draws in a light solid grey for a greyscale text mark", () => {
    const declarations = watermarkMarkDeclarations(textSettings({ greyscale: true }));
    expect(declarations.color).toBe(WATERMARK_GREY);
    // A solid grey rather than a near-invisible black: opacity prints least predictably.
  });

  it("fits an image mark and greyscales it with a filter", () => {
    const declarations = watermarkMarkDeclarations(
      resolveWatermarkSettings({ enabled: true, imageSrc: "seal.png", greyscale: true })
    );
    expect(declarations["max-width"]).toBe("80%");
    expect(declarations["object-fit"]).toBe("contain");
    expect(declarations.filter).toBe("grayscale(1)");
    expect(declarations.color).toBeUndefined();
  });
});

describe("tiles", () => {
  it("sizes a text tile's viewBox from the text", () => {
    const svg = watermarkTileSvgAttributes(textSettings());
    expect(svg.viewBox).toMatch(/^0 0 \d+(\.\d+)? \d+(\.\d+)?$/);
    expect(svg.preserveAspectRatio).toBe("xMidYMid meet");
    expect(svg.class).toBe(WATERMARK_TILE_CLASS);
    expect(svg["aria-hidden"]).toBe("true");
  });

  it("uses a fixed viewBox for an image tile", () => {
    expect(
      watermarkTileSvgAttributes(resolveWatermarkSettings({ enabled: true, imageSrc: "seal.png" }))
        .viewBox
    ).toBe(WATERMARK_IMAGE_TILE_VIEW_BOX);
  });

  it("rotates the tile's text about the tile's centre", () => {
    const text = watermarkTileTextAttributes(textSettings({ angle: -30 }));
    expect(text.transform).toMatch(/^rotate\(-30 [\d.]+ [\d.]+\)$/);
    expect(text["text-anchor"]).toBe("middle");
    expect(text["dominant-baseline"]).toBe("central");
    expect(text.fill).toBe(WATERMARK_DEFAULT_COLOR);
    expect(text["fill-opacity"]).toBe("0.12");
    expect(JSON.stringify(text)).not.toContain("gradient");
  });

  it("greyscales a tile without a filter, because it is already a solid fill", () => {
    expect(watermarkTileTextAttributes(textSettings({ greyscale: true })).fill).toBe(WATERMARK_GREY);
  });

  it("points an image tile at the source and rotates it too", () => {
    const image = watermarkTileImageAttributes(
      resolveWatermarkSettings({ enabled: true, imageSrc: "seal.png", angle: -45 })
    );
    expect(image.href).toBe("seal.png");
    expect(image.transform).toBe("rotate(-45 50 30)");
    expect(image.filter).toBeUndefined();
  });
});

describe("font size and width estimation", () => {
  it("reads a pixel font size", () => {
    expect(watermarkFontSizePx(textSettings({ fontSize: "48px" }))).toBe(48);
    expect(watermarkFontSizePx(textSettings({ fontSize: "36" }))).toBe(36);
  });

  it("falls back for a unit it cannot place in an SVG user space", () => {
    expect(watermarkFontSizePx(textSettings({ fontSize: "2rem" }))).toBe(
      Number.parseFloat(WATERMARK_DEFAULT_FONT_SIZE)
    );
    expect(watermarkFontSizePx(textSettings({ fontSize: "larger" }))).toBe(
      Number.parseFloat(WATERMARK_DEFAULT_FONT_SIZE)
    );
  });

  it("estimates a full-width glyph as wider than a Latin one", () => {
    expect(estimateTextWidth("合同", 48)).toBeGreaterThan(estimateTextWidth("ab", 48));
  });

  it("never estimates less than one em, so a single character still has a tile", () => {
    expect(estimateTextWidth("", 48)).toBe(48);
    expect(estimateTextWidth("i", 48)).toBe(48);
  });
});
