import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import { importPackageApi } from "../helpers.ts";

test("built package API validates viewport options before loading the scene", async () => {
	const packageApi = await importPackageApi();
	const unreadableSkeletonPath = path.join(os.tmpdir(), "spine2img-missing", "box.json");
	const unusedOutputPath = path.join(os.tmpdir(), "spine2img-never-written.apng");

	await expect(
		packageApi.renderSpineToApng({
			outputPath: unusedOutputPath,
			skeletonPath: unreadableSkeletonPath,
			width: -5,
		}),
	).rejects.toThrow("width must be a positive integer. Received -5.");

	await expect(
		packageApi.renderSpineToApng({
			height: 80.5,
			outputPath: unusedOutputPath,
			skeletonPath: unreadableSkeletonPath,
		}),
	).rejects.toThrow("height must be a positive integer. Received 80.5.");

	await expect(
		packageApi.renderSpineToApng({
			backgroundColor: "red",
			outputPath: unusedOutputPath,
			skeletonPath: unreadableSkeletonPath,
		}),
	).rejects.toThrow(
		"backgroundColor must be a hex color like #rgb, #rgba, #rrggbb, or #rrggbbaa. Received red.",
	);
});
