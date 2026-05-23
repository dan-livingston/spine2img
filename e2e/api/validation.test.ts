import os from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";

import { importPackageApi } from "../helpers.ts";

test("packed package API validates viewport options before loading the scene", async () => {
	const packageApi = await importPackageApi();
	const unreadableSkeletonPath = path.join(os.tmpdir(), "spine2img-missing", "box.json");
	const unusedOutputPath = path.join(os.tmpdir(), "spine2img-never-written.apng");

	await expect(
		packageApi.renderSpine({
			outputPath: unusedOutputPath,
			skeletonPath: unreadableSkeletonPath,
			width: -5,
		}),
	).rejects.toThrow("width must be a positive integer. Received -5.");

	await expect(
		packageApi.renderSpine({
			height: 80.5,
			outputPath: unusedOutputPath,
			skeletonPath: unreadableSkeletonPath,
		}),
	).rejects.toThrow("height must be a positive integer. Received 80.5.");

	await expect(
		packageApi.renderSpine({
			backgroundColor: "red",
			outputPath: unusedOutputPath,
			skeletonPath: unreadableSkeletonPath,
		}),
	).rejects.toThrow(
		"backgroundColor must be a hex color like #rgb, #rgba, #rrggbb, or #rrggbbaa. Received red.",
	);
});

test("packed package API throws typed validation errors for incompatible encode options", async () => {
	const packageApi = await importPackageApi();
	const unreadableSkeletonPath = path.join(os.tmpdir(), "spine2img-missing", "box.json");
	const cases = [
		{
			code: "unsupported-lossy-output",
			options: {
				format: "apng" as const,
				lossless: false,
			},
		},
		{
			code: "unsupported-quality-output",
			options: {
				format: "apng" as const,
				quality: 80,
			},
		},
		{
			code: "unsupported-quality-output",
			options: {
				format: "webp" as const,
				quality: 80,
			},
		},
	];

	for (const [index, testCase] of cases.entries()) {
		let error: unknown;

		try {
			await packageApi.renderSpine({
				...testCase.options,
				outputPath: path.join(os.tmpdir(), `spine2img-invalid-encode-${index}.apng`),
				skeletonPath: unreadableSkeletonPath,
			});
		} catch (caught) {
			error = caught;
		}

		expect(error).toBeInstanceOf(packageApi.RenderOptionValidationError);
		expect(error).toMatchObject({
			code: testCase.code,
		});
	}
});
