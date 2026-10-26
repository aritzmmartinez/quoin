const ASSET_CODE = /^[A-Z0-9]+$/;
const ISIN_SHAPE = /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/;

export function cryptoInstrumentId(code: string): string | null {
  return ASSET_CODE.test(code) && !ISIN_SHAPE.test(code) ? code : null;
}
