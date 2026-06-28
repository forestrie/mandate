import { loginWithMockPrivy, test } from '../../fixtures/app.js';

test('email OTP login shows embedded wallet badge', async ({ consolePage: page }) => {
	await loginWithMockPrivy(page);
});
