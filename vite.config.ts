import { defineConfig } from "vite-plus";

export default defineConfig({
	staged: {
		"*": "vp check --fix",
	},
	pack: {
		entry: ["src/index.ts", "src/bin.ts"],
		dts: {
			tsgo: true,
		},
		exports: true,
	},
	lint: {
		options: {
			typeAware: true,
			typeCheck: true,
		},
	},
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: "unit",
					include: ["src/**/*.test.ts"],
				},
			},
			{
				extends: true,
				test: {
					name: "e2e",
					include: ["e2e/**/*.test.ts"],
					globalSetup: ["./e2e/global-setup.ts"],
				},
			},
		],
	},
	fmt: {
		tabWidth: 4,
		useTabs: true,
		trailingComma: "all",
		sortImports: {
			groups: [
				"type-import",
				["value-builtin", "value-external"],
				"type-internal",
				"value-internal",
				["type-parent", "type-sibling", "type-index"],
				["value-parent", "value-sibling", "value-index"],
				"unknown",
			],
		},
	},
});
