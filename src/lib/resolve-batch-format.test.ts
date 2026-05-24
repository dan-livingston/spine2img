import { resolveBatchFormat } from "#/lib/resolve-batch-format.ts";
import { expect, test } from "vite-plus/test";

test("resolveBatchFormat defaults to APNG when no format is given", () => {
	expect(resolveBatchFormat()).toBe("apng");
	expect(resolveBatchFormat(undefined)).toBe("apng");
});

test("resolveBatchFormat honors an explicit format", () => {
	expect(resolveBatchFormat("webp")).toBe("webp");
	expect(resolveBatchFormat("apng")).toBe("apng");
});
