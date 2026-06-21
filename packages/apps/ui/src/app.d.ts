import type { CoordinatorAuthStrategy } from '$lib/auth/coordinator-auth.js';

declare global {
	namespace App {
		interface Platform {
			env: Env;
			ctx: ExecutionContext;
			caches: CacheStorage;
			cf?: IncomingRequestCfProperties;
		}

		interface Locals {
			coordinatorAuth: CoordinatorAuthStrategy;
		}
	}
}

export {};
