// Unit conversion for stocktake.
// Jonny may want to count salsa verde in g when the canonical unit is kg,
// or marinated chicken in pcs. This module enumerates which alternative
// units are legal for each canonical unit, and converts between them.
//
// Scope is intentionally tight: only same-family conversions (weight, volume,
// piece). Cross-family conversions (e.g., 1 case of chicken = 10 kg) require
// ingredient-level pack metadata and aren't supported here — that's a Phase 5
// extension if Jonny needs it.

export type Unit =
  | "g"
  | "kg"
  | "ml"
  | "L"
  | "pcs"
  | "ea"
  | "bunch"
  | "egg"
  | "roll"
  | "case"
  | "pack"
  | "box"
  | "bag";

interface Family {
  members: Partial<Record<Unit, number>>; // multiplier to canonical
  canonical: Unit;
}

const WEIGHT_KG: Family = { canonical: "kg", members: { kg: 1, g: 0.001 } };
const WEIGHT_G: Family = { canonical: "g", members: { g: 1, kg: 1000 } };
const VOLUME_L: Family = { canonical: "L", members: { L: 1, ml: 0.001 } };
const VOLUME_ML: Family = { canonical: "ml", members: { ml: 1, L: 1000 } };
const PIECE: Family = { canonical: "pcs", members: { pcs: 1, ea: 1 } };

function familyFor(canonical: string): Family | null {
  switch (canonical) {
    case "kg":
      return WEIGHT_KG;
    case "g":
      return WEIGHT_G;
    case "L":
      return VOLUME_L;
    case "ml":
      return VOLUME_ML;
    case "pcs":
    case "ea":
      return PIECE;
    default:
      return null;
  }
}

/**
 * List the units Jonny can pick when counting an item whose canonical
 * unit is `canonical`. Always includes the canonical unit itself.
 */
export function unitOptionsFor(canonical: string): Unit[] {
  const fam = familyFor(canonical);
  if (!fam) return [canonical as Unit];
  return Object.keys(fam.members) as Unit[];
}

/**
 * Convert `qty` from `inputUnit` to `canonical`. Returns null when the
 * conversion isn't supported (cross-family or unknown unit).
 */
export function toCanonical(
  qty: number,
  inputUnit: string,
  canonical: string,
): number | null {
  if (!Number.isFinite(qty)) return null;
  if (inputUnit === canonical) return qty;
  const fam = familyFor(canonical);
  if (!fam) return null;
  const mult = fam.members[inputUnit as Unit];
  if (mult == null) return null;
  return qty * mult;
}

/** Format a qty + unit for display, trimming trailing zeros. */
export function fmtQtyUnit(qty: number | null | undefined, unit: string): string {
  if (qty == null || !Number.isFinite(qty)) return `— ${unit}`;
  const trimmed =
    Math.abs(qty) < 0.01 && qty !== 0
      ? qty.toFixed(3)
      : qty.toFixed(qty % 1 === 0 ? 0 : 2);
  return `${trimmed} ${unit}`;
}
