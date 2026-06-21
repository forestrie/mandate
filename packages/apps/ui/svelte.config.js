import adapterCloudflare from '@sveltejs/adapter-cloudflare';
import adapterStatic from '@sveltejs/adapter-static';
import adapterVercel from '@sveltejs/adapter-vercel';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	compilerOptions: {
		runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
	},
	kit: {
		adapter: selectAdapter()
	}
};

function selectAdapter() {
	const choice = process.env.ADAPTER ?? 'cloudflare';
	switch (choice) {
		case 'vercel':
			return adapterVercel();
		case 'static':
			return adapterStatic({ fallback: 'index.html' });
		case 'cloudflare':
		default:
			return adapterCloudflare();
	}
}

export default config;
