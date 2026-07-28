import prettier from 'eslint-config-prettier';
import path from 'node:path';
import { includeIgnoreFile } from '@eslint/compat';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './packages/apps/ui/svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
			// cbor-x is BANNED (standing platform rule): it is a JavaScript
			// round-tripping serializer whose defaults (record extensions,
			// tag 259 Maps, tag 64 Uint8Array) are CBOR/COSE-incompatible and
			// have repeatedly produced wire bugs against canopy's strict
			// deterministic decoder. Use @forestrie/encoding.
			'no-restricted-imports': [
				'error',
				{
					paths: [
						{
							name: 'cbor-x',
							message:
								'cbor-x is banned: COSE-incompatible encoding defaults. Use @forestrie/encoding (encodeCborDeterministic / decodeCborDeterministic).'
						}
					]
				}
			]
		}
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig
			}
		}
	},
	{
		ignores: [
			'**/worker-configuration.d.ts',
			'**/.svelte-kit/**',
			'**/node_modules/**',
			'**/build/**'
		]
	}
);
