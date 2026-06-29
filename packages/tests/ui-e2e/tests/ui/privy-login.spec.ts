import { loginWithMockPrivy, test } from '@forestrie/mandate-ui-e2e-kit';

test('email OTP login shows embedded wallet badge', async ({ consolePage }) => {
	await loginWithMockPrivy(consolePage);
});
